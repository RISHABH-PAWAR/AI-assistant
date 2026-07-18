import OpenAI from "openai";
import type {
  AssistantMessage,
  ChatRequest,
  LLMProvider,
  ToolCall,
} from "./types.js";

export interface ProviderOptions {
  apiKey: string;
  model: string;
  /** Override for Groq (OpenAI-compatible endpoint). Omit for OpenAI proper. */
  baseURL?: string;
}

/**
 * Adapter over any OpenAI-compatible Chat Completions endpoint. Used for both
 * OpenAI and Groq — they share the wire format, including tool calling.
 *
 * The SDK's built-in retries are disabled (`maxRetries: 0`) because our
 * FailoverProvider owns retry/timeout/failover — we don't want double retries.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    readonly name: string,
    opts: ProviderOptions,
  ) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      maxRetries: 0,
    });
    this.model = opts.model;
  }

  async createChatCompletion(req: ChatRequest): Promise<AssistantMessage> {
    const res = await this.client.chat.completions.create(
      {
        model: this.model,
        // Our ChatMessage/ToolSchema mirror the SDK shapes; cast at the boundary.
        messages: req.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        tools: req.tools as OpenAI.Chat.ChatCompletionTool[],
        tool_choice: "auto",
        temperature: req.temperature ?? 0.2,
      },
      { signal: req.signal },
    );

    const msg = res.choices[0]?.message;
    const toolCalls: ToolCall[] | undefined = msg?.tool_calls
      ?.filter((c) => c.type === "function")
      .map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.function.name, arguments: c.function.arguments },
      }));

    return {
      role: "assistant",
      content: msg?.content ?? null,
      ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };
  }
}

export function createOpenAIProvider(opts: ProviderOptions): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider("openai", opts);
}

export function createGroqProvider(opts: Omit<ProviderOptions, "baseURL">): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider("groq", {
    ...opts,
    baseURL: "https://api.groq.com/openai/v1",
  });
}
