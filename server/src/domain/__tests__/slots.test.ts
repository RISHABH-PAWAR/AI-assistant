import { describe, it, expect } from "vitest";
import { Store } from "../store.js";
import { getAvailableSlots } from "../slots.js";

const clock = () => new Date("2026-07-13T09:00:00Z"); // Monday anchor
const store = () => new Store(clock);

describe("getAvailableSlots", () => {
  it("returns open slots for an available weekday", () => {
    const res = getAvailableSlots(store(), "2026-07-14");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.date).toBe("2026-07-14");
      expect(res.data.slots).toHaveLength(11);
      expect(res.data.slots[0]).toEqual({ slotId: "2026-07-14T09:00", time: "09:00" });
    }
  });

  it("rejects a malformed date with BAD_DATE", () => {
    const res = getAvailableSlots(store(), "next tuesday");
    expect(res).toMatchObject({ ok: false, error: "BAD_DATE" });
  });

  it("rejects a non-string date with BAD_DATE", () => {
    const res = getAvailableSlots(store(), 20260714 as unknown as string);
    expect(res).toMatchObject({ ok: false, error: "BAD_DATE" });
  });

  it("rejects a past date with OUT_OF_RANGE", () => {
    const res = getAvailableSlots(store(), "2026-07-12");
    expect(res).toMatchObject({ ok: false, error: "OUT_OF_RANGE" });
  });

  it("rejects a date beyond the window with OUT_OF_RANGE", () => {
    const res = getAvailableSlots(store(), "2026-07-20");
    expect(res).toMatchObject({ ok: false, error: "OUT_OF_RANGE" });
    if (!res.ok) expect(res.message).toContain("2026-07-19");
  });

  it("returns NO_SLOTS (closed) for a weekend", () => {
    const res = getAvailableSlots(store(), "2026-07-18");
    expect(res).toMatchObject({ ok: false, error: "NO_SLOTS" });
    if (!res.ok) expect(res.message).toMatch(/closed/i);
  });

  it("returns NO_SLOTS (full) for a fully-booked weekday", () => {
    const res = getAvailableSlots(store(), "2026-07-13");
    expect(res).toMatchObject({ ok: false, error: "NO_SLOTS" });
    if (!res.ok) expect(res.message).toMatch(/fully booked/i);
  });

  it("accepts a padded date string", () => {
    const res = getAvailableSlots(store(), "  2026-07-14  ");
    expect(res.ok).toBe(true);
  });
});
