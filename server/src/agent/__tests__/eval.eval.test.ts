import { describe, it, expect } from "vitest";
import { createAgentRunner } from "../loop.js";
import { buildSystemPrompt } from "../prompt.js";
import { Store } from "../../domain/store.js";
import { makeFailoverProvider } from "../../llm/factory.js";
import { toDateStr, addDays } from "../../domain/dates.js";
import type { ChatMessage } from "../../llm/types.js";

/**
 * ADVISORY behavioral evals against a REAL LLM. Excluded from the normal test run
 * (filename *.eval.test.ts) and only executed via `npm run test:eval` with a live
 * API key. LLM behavior varies, so these are informative, not CI gates
 * (TESTING.md §4).
 */
const RUN = process.env.RUN_EVAL === "1";

describe.skipIf(!RUN)("agent behavioral evals (real LLM)", () => {
  const today = toDateStr(new Date());

  it("checks availability via the tool when asked what's open", async () => {
    const store = new Store();
    const run = createAgentRunner({ store, maxIters: 5 });
    const history: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(today) },
      { role: "user", content: `What appointments are open on ${addDays(today, 2)}?` },
    ];
    const turn = await run({ history, provider: makeFailoverProvider("eval"), cid: "eval" });
    expect(turn.toolTrace.some((t) => t.name === "get_available_slots")).toBe(true);
  }, 30_000);

  it("asks for a phone number instead of booking without one", async () => {
    const store = new Store();
    // Pick a genuinely open day so the model reaches the "missing phone" state
    // rather than a "closed/full" reply.
    const openDay = store.seededDays.find((d) => store.getOpenSlotsByDate(d).length > 0)!;
    const history: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(today) },
      { role: "user", content: `Book me the earliest opening on ${openDay}. My name is Priya Rao.` },
    ];
    const run = createAgentRunner({ store, maxIters: 5 });
    const turn = await run({ history, provider: makeFailoverProvider("eval"), cid: "eval" });
    const booked = turn.toolTrace.some((t) => t.name === "book_appointment" && t.ok);
    expect(booked).toBe(false);
    expect(turn.reply.toLowerCase()).toMatch(/phone|number|contact/);
  }, 30_000);
});
