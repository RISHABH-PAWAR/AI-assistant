import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { createChatRouter, type ChatRouterDeps } from "../chat.js";
import { InMemorySessionStore } from "../../session/store.js";
import { LlmUnavailableError } from "../../middleware/errors.js";
import { createAgentRunner, type AgentRunner } from "../../agent/loop.js";
import { Store } from "../../domain/store.js";
import type { AssistantMessage, ChatMessage, LLMProvider } from "../../llm/types.js";

function buildApp(over: Partial<ChatRouterDeps> = {}) {
  const sessions = over.sessions ?? new InMemorySessionStore();
  const deps: ChatRouterDeps = {
    runAgent: async () => ({ reply: "ok", toolTrace: [] }),
    sessions,
    makeProvider: () => ({ name: "fake", async createChatCompletion() {
      return { role: "assistant", content: "x" };
    } }),
    today: () => "2026-07-13",
    buildSystemPrompt: (t) => `system ${t}`,
    ...over,
  };
  const app = createApp({ apiRouter: createChatRouter(deps), llmReady: () => true });
  return { app, sessions };
}

function scripted(script: AssistantMessage[]): LLMProvider & { lastUsed: string } {
  let i = 0;
  return {
    name: "scripted",
    lastUsed: "scripted",
    async createChatCompletion(): Promise<AssistantMessage> {
      return script[i++] ?? { role: "assistant", content: "(done)" };
    },
  };
}

describe("POST /api/chat", () => {
  it("returns a reply and toolTrace on the happy path", async () => {
    const { app } = buildApp({
      runAgent: async () => ({ reply: "Hello!", toolTrace: [{ name: "get_available_slots", ok: true }] }),
    });
    const res = await request(app).post("/api/chat").send({ sessionId: "s1", message: "hi" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: "Hello!", toolTrace: [{ name: "get_available_slots", ok: true }] });
  });

  it("seeds a new session with a system prompt and appends the user message", async () => {
    let seen: ChatMessage[] = [];
    const runAgent: AgentRunner = async ({ history }) => {
      seen = [...history];
      return { reply: "ok", toolTrace: [] };
    };
    const { app } = buildApp({ runAgent });
    await request(app).post("/api/chat").send({ sessionId: "s1", message: "hello" });
    expect(seen[0]).toMatchObject({ role: "system", content: "system 2026-07-13" });
    expect(seen.at(-1)).toMatchObject({ role: "user", content: "hello" });
  });

  it("maintains session continuity across turns", async () => {
    let seen: ChatMessage[] = [];
    const runAgent: AgentRunner = async ({ history }) => {
      seen = [...history];
      return { reply: "ok", toolTrace: [] };
    };
    const { app } = buildApp({ runAgent });
    await request(app).post("/api/chat").send({ sessionId: "s1", message: "first" });
    await request(app).post("/api/chat").send({ sessionId: "s1", message: "second" });
    const userMsgs = seen.filter((m) => m.role === "user").map((m) => m.content);
    expect(userMsgs).toEqual(["first", "second"]);
  });

  it("isolates different sessions", async () => {
    let seen: ChatMessage[] = [];
    const runAgent: AgentRunner = async ({ history }) => {
      seen = [...history];
      return { reply: "ok", toolTrace: [] };
    };
    const { app } = buildApp({ runAgent });
    await request(app).post("/api/chat").send({ sessionId: "a", message: "for-a" });
    await request(app).post("/api/chat").send({ sessionId: "b", message: "for-b" });
    const userMsgs = seen.filter((m) => m.role === "user").map((m) => m.content);
    expect(userMsgs).toEqual(["for-b"]); // session b is independent
  });

  it("rejects missing/empty fields with a 400 envelope", async () => {
    const { app } = buildApp();
    for (const body of [{}, { sessionId: "s" }, { message: "hi" }, { sessionId: "s", message: "   " }]) {
      const res = await request(app).post("/api/chat").send(body);
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    }
  });

  it("returns a 503 envelope when the LLM is unavailable (no stack leak)", async () => {
    const { app } = buildApp({
      runAgent: async () => {
        throw new LlmUnavailableError();
      },
    });
    const res = await request(app).post("/api/chat").send({ sessionId: "s1", message: "hi" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/unavailable/i);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at /i);
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const { app } = buildApp({
      runAgent: async () => {
        throw new Error("secret internal detail");
      },
    });
    const res = await request(app).post("/api/chat").send({ sessionId: "s1", message: "hi" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong. Please try again." });
  });

  it("drives a real booking end-to-end through the HTTP layer (scripted LLM)", async () => {
    const store = new Store(() => new Date("2026-07-13T09:00:00Z"));
    const slotId = store.getOpenSlotsByDate("2026-07-14")[0]!.id;
    const provider = scripted([
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_available_slots", arguments: JSON.stringify({ date: "2026-07-14" }) } }] },
      { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "book_appointment", arguments: JSON.stringify({ slotId, name: "Priya Rao", phone: "555-0142" }) } }] },
      { role: "assistant", content: "Booked for 09:00 on 2026-07-14." },
    ]);
    const { app } = buildApp({
      runAgent: createAgentRunner({ store, maxIters: 5 }),
      makeProvider: () => provider,
    });
    const res = await request(app).post("/api/chat").send({ sessionId: "s1", message: "book the 14th 9am, Priya Rao 555-0142" });
    expect(res.status).toBe(200);
    expect(res.body.reply).toContain("Booked");
    expect(res.body.toolTrace).toEqual([
      { name: "get_available_slots", ok: true },
      { name: "book_appointment", ok: true },
    ]);
    expect(store.getSlot(slotId)?.isBooked).toBe(true);
  });

  it("applies CORS for the configured origin", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("keeps sessions isolated under concurrent load (no state bleed)", async () => {
    // Echo the caller's own last user message so any cross-request bleed shows up.
    const runAgent: AgentRunner = async ({ history }) => {
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      // Simulate async work so requests genuinely overlap.
      await new Promise((r) => setTimeout(r, 5));
      return { reply: (lastUser?.content as string) ?? "", toolTrace: [] };
    };
    const { app } = buildApp({ runAgent });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app).post("/api/chat").send({ sessionId: `sess-${i}`, message: `msg-${i}` }),
      ),
    );
    results.forEach((res, i) => {
      expect(res.status).toBe(200);
      expect(res.body.reply).toBe(`msg-${i}`);
    });
  });
});
