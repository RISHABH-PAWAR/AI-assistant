import { describe, it, expect } from "vitest";
import { Store } from "../store.js";
import { getAvailableSlots } from "../slots.js";
import { bookAppointment, cancelAppointment } from "../booking.js";

/**
 * End-to-end domain scenario (no LLM, no HTTP) — the "scratch" proof from the
 * implementation plan, encoded as a test: list → book → double-book → cancel →
 * cancel-missing all behave correctly against one store.
 */
describe("domain scenario — full booking lifecycle", () => {
  it("walks the happy path and the guards in one sequence", () => {
    const store = new Store(() => new Date("2026-07-13T09:00:00Z"));

    // 1) Availability on an open day
    const avail = getAvailableSlots(store, "2026-07-14");
    expect(avail.ok).toBe(true);
    if (!avail.ok) return;
    const slotId = avail.data.slots[0]!.slotId;

    // 2) Book it
    const booked = bookAppointment(store, { slotId, name: "Priya Rao", phone: "555-0142" });
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;
    const apptId = booked.data.appointmentId;

    // 3) The slot no longer appears as available
    const after = getAvailableSlots(store, "2026-07-14");
    expect(after.ok && after.data.slots.some((s) => s.slotId === slotId)).toBe(false);

    // 4) A different patient cannot take it (double-book guard)
    const clash = bookAppointment(store, { slotId, name: "Sam Lee", phone: "555-9999" });
    expect(clash).toMatchObject({ ok: false, error: "SLOT_TAKEN" });

    // 5) Cancel frees it
    const cancelled = cancelAppointment(store, apptId);
    expect(cancelled.ok).toBe(true);
    const reopened = getAvailableSlots(store, "2026-07-14");
    expect(reopened.ok && reopened.data.slots.some((s) => s.slotId === slotId)).toBe(true);

    // 6) Cancelling again (now unknown) fails cleanly
    expect(cancelAppointment(store, apptId)).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });
});
