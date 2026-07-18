import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageBubble } from "../MessageBubble.js";

describe("MessageBubble", () => {
  it("renders a user message", () => {
    render(<MessageBubble message={{ id: "1", role: "user", content: "hello there" }} />);
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  it("summarizes a successful tool trace with friendly labels", () => {
    render(
      <MessageBubble
        message={{
          id: "1",
          role: "assistant",
          content: "You're booked!",
          toolTrace: [
            { name: "get_available_slots", ok: true },
            { name: "book_appointment", ok: true },
          ],
        }}
      />,
    );
    expect(screen.getByText(/checked availability · booked the appointment/i)).toBeInTheDocument();
  });

  it("de-duplicates repeated availability checks", () => {
    render(
      <MessageBubble
        message={{
          id: "1",
          role: "assistant",
          content: "Here you go",
          toolTrace: [
            { name: "get_available_slots", ok: true },
            { name: "get_available_slots", ok: true },
          ],
        }}
      />,
    );
    expect(screen.getByText("checked availability")).toBeInTheDocument();
  });

  it("shows a retry button on an error bubble and calls onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={{ id: "1", role: "assistant", content: "Couldn't reach the clinic.", error: true }}
        onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
