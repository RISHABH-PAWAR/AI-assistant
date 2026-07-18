import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "../Composer.js";

describe("Composer", () => {
  it("submits on Enter and clears the input", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "book me a slot");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("book me a slot");
    expect(input).toHaveValue("");
  });

  it("inserts a newline on Shift+Enter without submitting", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "line one");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await userEvent.type(input, "line two");
    expect(onSend).not.toHaveBeenCalled();
    expect((input as HTMLTextAreaElement).value).toContain("\n");
  });

  it("disables the send button when empty or loading", async () => {
    const onSend = vi.fn();
    const { rerender } = render(<Composer onSend={onSend} disabled={false} />);
    const button = screen.getByLabelText("Send message");
    expect(button).toBeDisabled(); // empty

    await userEvent.type(screen.getByLabelText("Message"), "hi");
    expect(button).toBeEnabled();

    rerender(<Composer onSend={onSend} disabled={true} />);
    expect(button).toBeDisabled(); // loading
  });

  it("does not submit whitespace-only input", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    await userEvent.type(screen.getByLabelText("Message"), "   ");
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
