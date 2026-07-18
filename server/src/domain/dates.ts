/**
 * Pure date helpers. Everything is anchored to UTC calendar days so behavior is
 * deterministic and timezone-stable in tests (the clinic is modelled as operating
 * in a single UTC-based calendar for this exercise — documented trade-off).
 *
 * Dates are passed around as `YYYY-MM-DD` strings; time-of-day never matters here.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Format a Date as a UTC `YYYY-MM-DD` string. */
export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Strictly parse a `YYYY-MM-DD` string into a UTC-midnight Date.
 * Returns null for wrong format OR calendar-invalid dates (e.g. 2026-02-30).
 */
export function parseDateStr(s: string): Date | null {
  if (typeof s !== "string" || !DATE_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Round-trip guard rejects overflow like month 13 or day 30 in February.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

/** Add `n` whole days to a `YYYY-MM-DD` string, returning a new string. */
export function addDays(dateStr: string, n: number): string {
  const dt = parseDateStr(dateStr);
  if (!dt) throw new Error(`addDays: invalid date "${dateStr}"`);
  return toDateStr(new Date(dt.getTime() + n * MS_PER_DAY));
}

/** Whole-day difference b - a (both `YYYY-MM-DD`). Positive if b is later. */
export function diffDays(a: string, b: string): number {
  const da = parseDateStr(a);
  const db = parseDateStr(b);
  if (!da || !db) throw new Error(`diffDays: invalid date(s) "${a}", "${b}"`);
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY);
}

/** Full weekday name for a `YYYY-MM-DD` string, e.g. "Tuesday". */
export function weekdayName(dateStr: string): string {
  const dt = parseDateStr(dateStr);
  if (!dt) throw new Error(`weekdayName: invalid date "${dateStr}"`);
  return WEEKDAYS[dt.getUTCDay()]!;
}

/** True for Saturday/Sunday. */
export function isWeekend(dateStr: string): boolean {
  const dt = parseDateStr(dateStr);
  if (!dt) throw new Error(`isWeekend: invalid date "${dateStr}"`);
  const day = dt.getUTCDay();
  return day === 0 || day === 6;
}
