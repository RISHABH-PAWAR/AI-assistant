/**
 * Provider-agnostic chat types. The agent loop depends only on these — never on
 * a vendor SDK — so OpenAI and Groq are interchangeable (ADR-002). They mirror
 * the OpenAI Chat Completions tool-calling shape, which Groq is compatible with.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools: ToolSchema[];
  temperature?: number;
  /** Abort signal supplied by the resilience layer (timeouts). */
  signal?: AbortSignal;
}

export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface LLMProvider {
  readonly name: string;
  createChatCompletion(req: ChatRequest): Promise<AssistantMessage>;
}
