import { AssistantAvatar } from "./icons.js";

export function TypingIndicator() {
  return (
    <div className="row row-assistant" aria-live="polite" aria-label="Assistant is typing">
      <div className="avatar">
        <AssistantAvatar />
      </div>
      <div className="bubble bubble-assistant typing">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  );
}
