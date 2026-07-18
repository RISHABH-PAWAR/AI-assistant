import { nanoid } from "nanoid";
import type { Appointment, Slot } from "./types.js";
import { addDays, isWeekend, toDateStr } from "./dates.js";

/** Number of days seeded, starting today (inclusive). */
export const WINDOW_DAYS = 7;

/** Clinic hours: 09:00–16:30, every 30 minutes → 16 slots per open day. */
const OPEN_MINUTES = 9 * 60; // 09:00
const CLOSE_MINUTES = 16 * 60 + 30; // 16:30
const SLOT_STEP = 30;

function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dayTimes(): string[] {
  const times: string[] = [];
  for (let m = OPEN_MINUTES; m <= CLOSE_MINUTES; m += SLOT_STEP) times.push(minutesToHHMM(m));
  return times;
}

/**
 * A clock is injected so seeding is deterministic and unit-testable. Production
 * passes `() => new Date()`.
 */
export type Clock = () => Date;

/**
 * In-memory source of truth for slots and appointments. All persistence flows
 * through this class (repository seam) so a Redis/DB impl can replace it without
 * touching the domain handlers (ADR-003).
 */
export class Store {
  private slots = new Map<string, Slot>();
  private appointments = new Map<string, Appointment>();
  private slotToAppointment = new Map<string, string>();
  private days: string[] = [];
  private today = "";

  constructor(private readonly clock: Clock = () => new Date()) {
    this.seed();
  }

  /**
   * (Re)build the 7-day window from the injected clock.
   *
   * Rules (deterministic, demo-friendly):
   *  - Weekends are closed (no slots) — every 7-day window has exactly 2.
   *  - Of the 5 weekdays, the 1st and 4th (in order) are fully booked, so the
   *    "no availability" path always demos regardless of what day it is today.
   *  - Remaining weekdays get a fixed ~31% scattered-booked pattern.
   */
  seed(): void {
    this.slots.clear();
    this.appointments.clear();
    this.slotToAppointment.clear();
    this.days = [];

    const today = toDateStr(this.clock());
    this.today = today;
    const times = dayTimes();

    let weekdayOrdinal = 0;
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const date = addDays(today, i);
      this.days.push(date);
      if (isWeekend(date)) continue; // closed

      const fullyBooked = weekdayOrdinal === 0 || weekdayOrdinal === 3;
      times.forEach((time, idx) => {
        const scattered = idx % 3 === 1;
        const isBooked = fullyBooked || scattered;
        const id = `${date}T${time}`;
        this.slots.set(id, { id, date, time, isBooked });
      });
      weekdayOrdinal += 1;
    }
  }

  /** First and last date strings of the seeded window. */
  get windowStart(): string {
    return this.today;
  }
  get windowEnd(): string {
    return addDays(this.today, WINDOW_DAYS - 1);
  }
  get seededDays(): readonly string[] {
    return this.days;
  }

  getSlotsByDate(date: string): Slot[] {
    return [...this.slots.values()]
      .filter((s) => s.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  getOpenSlotsByDate(date: string): Slot[] {
    return this.getSlotsByDate(date).filter((s) => !s.isBooked);
  }

  /** True when the date is a seeded day that exists but is closed (weekend). */
  isClosedDay(date: string): boolean {
    return this.days.includes(date) && this.getSlotsByDate(date).length === 0;
  }

  getSlot(id: string): Slot | undefined {
    return this.slots.get(id);
  }

  getAppointment(id: string): Appointment | undefined {
    return this.appointments.get(id);
  }

  getAppointmentBySlot(slotId: string): Appointment | undefined {
    const apptId = this.slotToAppointment.get(slotId);
    return apptId ? this.appointments.get(apptId) : undefined;
  }

  /**
   * Book an open slot atomically. Node's single thread guarantees the
   * check-then-set below cannot interleave. Caller (booking handler) is expected
   * to have validated inputs; this still guards invariants defensively.
   */
  book(slotId: string, name: string, phone: string): Appointment {
    const slot = this.slots.get(slotId);
    if (!slot) throw new Error(`book: slot "${slotId}" not found`);
    if (slot.isBooked) throw new Error(`book: slot "${slotId}" already booked`);

    const appt: Appointment = {
      id: `appt_${nanoid(10)}`,
      slotId,
      patientName: name,
      patientPhone: phone,
      createdAt: this.clock().toISOString(),
    };
    slot.isBooked = true;
    this.appointments.set(appt.id, appt);
    this.slotToAppointment.set(slotId, appt.id);
    return appt;
  }

  /** Cancel an appointment, freeing its slot. Returns the freed slot. */
  cancel(appointmentId: string): Slot {
    const appt = this.appointments.get(appointmentId);
    if (!appt) throw new Error(`cancel: appointment "${appointmentId}" not found`);
    const slot = this.slots.get(appt.slotId);
    /* v8 ignore next -- defensive: an appointment always references a real slot */
    if (!slot) throw new Error(`cancel: slot "${appt.slotId}" missing for appointment`);
    slot.isBooked = false;
    this.appointments.delete(appointmentId);
    this.slotToAppointment.delete(appt.slotId);
    return slot;
  }
}
