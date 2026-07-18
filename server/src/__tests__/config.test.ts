import { describe, it, expect } from "vitest";
import { __test } from "../config.js";

const { parseEnv } = __test;

describe("Phase 0 — config validation (fail-fast)", () => {
  it("accepts a valid env with only OpenAI", () => {
    const env = parseEnv({ OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv);
    expect(env.OPENAI_MODEL).toBe("gpt-4o-mini");
    expect(env.MAX_TOOL_ITERS).toBe(5);
  });

  it("accepts a valid env with only Groq", () => {
    const env = parseEnv({ GROQ_API_KEY: "gsk_test" } as NodeJS.ProcessEnv);
    expect(env.GROQ_MODEL).toBe("llama-3.3-70b-versatile");
  });

  it("throws when no provider key is present", () => {
    expect(() => parseEnv({} as NodeJS.ProcessEnv)).toThrowError(/At least one LLM provider key/);
  });

  it("coerces numeric knobs from strings", () => {
    const env = parseEnv({
      OPENAI_API_KEY: "sk-test",
      MAX_TOOL_ITERS: "7",
      LLM_TIMEOUT_MS: "1234",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.MAX_TOOL_ITERS).toBe(7);
    expect(env.LLM_TIMEOUT_MS).toBe(1234);
  });

  it("rejects an invalid LOG_LEVEL", () => {
    expect(() =>
      parseEnv({ OPENAI_API_KEY: "sk-test", LOG_LEVEL: "loud" } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/Invalid environment/);
  });
});
