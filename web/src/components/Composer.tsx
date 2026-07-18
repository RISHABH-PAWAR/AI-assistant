import { useRef, useState, type KeyboardEvent, type FormEvent } from "react";
import { SendArrow } from "./icons.js";

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        ref={taRef}
        className="composer-input"
        placeholder="Ask about openings, book, or cancel…"
        value={value}
        rows={1}
        disabled={disabled}
        aria-label="Message"
        onChange={(e) => {
          setValue(e.target.value);
          autosize();
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="submit"
        className="send-btn"
        disabled={!canSend}
        aria-label="Send message"
      >
        <SendArrow />
      </button>
    </form>
  );
}
