import { describe, it, expect } from "vitest";
import { FailoverProvider, type FailoverConfig } from "../failover.js";
import { CircuitBreaker } from "../breaker.js";
import { LlmUnavailableError } from "../../middleware/errors.js";
import type { AssistantMessage, ChatRequest, LLMProvider } from "../types.js";

const REQ: ChatRequest = { messages: [{ role: "user", content: "hi" }], tools: [] };

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

interface Spy extends LLMProvider {
  calls: number;
}

/** Provider that succeeds, returning its own name as content. */
function okProvider(name: string): Spy {
  const p: Spy = {
    name,
    calls: 0,
    async createChatCompletion(): Promise<AssistantMessage> {
      p.calls += 1;
      return { role: "assistant", content: name };
    },
  };
  return p;
}

/** Provider that throws `error` for the first `failTimes` calls, then succeeds. */
function flakyProvider(name: string, failTimes: number, error: unknown): Spy {
  const p: Spy = {
    name,
    calls: 0,
    async createChatCompletion(): Promise<AssistantMessage> {
      p.calls += 1;
      if (p.calls <= failTimes) throw error;
      return { role: "assistant", content: name };
    },
  };
  return p;
}

/** Provider that always throws `error`. */
function failingProvider(name: string, error: unknown): Spy {
  const p: Spy = {
    name,
    calls: 0,
    async createChatCompletion(): Promise<AssistantMessage> {
      p.calls += 1;
      throw error;
    },
  };
  return p;
}

/** Provider that hangs until its abort signal fires (simulates a timeout). */
function hangingProvider(name: string): Spy {
  const p: Spy = {
    name,
    calls: 0,
    createChatCompletion(req: ChatRequest): Promise<AssistantMessage> {
      p.calls += 1;
      return new Promise((_resolve, reject) => {
        req.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    },
  };
  return p;
}

function cfg(over: Partial<FailoverConfig> = {}): FailoverConfig {
  return {
    timeoutMs: 50,
    maxRetries: 2,
    breaker: new CircuitBreaker(100, 1000, () => 0), // effectively disabled unless overridden
    baseBackoffMs: 1,
    sleep: async () => {},
    random: () => 0,
    ...over,
  };
}

describe("FailoverProvider", () => {
  it("uses the primary when it succeeds; fallback is never called", async () => {
    const openai = okProvider("openai");
    const groq = okProvider("groq");
    const fp = new FailoverProvider([openai, groq], cfg());
    const res = await fp.createChatCompletion(REQ);
    expect(res.content).toBe("openai");
    expect(fp.lastUsed).toBe("openai");
    expect(openai.calls).toBe(1);
    expect(groq.calls).toBe(0);
  });

  it("retries transient 5xx on the primary, then fails over to the fallback", async () => {
    const openai = failingProvider("openai", httpError(500));
    const groq = okProvider("groq");
    const fp = new FailoverProvider([openai, groq], cfg({ maxRetries: 2 }));
    const res = await fp.createChatCompletion(REQ);
    expect(res.content).toBe("groq");
    expect(fp.lastUsed).toBe("groq");
    expect(openai.calls).toBe(3); // 1 initial + 2 retries
    expect(groq.calls).toBe(1);
  });

  it("recovers on the primary if a retry succeeds (no failover)", async () => {
    const openai = flakyProvider("openai", 1, httpError(503));
    const groq = okProvider("groq");
    const fp = new FailoverProvider([openai, groq], cfg({ maxRetries: 2 }));
    const res = await fp.createChatCompletion(REQ);
    expect(res.content).toBe("openai");
    expect(openai.calls).toBe(2);
    expect(groq.calls).toBe(0);
  });

  it("does NOT retry a 429 — fails over immediately", async () => {
    const openai = failingProvider("openai", httpError(429));
    const groq = okProvider("groq");
    const fp = new FailoverProvider([openai, groq], cfg({ maxRetries: 3 }));
    const res = await fp.createChatCompletion(REQ);
    expect(res.content).toBe("groq");
    expect(openai.calls).toBe(1); // no retries on rate limit
  });

  it("times out a hanging provider and fails over", async () => {
    const openai = hangingProvider("openai");
    const groq = okProvider("groq");
    const fp = new FailoverProvider([openai, groq], cfg({ timeoutMs: 15, maxRetries: 1 }));
    const res = await fp.createChatCompletion(REQ);
    expect(res.content).toBe("groq");
    expect(openai.calls).toBe(2); // initial + 1 retry, both aborted
  });

  it("throws LlmUnavailableError when all providers are exhausted", async () => {
    const openai = failingProvider("openai", httpError(500));
    const groq = failingProvider("groq", httpError(500));
    const fp = new FailoverProvider([openai, groq], cfg({ maxRetries: 1 }));
    await expect(fp.createChatCompletion(REQ)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(openai.calls).toBe(2);
    expect(groq.calls).toBe(2);
  });

  it("skips a provider whose circuit is open", async () => {
    const breaker = new CircuitBreaker(1, 10_000, () => 0);
    breaker.recordFailure("openai"); // opens openai's circuit
    const openai = okProvider("openai");
    const groq = okProvider("groq");
    const fp = new FailoverProvider([openai, groq], cfg({ breaker }));
    const res = await fp.createChatCompletion(REQ);
    expect(res.content).toBe("groq");
    expect(openai.calls).toBe(0); // skipped entirely
  });

  it("opens the breaker after repeated primary failures across calls", async () => {
    const breaker = new CircuitBreaker(1, 10_000, () => 0);
    const openai = failingProvider("openai", httpError(500));
    const groq = okProvider("groq");
    const fp = new FailoverProvider([openai, groq], cfg({ breaker, maxRetries: 0 }));

    await fp.createChatCompletion(REQ); // primary fails once → breaker opens
    const before = openai.calls;
    await fp.createChatCompletion(REQ); // primary now skipped
    expect(openai.calls).toBe(before); // no further primary calls
    expect(breaker.isOpen("openai")).toBe(true);
  });

  it("requires at least one provider", () => {
    expect(() => new FailoverProvider([], cfg())).toThrow(/at least one/i);
  });
});
