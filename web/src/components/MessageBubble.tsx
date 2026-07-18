import ReactMarkdown from "react-markdown";
import type { ToolTraceEntry, UiMessage } from "../types.js";
import { AssistantAvatar, CheckIcon, InfoDot } from "./icons.js";

const TOOL_LABELS: Record<string, { ok: string; err: string }> = {
  // Availability is a lookup: even "no slots" is a successful check, not a failure.
  get_available_slots: { ok: "checked availability", err: "checked availability" },
  book_appointment: { ok: "booked the appointment", err: "couldn't book that slot" },
  cancel_appointment: { ok: "cancelled the appointment", err: "couldn't cancel that booking" },
};

/** Tools whose failure genuinely reflects a problem (vs. a valid "none found"). */
const ACTION_TOOLS = new Set(["book_appointment", "cancel_appointment"]);

function summarizeTrace(trace: ToolTraceEntry[]): { label: string; ok: boolean } | null {
  if (!trace.length) return null;
  // Only booking/cancel failures make the trace "not ok"; availability is neutral.
  const ok = trace.every((t) => t.ok || !ACTION_TOOLS.has(t.name));
  const parts = trace.map((t) => {
    const map = TOOL_LABELS[t.name];
    if (!map) return t.name;
    return t.ok ? map.ok : map.err;
  });
  const unique = parts.filter((p, i) => p !== parts[i - 1]);
  return { label: unique.join(" · "), ok };
}

export function MessageBubble({ message, onRetry }: { message: UiMessage; onRetry?: () => void }) {
  if (message.role === "user") {
    return (
      <div className="row row-user">
        <div className="bubble bubble-user">{message.content}</div>
      </div>
    );
  }

  const trace = message.toolTrace ? summarizeTrace(message.toolTrace) : null;

  return (
    <div className="row row-assistant">
      <div className="avatar">
        <AssistantAvatar />
      </div>
      <div className="assistant-stack">
        <div className={`bubble bubble-assistant${message.error ? " bubble-error" : ""}`}>
          {message.error ? (
            message.content
          ) : (
            <div className="markdown">
              <ReactMarkdown
                allowedElements={["p", "strong", "em", "ul", "ol", "li", "br", "a", "code"]}
                unwrapDisallowed
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          {message.error && onRetry && (
            <button type="button" className="retry-btn" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
        {trace && (
          <div className={`trace${trace.ok ? "" : " trace-warn"}`}>
            {trace.ok ? <CheckIcon /> : <InfoDot />}
            <span>{trace.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
