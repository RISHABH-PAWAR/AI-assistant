import type { BookingData, CancellationData, ToolResult } from "./types.js";
import { ok, err } from "./types.js";
import type { Store } from "./store.js";

/** Digits-only length check — lenient enough for international formats, strict on garbage. */
function normalizePhone(raw: string): string {
  return (raw ?? "").replace(/[^\d]/g, "");
}

export interface BookArgs {
  slotId: string;
  name: string;
  phone: string;
}

/**
 * book_appointment(slotId, name, phone) — validate, then book atomically.
 *
 * Idempotent: if the slot is already booked to the SAME patient (matched by
 * normalized name + phone), the existing appointment is returned instead of
 * erroring — so retries / double-clicks / failover never create duplicates
 * (ADR-005). A slot booked by someone else returns SLOT_TAKEN.
 */
export function bookAppointment(store: Store, args: BookArgs): ToolResult<BookingData> {
  const name = (args?.name ?? "").trim();
  const phoneDigits = normalizePhone(args?.phone);
  const slotId = (args?.slotId ?? "").trim();

  if (name.length < 2) {
    return err("INVALID_NAME", "I need the patient's full name to book the appointment.");
  }
  if (phoneDigits.length < 7) {
    return err("INVALID_PHONE", "That phone number doesn't look right — please share a valid contact number.");
  }

  const slot = store.getSlot(slotId);
  if (!slot) {
    return err("SLOT_NOT_FOUND", `I couldn't find that time slot. Let me pull up the current availability.`);
  }

  if (slot.isBooked) {
    const existing = store.getAppointmentBySlot(slotId);
    if (
      existing &&
      existing.patientName.trim().toLowerCase() === name.toLowerCase() &&
      normalizePhone(existing.patientPhone) === phoneDigits
    ) {
      // Same person, same slot → treat as a no-op replay, not a double booking.
      return ok({
        appointmentId: existing.id,
        slotId: slot.id,
        date: slot.date,
        time: slot.time,
        name: existing.patientName,
        idempotentReplay: true,
      });
    }
    return err("SLOT_TAKEN", `Sorry, ${slot.time} on ${slot.date} was just taken. Want me to find another time?`);
  }

  const appt = store.book(slotId, name, args.phone.trim());
  return ok({
    appointmentId: appt.id,
    slotId: slot.id,
    date: slot.date,
    time: slot.time,
    name: appt.patientName,
  });
}

/**
 * cancel_appointment(appointmentId) — free the slot for an existing booking.
 * Unknown ids return NOT_FOUND; the model must not guess ids.
 */
export function cancelAppointment(store: Store, appointmentIdInput: string): ToolResult<CancellationData> {
  const appointmentId = (appointmentIdInput ?? "").trim();
  const appt = store.getAppointment(appointmentId);
  if (!appt) {
    return err("NOT_FOUND", `I couldn't find an appointment with id "${appointmentId}".`);
  }
  const freed = store.cancel(appointmentId);
  return ok({
    appointmentId,
    freedSlotId: freed.id,
    date: freed.date,
    time: freed.time,
  });
}
