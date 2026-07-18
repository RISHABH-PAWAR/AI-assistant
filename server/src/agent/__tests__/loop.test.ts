import { describe, it, expect } from "vitest";
import { createAgentRunner } from "../loop.js";
import { Store } from "../../domain/store.js";
import type { AssistantMessage, ChatMessage, LLMProvider } from "../../llm/types.js";

const clock = () => new Date("2026-07-13T09:00:00Z"); // Monday

function freshStore() {
  return new Store(clock);
}

function toolCall(id: string, name: string, args: unknown): AssistantMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
  };
}

function rawToolCall(id: string, name: string, argsRaw: string): AssistantMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id, type: "function", function: { name, arguments: argsRaw } }],
  };
}

function text(t: string): AssistantMessage {
  return { role: "assistant", content: t };
}

interface Scripted extends LLMProvider {
  calls: number;
  lastUsed: string;
}

function scripted(script: AssistantMessage[]): Scripted {
  let i = 0;
  const p: Scripted = {
    name: "scripted",
    lastUsed: "scripted",
    calls: 0,
    async createChatCompletion(): Promise<AssistantMessage> {
      p.calls += 1;
      return script[i++] ?? text("(script exhausted)");
    },
  };
  return p;
}

function baseHistory(userMsg: string): ChatMessage[] {
  return [
    { role: "system", content: "system prompt" },
    { role: "user", content: userMsg },
  ];
}

describe("agent loop", () => {
  it("returns an immediate text answer when the model uses no tools", async () => {
    const run = createAgentRunner({ store: freshStore(), maxIters: 5 });
    const provider = scripted([text("Hi! How can I help with your appointment?")]);
    const turn = await run({ history: baseHistory("hello"), provider, cid: "t" });
    expect(turn.reply).toBe("Hi! How can I help with your appointment?");
    expect(turn.toolTrace).toEqual([]);
    expect(provider.calls).toBe(1);
  });

  it("drives a two-step availability→book chain to the correct final state", async () => {
    const store = freshStore();
    const slotId = store.getOpenSlotsByDate("2026-07-14")[0]!.id;
    const run = createAgentRunner({ store, maxIters: 5 });
    const provider = scripted([
      toolCall("c1", "get_available_slots", { date: "2026-07-14" }),
      toolCall("c2", "book_appointment", { slotId, name: "Priya Rao", phone: "555-0142" }),
      text("You're booked for 09:00 on 2026-07-14. Reference saved."),
    ]);
    const history = baseHistory("book me the 9am on the 14th, Priya Rao 555-0142");
    const turn = await run({ history, provider, cid: "t" });

    expect(turn.reply).toContain("booked");
    expect(turn.toolTrace).toEqual([
      { name: "get_available_slots", ok: true },
      { name: "book_appointment", ok: true },
    ]);
    expect(store.getSlot(slotId)?.isBooked).toBe(true);
    // History is well-formed and ends with the assistant's text answer.
    expect(history.at(-1)).toMatchObject({ role: "assistant", content: expect.stringContaining("booked") });
    expect(history.filter((m) => m.role === "tool")).toHaveLength(2);
  });

  it("feeds a tool error back and lets the model recover (no false success)", async () => {
    const store = freshStore();
    const takenSlot = store.getSlotsByDate("2026-07-13")[0]!.id; // fully-booked day
    const run = createAgentRunner({ store, maxIters: 5 });
    const provider = scripted([
      toolCall("c1", "book_appointment", { slotId: takenSlot, name: "Priya Rao", phone: "555-0142" }),
      text("Sorry, that time was just taken — want me to find another?"),
    ]);
    const history = baseHistory("book the first slot on the 13th");
    const turn = await run({ history, provider, cid: "t" });

    expect(turn.toolTrace).toEqual([{ name: "book_appointment", ok: false, error: "SLOT_TAKEN" }]);
    expect(turn.reply).toMatch(/taken/i);
    expect(provider.calls).toBe(2); // model was called again after the error
    const toolMsg = history.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("SLOT_TAKEN");
  });

  it("turns malformed tool arguments into a BAD_ARGS result and continues", async () => {
    const run = createAgentRunner({ store: freshStore(), maxIters: 5 });
    const provider = scripted([
      rawToolCall("c1", "get_available_slots", "this is not json"),
      text("Let me re-check that date for you."),
    ]);
    const turn = await run({ history: baseHistory("what's open"), provider, cid: "t" });
    expect(turn.toolTrace).toEqual([{ name: "get_available_slots", ok: false, error: "BAD_ARGS" }]);
    expect(turn.reply).toContain("re-check");
  });

  it("reports UNKNOWN_TOOL when the model hallucinates a tool", async () => {
    const run = createAgentRunner({ store: freshStore(), maxIters: 5 });
    const provider = scripted([
      toolCall("c1", "make_coffee", {}),
      text("I can only help with appointments."),
    ]);
    const turn = await run({ history: baseHistory("make me a coffee"), provider, cid: "t" });
    expect(turn.toolTrace).toEqual([{ name: "make_coffee", ok: false, error: "UNKNOWN_TOOL" }]);
  });

  it("handles multiple tool calls within one assistant message", async () => {
    const store = freshStore();
    const run = createAgentRunner({ store, maxIters: 5 });
    const multi: AssistantMessage = {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "a", type: "function", function: { name: "get_available_slots", arguments: JSON.stringify({ date: "2026-07-14" }) } },
        { id: "b", type: "function", function: { name: "get_available_slots", arguments: JSON.stringify({ date: "2026-07-15" }) } },
      ],
    };
    const provider = scripted([multi, text("Here are both days.")]);
    const turn = await run({ history: baseHistory("compare the 14th and 15th"), provider, cid: "t" });
    expect(turn.toolTrace).toHaveLength(2);
    expect(turn.toolTrace.every((t) => t.ok)).toBe(true);
    expect(turn.reply).toContain("both days");
  });

  it("stops at maxIters with a graceful fallback if the model never converges", async () => {
    const store = freshStore();
    const run = createAgentRunner({ store, maxIters: 3 });
    // A provider that always asks for another tool call, never a text answer.
    let calls = 0;
    const provider: Scripted = {
      name: "loopy",
      lastUsed: "loopy",
      get calls() {
        return calls;
      },
      set calls(v) {
        calls = v;
      },
      async createChatCompletion(): Promise<AssistantMessage> {
        calls += 1;
        return toolCall(`c${calls}`, "get_available_slots", { date: "2026-07-14" });
      },
    };
    const history = baseHistory("loop forever");
    const turn = await run({ history, provider, cid: "t" });

    expect(calls).toBe(3);
    expect(turn.reply).toMatch(/trouble completing/i);
    expect(history.at(-1)).toMatchObject({ role: "assistant", content: expect.stringMatching(/trouble/i) });
  });
});
