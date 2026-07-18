import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the API module so no network is involved.
vi.mock("../api.js", async () => {
  const actual = await vi.importActual<typeof import("../api.js")>("../api.js");
  return { ...actual, postChat: vi.fn() };
});

import App from "../App.js";
import { postChat, ChatError } from "../api.js";

const mockPost = vi.mocked(postChat);

beforeEach(() => {
  mockPost.mockReset();
});

describe("App", () => {
  it("shows the greeting and suggestion chips on load", () => {
    render(<App />);
    expect(screen.getByText(/I'm Clara at Lakeside Dental/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /What appointments are open this week/i })).toBeInTheDocument();
  });

  it("sends a message and renders the assistant reply with a trace", async () => {
    mockPost.mockResolvedValue({
      reply: "We have 09:00 and 09:30 open on Tuesday.",
      toolTrace: [{ name: "get_available_slots", ok: true }],
    });
    render(<App />);
    await userEvent.type(screen.getByLabelText("Message"), "what's open?");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("what's open?")).toBeInTheDocument();
    expect(await screen.findByText(/09:00 and 09:30 open/i)).toBeInTheDocument();
    expect(screen.getByText("checked availability")).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(expect.any(String), "what's open?");
  });

  it("hides suggestion chips after the first message", async () => {
    mockPost.mockResolvedValue({ reply: "ok", toolTrace: [] });
    render(<App />);
    const chip = screen.getByRole("button", { name: /book a cleaning/i });
    await userEvent.click(chip);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /book a cleaning/i })).not.toBeInTheDocument();
    });
  });

  it("renders an error bubble with retry, then recovers on retry", async () => {
    mockPost.mockRejectedValueOnce(new ChatError("I couldn't reach the clinic just now."));
    render(<App />);
    await userEvent.type(screen.getByLabelText("Message"), "hello");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText(/couldn't reach the clinic/i)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /try again/i });

    mockPost.mockResolvedValueOnce({ reply: "Back online — how can I help?", toolTrace: [] });
    await userEvent.click(retry);

    expect(await screen.findByText(/Back online/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reach the clinic/i)).not.toBeInTheDocument();
    // The user's message was resent, not duplicated in the transcript.
    expect(screen.getAllByText("hello")).toHaveLength(1);
  });

  it("disables the composer while awaiting a reply", async () => {
    let resolve!: (v: { reply: string; toolTrace: [] }) => void;
    mockPost.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<App />);
    await userEvent.type(screen.getByLabelText("Message"), "hi");
    await userEvent.keyboard("{Enter}");

    expect(screen.getByLabelText("Send message")).toBeDisabled();
    resolve({ reply: "done", toolTrace: [] });
    expect(await screen.findByText("done")).toBeInTheDocument();
  });
});
