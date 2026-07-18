import type { ChatMessage, LLMProvider } from "../llm/types.js";
import type { Store } from "../domain/store.js";
import { err } from "../domain/types.js";
import { dispatchTool, toolSchemas } from "./tools.js";
import { logger } from "../obs/logger.js";

export interface ToolTraceEntry {
  name: string;
  ok: boolean;
  error?: string;
}

export interface AgentTurn {
  reply: string;
  toolTrace: ToolTraceEntry[];
}

export interface AgentInput {
  /** Full conversation history including the system prompt and latest user msg.
   *  The loop appends assistant/tool messages to this array in place. */
  history: ChatMessage[];
  provider: LLMProvider;
  cid: string;
}

export type AgentRunner = (input: AgentInput) => Promise<AgentTurn>;

export interface AgentRunnerDeps {
  store: Store;
  maxIters: number;
  temperature?: number;
}

const LOOP_FALLBACK =
  "I'm having trouble completing that right now. Could you rephrase, or try again in a moment?";

function safeParseArgs(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return { ok: true, value: v as Record<string, unknown> };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * The bounded, provider-agnostic tool-calling loop (ADR-001/006).
 *
 * Each iteration asks the model for the next message. If it returns tool calls,
 * we execute them against the store, append the results, and loop. When it
 * returns plain text, that's the answer. The loop is capped at `maxIters` so a
 * misbehaving model can't ping-pong forever; on exhaustion we return a graceful
 * fallback. Failover across providers happens inside `provider`.
 */
export function createAgentRunner({ store, maxIters, temperature = 0.2 }: AgentRunnerDeps): AgentRunner {
  return async ({ history, provider, cid }) => {
    const log = logger.child(cid);
    const toolTrace: ToolTraceEntry[] = [];

    for (let iter = 0; iter < maxIters; iter++) {
      const assistant = await provider.createChatCompletion({
        messages: history,
        tools: toolSchemas,
        temperature,
      });
      history.push(assistant);

      const calls = assistant.tool_calls ?? [];
      log.info("agent_turn", {
        iter,
        provider: (provider as { lastUsed?: string }).lastUsed,
        toolCalls: calls.map((c) => c.function.name),
      });

      if (calls.length === 0) {
        return { reply: assistant.content ?? "", toolTrace };
      }

      for (const call of calls) {
        const parsed = safeParseArgs(call.function.arguments);
        const result = parsed.ok
          ? dispatchTool(store, call.function.name, parsed.value)
          : err("BAD_ARGS", "The request details were malformed. Please restate them.");

        toolTrace.push({
          name: call.function.name,
          ok: result.ok,
          ...(result.ok ? {} : { error: result.error }),
        });
        history.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Safety valve: the model never converged to a text answer.
    log.warn("agent_loop_exhausted", { maxIters });
    history.push({ role: "assistant", content: LOOP_FALLBACK });
    return { reply: LOOP_FALLBACK, toolTrace };
  };
}
