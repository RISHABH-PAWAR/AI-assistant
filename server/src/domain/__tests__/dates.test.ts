import { describe, it, expect } from "vitest";
import { addDays, diffDays, isWeekend, parseDateStr, toDateStr, weekdayName } from "../dates.js";

describe("dates", () => {
  it("toDateStr formats a Date as UTC YYYY-MM-DD", () => {
    expect(toDateStr(new Date("2026-07-13T09:30:00Z"))).toBe("2026-07-13");
    expect(toDateStr(new Date("2026-01-01T23:59:59Z"))).toBe("2026-01-01");
  });

  describe("parseDateStr", () => {
    it("parses a valid date to UTC midnight", () => {
      const d = parseDateStr("2026-07-13");
      expect(d?.toISOString()).toBe("2026-07-13T00:00:00.000Z");
    });
    it("rejects wrong formats", () => {
      for (const bad of ["2026-7-13", "07-13-2026", "2026/07/13", "tomorrow", "", "20260713"]) {
        expect(parseDateStr(bad)).toBeNull();
      }
    });
    it("rejects calendar-invalid dates", () => {
      expect(parseDateStr("2026-02-30")).toBeNull();
      expect(parseDateStr("2026-13-01")).toBeNull();
      expect(parseDateStr("2026-00-10")).toBeNull();
    });
    it("rejects non-string input", () => {
      expect(parseDateStr(123 as unknown as string)).toBeNull();
    });
  });

  it("addDays moves forward and backward across month boundaries", () => {
    expect(addDays("2026-07-13", 7)).toBe("2026-07-20");
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });

  it("diffDays computes whole-day differences", () => {
    expect(diffDays("2026-07-13", "2026-07-20")).toBe(7);
    expect(diffDays("2026-07-20", "2026-07-13")).toBe(-7);
    expect(diffDays("2026-07-13", "2026-07-13")).toBe(0);
  });

  it("weekdayName and isWeekend agree with the calendar", () => {
    expect(weekdayName("2026-07-13")).toBe("Monday");
    expect(weekdayName("2026-07-18")).toBe("Saturday");
    expect(weekdayName("2026-07-19")).toBe("Sunday");
    expect(isWeekend("2026-07-13")).toBe(false);
    expect(isWeekend("2026-07-18")).toBe(true);
    expect(isWeekend("2026-07-19")).toBe(true);
  });

  it("throws on invalid input to the arithmetic helpers", () => {
    expect(() => addDays("nope", 1)).toThrow();
    expect(() => diffDays("nope", "2026-07-13")).toThrow();
    expect(() => diffDays("2026-07-13", "nope")).toThrow();
    expect(() => weekdayName("nope")).toThrow();
    expect(() => isWeekend("nope")).toThrow();
  });
});
