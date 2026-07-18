import { describe, it, expect } from "vitest";
import { Store, WINDOW_DAYS } from "../store.js";

// Anchor on a Monday so the 7-day window is Mon..Sun with a clean weekday layout:
//   07-13 Mon (weekday #0 → FULL)     07-16 Thu (weekday #3 → FULL)
//   07-14 Tue (#1 → scattered)        07-17 Fri (#4 → scattered)
//   07-15 Wed (#2 → scattered)        07-18 Sat / 07-19 Sun (closed)
const MONDAY = "2026-07-13";
const clock = () => new Date(`${MONDAY}T09:00:00Z`);

function freshStore() {
  return new Store(clock);
}

describe("Store.seed", () => {
  it("seeds exactly the 7-day window", () => {
    const s = freshStore();
    expect(s.seededDays).toHaveLength(WINDOW_DAYS);
    expect(s.windowStart).toBe("2026-07-13");
    expect(s.windowEnd).toBe("2026-07-19");
  });

  it("closes weekends (no slots)", () => {
    const s = freshStore();
    expect(s.getSlotsByDate("2026-07-18")).toHaveLength(0);
    expect(s.getSlotsByDate("2026-07-19")).toHaveLength(0);
    expect(s.isClosedDay("2026-07-18")).toBe(true);
    expect(s.isClosedDay("2026-07-19")).toBe(true);
  });

  it("fully books the 1st and 4th weekdays", () => {
    const s = freshStore();
    for (const full of ["2026-07-13", "2026-07-16"]) {
      expect(s.getSlotsByDate(full)).toHaveLength(16);
      expect(s.getOpenSlotsByDate(full)).toHaveLength(0);
    }
  });

  it("scatters ~31% booked on the other weekdays", () => {
    const s = freshStore();
    for (const day of ["2026-07-14", "2026-07-15", "2026-07-17"]) {
      expect(s.getSlotsByDate(day)).toHaveLength(16);
      expect(s.getOpenSlotsByDate(day)).toHaveLength(11); // 5 booked (idx %3===1)
    }
  });

  it("returns slots sorted by time", () => {
    const s = freshStore();
    const times = s.getSlotsByDate("2026-07-14").map((x) => x.time);
    expect(times[0]).toBe("09:00");
    expect(times.at(-1)).toBe("16:30");
    expect([...times]).toEqual([...times].sort());
  });

  it("isClosedDay is false for an open weekday and for out-of-window dates", () => {
    const s = freshStore();
    expect(s.isClosedDay("2026-07-14")).toBe(false);
    expect(s.isClosedDay("2030-01-01")).toBe(false);
  });

  it("defaults to the real clock when none is injected", () => {
    const s = new Store();
    expect(s.seededDays).toHaveLength(WINDOW_DAYS);
  });
});

describe("Store booking mechanics", () => {
  it("books an open slot and indexes it by slot", () => {
    const s = freshStore();
    const open = s.getOpenSlotsByDate("2026-07-14")[0]!;
    const appt = s.book(open.id, "Priya Rao", "555-0142");
    expect(appt.id).toMatch(/^appt_/);
    expect(s.getSlot(open.id)?.isBooked).toBe(true);
    expect(s.getAppointment(appt.id)).toEqual(appt);
    expect(s.getAppointmentBySlot(open.id)?.id).toBe(appt.id);
  });

  it("throws when booking a missing or already-booked slot", () => {
    const s = freshStore();
    expect(() => s.book("nope", "A B", "5551234")).toThrow(/not found/);
    const booked = s.getSlotsByDate("2026-07-13")[0]!; // fully booked day
    expect(() => s.book(booked.id, "A B", "5551234")).toThrow(/already booked/);
  });

  it("cancels an appointment and frees the slot", () => {
    const s = freshStore();
    const open = s.getOpenSlotsByDate("2026-07-14")[0]!;
    const appt = s.book(open.id, "Priya Rao", "555-0142");
    const freed = s.cancel(appt.id);
    expect(freed.id).toBe(open.id);
    expect(s.getSlot(open.id)?.isBooked).toBe(false);
    expect(s.getAppointment(appt.id)).toBeUndefined();
    expect(s.getAppointmentBySlot(open.id)).toBeUndefined();
  });

  it("throws when cancelling an unknown appointment", () => {
    const s = freshStore();
    expect(() => s.cancel("appt_missing")).toThrow(/not found/);
  });

  it("re-seed clears prior bookings", () => {
    const s = freshStore();
    const open = s.getOpenSlotsByDate("2026-07-14")[0]!;
    s.book(open.id, "Priya Rao", "555-0142");
    s.seed();
    expect(s.getSlot(open.id)?.isBooked).toBe(false);
  });
});
