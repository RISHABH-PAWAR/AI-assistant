import { describe, it, expect } from "vitest";
import { Store } from "../../domain/store.js";
import { dispatchTool, toolNames, toolSchemas } from "../tools.js";

const store = () => new Store(() => new Date("2026-07-13T09:00:00Z"));

describe("tool schemas", () => {
  it("exposes exactly the three required tools", () => {
    expect([...toolNames]).toEqual([
      "get_available_slots",
      "book_appointment",
      "cancel_appointment",
    ]);
  });

  it("every schema declares required params", () => {
    for (const t of toolSchemas) {
      expect(t.function.parameters).toHaveProperty("required");
    }
  });
});

describe("dispatchTool", () => {
  it("routes get_available_slots", () => {
    const res = dispatchTool(store(), "get_available_slots", { date: "2026-07-14" });
    expect(res.ok).toBe(true);
  });

  it("routes book_appointment", () => {
    const s = store();
    const slotId = s.getOpenSlotsByDate("2026-07-14")[0]!.id;
    const res = dispatchTool(s, "book_appointment", { slotId, name: "Priya Rao", phone: "5550142" });
    expect(res.ok).toBe(true);
  });

  it("routes cancel_appointment", () => {
    const res = dispatchTool(store(), "cancel_appointment", { appointmentId: "appt_missing" });
    expect(res).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("coerces missing/wrong-typed args to safe defaults", () => {
    // Missing date → empty string → BAD_DATE (not a crash).
    expect(dispatchTool(store(), "get_available_slots", {})).toMatchObject({
      ok: false,
      error: "BAD_DATE",
    });
    // Non-string date.
    expect(dispatchTool(store(), "get_available_slots", { date: 42 })).toMatchObject({
      ok: false,
      error: "BAD_DATE",
    });
  });

  it("returns UNKNOWN_TOOL for a hallucinated tool", () => {
    expect(dispatchTool(store(), "make_coffee", {})).toMatchObject({
      ok: false,
      error: "UNKNOWN_TOOL",
    });
  });
});
