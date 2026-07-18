import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../prompt.js";

describe("buildSystemPrompt", () => {
  it("injects today's weekday, date, and the window end", () => {
    const p = buildSystemPrompt("2026-07-13"); // Monday
    expect(p).toContain("Monday, 2026-07-13");
    expect(p).toContain("2026-07-19"); // today + 6
  });

  it("encodes the core safety rules", () => {
    const p = buildSystemPrompt("2026-07-13");
    expect(p).toMatch(/Never invent/i);
    expect(p).toMatch(/appointmentId/);
    expect(p).toMatch(/YYYY-MM-DD/);
    expect(p).toMatch(/closed on weekends/i);
  });
});
