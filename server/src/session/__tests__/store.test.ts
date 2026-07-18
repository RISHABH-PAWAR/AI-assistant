import { describe, it, expect } from "vitest";
import { InMemorySessionStore, capHistory } from "../store.js";
import type { ChatMessage } from "../../llm/types.js";

describe("InMemorySessionStore", () => {
  it("stores and retrieves history by id; unknown id is undefined", () => {
    const s = new InMemorySessionStore();
    expect(s.get("nope")).toBeUndefined();
    const h: ChatMessage[] = [{ role: "system", content: "s" }];
    s.set("a", h);
    expect(s.get("a")).toBe(h);
  });
});

describe("capHistory", () => {
  const sys: ChatMessage = { role: "system", content: "system" };

  it("returns history unchanged when within the cap", () => {
    const h: ChatMessage[] = [sys, { role: "user", content: "hi" }];
    expect(capHistory(h, 10)).toBe(h);
  });

  it("keeps the system prompt and trims oldest turns on a user boundary", () => {
    const h: ChatMessage[] = [
      sys,
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
    ];
    const capped = capHistory(h, 4);
    expect(capped[0]).toBe(sys);
    // Trimmed content must start on a user message (no orphaned assistant/tool).
    expect(capped[1]!.role).toBe("user");
    expect(capped.length).toBeLessThanOrEqual(4 + 1);
  });

  it("never leaves a leading orphan tool message", () => {
    const h: ChatMessage[] = [
      sys,
      { role: "user", content: "u1" },
      { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "x", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c", content: "{}" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ];
    const capped = capHistory(h, 3);
    expect(capped[0]).toBe(sys);
    expect(capped[1]!.role).toBe("user");
    expect(capped.some((m, i) => i > 0 && m.role === "tool" && capped[i - 1]?.role === "system")).toBe(false);
  });
});
