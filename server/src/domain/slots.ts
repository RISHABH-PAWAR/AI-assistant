import type { AvailableSlotsData, ToolResult } from "./types.js";
import { ok, err } from "./types.js";
import type { Store } from "./store.js";
import { diffDays, parseDateStr, weekdayName } from "./dates.js";
import { WINDOW_DAYS } from "./store.js";

/**
 * get_available_slots(date) — list OPEN slots for a specific calendar date.
 * Validates the date is well-formed and inside the seeded window before reading.
 */
export function getAvailableSlots(store: Store, dateInput: string): ToolResult<AvailableSlotsData> {
  const date = typeof dateInput === "string" ? dateInput.trim() : "";
  if (!parseDateStr(date)) {
    return err("BAD_DATE", `"${dateInput}" is not a valid date. Please use YYYY-MM-DD.`);
  }

  const offset = diffDays(store.windowStart, date);
  if (offset < 0) {
    return err("OUT_OF_RANGE", `${date} is in the past. I can only book from today onward.`);
  }
  if (offset > WINDOW_DAYS - 1) {
    return err(
      "OUT_OF_RANGE",
      `${date} is beyond our booking window. I can book up to ${WINDOW_DAYS - 1} days ahead (through ${store.windowEnd}).`,
    );
  }

  if (store.isClosedDay(date)) {
    return err("NO_SLOTS", `The clinic is closed on ${weekdayName(date)} (${date}). We're open Mon–Fri.`);
  }

  const open = store.getOpenSlotsByDate(date);
  if (open.length === 0) {
    return err("NO_SLOTS", `We're fully booked on ${weekdayName(date)} ${date}. Would another day work?`);
  }

  return ok({
    date,
    slots: open.map((s) => ({ slotId: s.id, time: s.time })),
  });
}
