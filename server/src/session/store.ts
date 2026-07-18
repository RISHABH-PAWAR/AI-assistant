import type { ChatMessage } from "../llm/types.js";

/**
 * Conversation history persistence, keyed by client-supplied sessionId.
 * In-memory by default; the interface is the seam for a Redis/DB impl (ADR-007).
 */
export interface SessionStore {
  get(id: string): ChatMessage[] | undefined;
  set(id: string, messages: ChatMessage[]): void;
}

export class InMemorySessionStore implements SessionStore {
  private readonly map = new Map<string, ChatMessage[]>();

  get(id: string): ChatMessage[] | undefined {
    return this.map.get(id);
  }

  set(id: string, messages: ChatMessage[]): void {
    this.map.set(id, messages);
  }
}

/**
 * Bound a conversation's length to control token cost, while keeping it valid.
 * Always retains the system prompt (index 0) and trims oldest turns starting on
 * a `user` boundary so we never orphan a `tool` message from its assistant call
 * (which the LLM API would reject).
 */
export function capHistory(history: ChatMessage[], maxMessages: number): ChatMessage[] {
  if (history.length <= maxMessages) return history;
  const [system, ...rest] = history;

  let cut = history.length - maxMessages;
  while (cut < rest.length && rest[cut]?.role !== "user") cut++;

  const tail = rest.slice(cut);
  return system ? [system, ...tail] : tail;
}
