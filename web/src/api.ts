import type { ChatResponse } from "./types.js";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export class ChatError extends Error {}

/**
 * POST a message to the agent. Throws ChatError with a user-safe message on any
 * non-2xx response or network failure — the UI renders that message inline.
 */
export async function postChat(
  sessionId: string,
  message: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
      signal,
    });
  } catch {
    throw new ChatError("I couldn't reach the clinic just now. Please check your connection and try again.");
  }

  if (!res.ok) {
    let msg = "Something went wrong. Please try again.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* keep the default message */
    }
    throw new ChatError(msg);
  }

  return (await res.json()) as ChatResponse;
}
