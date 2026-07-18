import { describe, it, expect } from "vitest";
import { isLlmConfigured, makeFailoverProvider } from "../factory.js";
import { FailoverProvider } from "../failover.js";

// The test env loads the root .env (OPENAI_API_KEY present), so at least one
// provider is configured.
describe("llm factory", () => {
  it("reports the LLM as configured", () => {
    expect(isLlmConfigured()).toBe(true);
  });

  it("builds a per-request FailoverProvider carrying a correlation id", () => {
    const p = makeFailoverProvider("cid-abc");
    expect(p).toBeInstanceOf(FailoverProvider);
    expect(p.lastUsed).toBe(""); // nothing served yet
  });
});
