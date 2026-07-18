import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header.js";
import { MessageBubble } from "./components/MessageBubble.js";
import { TypingIndicator } from "./components/TypingIndicator.js";
import { Composer } from "./components/Composer.js";
import { SuggestionChips } from "./components/SuggestionChips.js";
import { postChat, ChatError } from "./api.js";
import type { UiMessage } from "./types.js";
import "./styles/chat.css";

const GREETING: UiMessage = {
  id: "greeting",
  role: "assistant",
  content:
    "Hello, I'm Clara at Lakeside Dental. I can help you check availability, book an appointment, or cancel one. What would you like to do?",
};

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export default function App() {
  const [messages, setMessages] = useState<UiMessage[]>([GREETING]);
  const [loading, setLoading] = useState(false);
  const sessionId = useRef<string>(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserMessage = useRef<string>("");

  const showChips = messages.length === 1 && !loading;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Request a reply for `text` and append the assistant bubble (or an error one).
  // Does NOT add a user bubble — callers own that so retry never duplicates it.
  const requestReply = useCallback(async (text: string) => {
    setLoading(true);
    try {
      const res = await postChat(sessionId.current, text);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: res.reply, toolTrace: res.toolTrace },
      ]);
    } catch (e) {
      const msg =
        e instanceof ChatError ? e.message : "Something went wrong. Please try again.";
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: msg, error: true }]);
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      lastUserMessage.current = text;
      setMessages((prev) => [...prev, { id: nextId(), role: "user", content: text }]);
      void requestReply(text);
    },
    [requestReply],
  );

  const retry = useCallback(() => {
    if (!lastUserMessage.current) return;
    // Drop the trailing error bubble and re-request (user bubble stays as-is).
    setMessages((prev) => {
      const next = [...prev];
      if (next[next.length - 1]?.error) next.pop();
      return next;
    });
    void requestReply(lastUserMessage.current);
  }, [requestReply]);

  return (
    <div className="app">
      <div className="app-glow" aria-hidden="true" />
      <div className="chat-shell">
        <Header />
        <div className="messages" ref={scrollRef}>
          <div className="messages-inner">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onRetry={m.error ? retry : undefined} />
            ))}
            {loading && <TypingIndicator />}
            {showChips && <SuggestionChips onPick={send} />}
          </div>
        </div>
        <Composer onSend={send} disabled={loading} />
        <p className="disclaimer">Lakeside Dental — appointments for the next 7 days · Mon–Fri, 09:00–16:30</p>
      </div>
    </div>
  );
}
