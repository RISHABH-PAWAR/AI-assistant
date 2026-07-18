import { describe, it, expect } from "vitest";
import { Store } from "../store.js";
import { bookAppointment, cancelAppointment } from "../booking.js";

const clock = () => new Date("2026-07-13T09:00:00Z"); // Monday anchor
function ctx() {
  const store = new Store(clock);
  const openSlot = store.getOpenSlotsByDate("2026-07-14")[0]!.id; // "2026-07-14T09:00"
  const bookedSlot = store.getSlotsByDate("2026-07-13")[0]!.id; // fully-booked day
  return { store, openSlot, bookedSlot };
}

describe("bookAppointment — validation", () => {
  it("rejects a blank/too-short name", () => {
    const { store, openSlot } = ctx();
    expect(bookAppointment(store, { slotId: openSlot, name: "", phone: "5551234" })).toMatchObject({
      ok: false,
      error: "INVALID_NAME",
    });
    expect(bookAppointment(store, { slotId: openSlot, name: "A", phone: "5551234" })).toMatchObject({
      ok: false,
      error: "INVALID_NAME",
    });
  });

  it("rejects a phone with fewer than 7 digits", () => {
    const { store, openSlot } = ctx();
    for (const phone of ["", "12345", "call me", "()- "]) {
      expect(bookAppointment(store, { slotId: openSlot, name: "Priya Rao", phone })).toMatchObject({
        ok: false,
        error: "INVALID_PHONE",
      });
    }
  });

  it("accepts a valid international-ish phone format", () => {
    const { store, openSlot } = ctx();
    const res = bookAppointment(store, { slotId: openSlot, name: "Priya Rao", phone: "+1 (555) 014-2233" });
    expect(res.ok).toBe(true);
  });

  it("returns SLOT_NOT_FOUND for an unknown slot", () => {
    const { store } = ctx();
    expect(bookAppointment(store, { slotId: "nope", name: "Priya Rao", phone: "5550142" })).toMatchObject({
      ok: false,
      error: "SLOT_NOT_FOUND",
    });
  });

  it("returns SLOT_TAKEN when the slot is booked by someone else", () => {
    const { store, bookedSlot } = ctx();
    expect(bookAppointment(store, { slotId: bookedSlot, name: "Priya Rao", phone: "5550142" })).toMatchObject({
      ok: false,
      error: "SLOT_TAKEN",
    });
  });
});

describe("bookAppointment — success & idempotency", () => {
  it("books an open slot", () => {
    const { store, openSlot } = ctx();
    const res = bookAppointment(store, { slotId: openSlot, name: "Priya Rao", phone: "555-0142" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.appointmentId).toMatch(/^appt_/);
      expect(res.data.time).toBe("09:00");
      expect(res.data.idempotentReplay).toBeUndefined();
    }
  });

  it("is idempotent: re-booking the same slot with the same patient replays", () => {
    const { store, openSlot } = ctx();
    const first = bookAppointment(store, { slotId: openSlot, name: "Priya Rao", phone: "555-0142" });
    const second = bookAppointment(store, { slotId: openSlot, name: "priya rao", phone: "(555) 0142" });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.idempotentReplay).toBe(true);
      expect(second.data.appointmentId).toBe(first.data.appointmentId);
    }
  });

  it("a different patient booking the same taken slot gets SLOT_TAKEN", () => {
    const { store, openSlot } = ctx();
    bookAppointment(store, { slotId: openSlot, name: "Priya Rao", phone: "555-0142" });
    const other = bookAppointment(store, { slotId: openSlot, name: "Sam Lee", phone: "555-9999" });
    expect(other).toMatchObject({ ok: false, error: "SLOT_TAKEN" });
  });
});

describe("cancelAppointment", () => {
  it("cancels an existing appointment and frees the slot", () => {
    const { store, openSlot } = ctx();
    const booked = bookAppointment(store, { slotId: openSlot, name: "Priya Rao", phone: "555-0142" });
    if (!booked.ok) throw new Error("setup failed");
    const res = cancelAppointment(store, booked.data.appointmentId);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.freedSlotId).toBe(openSlot);
    // slot is now bookable again
    const rebook = bookAppointment(store, { slotId: openSlot, name: "Sam Lee", phone: "555-9999" });
    expect(rebook.ok).toBe(true);
  });

  it("returns NOT_FOUND for an unknown appointment id", () => {
    const { store } = ctx();
    expect(cancelAppointment(store, "appt_missing")).toMatchObject({ ok: false, error: "NOT_FOUND" });
    expect(cancelAppointment(store, "   ")).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });
});
