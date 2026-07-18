/**
 * Domain types for the booking system. These are the vocabulary the whole app
 * shares. Tools never throw across their boundary — they return a discriminated
 * `ToolResult` so the agent can read a stable error code plus a human message.
 */

export interface Slot {
  /** Stable, human-debuggable id, e.g. "2026-07-20T09:00". */
  id: string;
  /** ISO date (clinic-local), e.g. "2026-07-20". */
  date: string;
  /** 24h time (clinic-local), e.g. "09:00". */
  time: string;
  isBooked: boolean;
}

export interface Appointment {
  /** Opaque token, e.g. "appt_XXXX" — the model must treat it as a reference. */
  id: string;
  slotId: string;
  patientName: string;
  patientPhone: string;
  /** ISO timestamp of creation. */
  createdAt: string;
}

export type ToolErrorCode =
  | "BAD_DATE" // unparseable / wrong-format date string
  | "OUT_OF_RANGE" // date in the past or beyond the 7-day window
  | "NO_SLOTS" // valid date, but nothing open (full or closed)
  | "SLOT_NOT_FOUND" // unknown slotId
  | "SLOT_TAKEN" // slot already booked by someone else
  | "INVALID_NAME" // missing/blank patient name
  | "INVALID_PHONE" // missing/malformed phone
  | "NOT_FOUND" // unknown appointmentId on cancel
  // Agent/dispatch-layer errors (not produced by domain handlers):
  | "BAD_ARGS" // tool-call arguments weren't valid JSON / wrong shape
  | "UNKNOWN_TOOL"; // model called a tool that doesn't exist

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ToolErrorCode; message: string };

// ---- Tool success payloads ----

export interface AvailableSlotsData {
  date: string;
  slots: { slotId: string; time: string }[];
}

export interface BookingData {
  appointmentId: string;
  slotId: string;
  date: string;
  time: string;
  name: string;
  /** True when an identical prior booking was returned instead of creating a new one. */
  idempotentReplay?: boolean;
}

export interface CancellationData {
  appointmentId: string;
  freedSlotId: string;
  date: string;
  time: string;
}

// ---- Helpers ----

export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function err<T = never>(error: ToolErrorCode, message: string): ToolResult<T> {
  return { ok: false, error, message };
}
