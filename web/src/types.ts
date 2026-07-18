export interface ToolTraceEntry {
  name: string;
  ok: boolean;
  error?: string;
}

export interface ChatResponse {
  reply: string;
  toolTrace: ToolTraceEntry[];
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTraceEntry[];
  /** True for an assistant bubble that represents a delivery error (with retry). */
  error?: boolean;
}
