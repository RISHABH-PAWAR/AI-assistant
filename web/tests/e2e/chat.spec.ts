import { test, expect, type Page } from "@playwright/test";

interface StubReply {
  reply?: string;
  toolTrace?: { name: string; ok: boolean; error?: string }[];
  status?: number;
  error?: string;
}

/** Stub the backend at the network layer; `handler` maps a user message to a reply. */
async function stubChat(page: Page, handler: (message: string) => StubReply) {
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as { message: string };
    const r = handler(body.message);
    if (r.status && r.status >= 400) {
      await route.fulfill({
        status: r.status,
        contentType: "application/json",
        body: JSON.stringify({ error: r.error ?? "error" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: r.reply ?? "ok", toolTrace: r.toolTrace ?? [] }),
    });
  });
}

async function send(page: Page, text: string) {
  await page.locator(".composer-input").fill(text);
  await page.locator(".send-btn").click();
}

test.describe("chat E2E", () => {
  test("shows the greeting and suggestion chips on load", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/I'm Clara at Lakeside Dental/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /What appointments are open this week/i })).toBeVisible();
  });

  test("returns availability and renders the trace", async ({ page }) => {
    await stubChat(page, () => ({
      reply: "We have several openings on **Wednesday**. The earliest is **09:00**. Which works?",
      toolTrace: [{ name: "get_available_slots", ok: true }],
    }));
    await page.goto("/");
    await send(page, "What's open Wednesday?");
    await expect(page.getByText(/earliest is/i)).toBeVisible();
    await expect(page.getByText("checked availability")).toBeVisible();
    // Markdown bold rendered.
    await expect(page.locator(".markdown strong", { hasText: "09:00" })).toBeVisible();
  });

  test("books an appointment across two turns", async ({ page }) => {
    await stubChat(page, (msg) => {
      if (/book/i.test(msg)) {
        return {
          reply: "You're booked for **09:00 on Wednesday** under Priya Rao.",
          toolTrace: [{ name: "book_appointment", ok: true }],
        };
      }
      return {
        reply: "The earliest is **09:00**. Want it?",
        toolTrace: [{ name: "get_available_slots", ok: true }],
      };
    });
    await page.goto("/");
    await send(page, "Anything Wednesday?");
    await expect(page.getByText(/Want it/i)).toBeVisible();
    await send(page, "Book the 9am, Priya Rao 555-0142");
    await expect(page.getByText(/You're booked/i)).toBeVisible();
    await expect(page.getByText("booked the appointment")).toBeVisible();
  });

  test("offers alternatives when a day is fully booked", async ({ page }) => {
    await stubChat(page, () => ({
      reply: "That day is fully booked. Would Tuesday or Wednesday work instead?",
      toolTrace: [{ name: "get_available_slots", ok: false, error: "NO_SLOTS" }],
    }));
    await page.goto("/");
    await send(page, "Anything today?");
    await expect(page.getByText(/fully booked/i)).toBeVisible();
    await expect(page.getByText(/Tuesday or Wednesday/i)).toBeVisible();
    // Availability lookups are neutral, not shown as a failure.
    await expect(page.getByText("checked availability")).toBeVisible();
  });

  test("handles an unknown cancellation gracefully", async ({ page }) => {
    await stubChat(page, () => ({
      reply: "I couldn't find an appointment with that id. Could you double-check it?",
      toolTrace: [{ name: "cancel_appointment", ok: false, error: "NOT_FOUND" }],
    }));
    await page.goto("/");
    await send(page, "Cancel appt_zzz");
    await expect(page.getByText(/couldn't find an appointment/i)).toBeVisible();
    await expect(page.getByText("couldn't cancel that booking")).toBeVisible();
  });

  test("shows a retry-able error, then recovers", async ({ page }) => {
    let calls = 0;
    await stubChat(page, () => {
      calls += 1;
      if (calls === 1) return { status: 503, error: "The assistant is temporarily unavailable." };
      return { reply: "Back online — how can I help?", toolTrace: [] };
    });
    await page.goto("/");
    await send(page, "hello");
    await expect(page.getByText(/temporarily unavailable/i)).toBeVisible();
    const retry = page.getByRole("button", { name: /try again/i });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.getByText(/Back online/i)).toBeVisible();
    await expect(page.getByText(/temporarily unavailable/i)).toHaveCount(0);
  });

  test("supports a keyboard-only flow", async ({ page }) => {
    await stubChat(page, () => ({ reply: "Got it.", toolTrace: [] }));
    await page.goto("/");
    await page.locator(".composer-input").focus();
    await page.keyboard.type("hello there");
    await page.keyboard.press("Enter");
    await expect(page.getByText("hello there")).toBeVisible();
    await expect(page.getByText("Got it.")).toBeVisible();
  });
});
