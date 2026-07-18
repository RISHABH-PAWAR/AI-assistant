import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the OpenAI SDK so we can unit-test the adapter's request/response mapping
// without any network. `create` is hoisted so both the mock and the tests share it.
const { create, ctorArgs } = vi.hoisted(() => ({
  create: vi.fn(),
  ctorArgs: [] as unknown[],
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create } };
    constructor(opts: unknown) {
      ctorArgs.push(opts);
    }
  },
}));

import {
  OpenAICompatibleProvider,
  createGroqProvider,
  createOpenAIProvider,
} from "../openaiCompatible.js";
import type { ChatRequest } from "../types.js";

const REQ: ChatRequest = {
  messages: [{ role: "user", content: "hi" }],
  tools: [
    {
      type: "function",
      function: { name: "get_available_slots", description: "d", parameters: {} },
    },
  ],
  temperature: 0.2,
};

beforeEach(() => {
  create.mockReset();
  ctorArgs.length = 0;
});

describe("OpenAICompatibleProvider", () => {
  it("maps a content-only response", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "Hello there" } }] });
    const p = new OpenAICompatibleProvider("openai", { apiKey: "k", model: "m" });
    const res = await p.createChatCompletion(REQ);
    expect(res).toEqual({ role: "assistant", content: "Hello there" });
    expect(res.tool_calls).toBeUndefined();
  });

  it("maps and filters tool calls (drops non-function types)", async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "c1", type: "function", function: { name: "book_appointment", arguments: "{}" } },
              { id: "c2", type: "other", function: { name: "x", arguments: "{}" } },
            ],
          },
        },
      ],
    });
    const p = new OpenAICompatibleProvider("openai", { apiKey: "k", model: "m" });
    const res = await p.createChatCompletion(REQ);
    expect(res.content).toBeNull();
    expect(res.tool_calls).toEqual([
      { id: "c1", type: "function", function: { name: "book_appointment", arguments: "{}" } },
    ]);
  });

  it("handles an empty choices array defensively", async () => {
    create.mockResolvedValue({ choices: [] });
    const p = new OpenAICompatibleProvider("openai", { apiKey: "k", model: "m" });
    const res = await p.createChatCompletion(REQ);
    expect(res).toEqual({ role: "assistant", content: null });
  });

  it("forwards model, tool_choice, temperature and the abort signal", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });
    const p = new OpenAICompatibleProvider("openai", { apiKey: "k", model: "gpt-4o-mini" });
    const ac = new AbortController();
    await p.createChatCompletion({ ...REQ, signal: ac.signal });
    const [body, opts] = create.mock.calls[0]!;
    expect(body).toMatchObject({ model: "gpt-4o-mini", tool_choice: "auto", temperature: 0.2 });
    expect(opts).toEqual({ signal: ac.signal });
  });

  it("defaults temperature when not provided", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });
    const p = new OpenAICompatibleProvider("openai", { apiKey: "k", model: "m" });
    await p.createChatCompletion({ messages: [], tools: [] });
    expect(create.mock.calls[0]![0]).toMatchObject({ temperature: 0.2 });
  });

  it("factories set the right name and Groq base URL", async () => {
    createOpenAIProvider({ apiKey: "k", model: "m" });
    expect(ctorArgs.at(-1)).toMatchObject({ apiKey: "k", maxRetries: 0 });

    const groq = createGroqProvider({ apiKey: "gk", model: "llama" });
    expect(groq.name).toBe("groq");
    expect(ctorArgs.at(-1)).toMatchObject({ baseURL: "https://api.groq.com/openai/v1", maxRetries: 0 });
  });
});
