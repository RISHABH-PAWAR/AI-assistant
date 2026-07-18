import type { ToolSchema } from "../llm/types.js";
import { err, type ToolResult as DomainToolResult } from "../domain/types.js";
import type { Store } from "../domain/store.js";
import { getAvailableSlots } from "../domain/slots.js";
import { bookAppointment, cancelAppointment } from "../domain/booking.js";

/**
 * OpenAI tool schemas exposed to the model. Descriptions are written FOR the
 * model — they encode the rules the agent must follow (resolve dates first, only
 * book with a confirmed slot + name + phone, never guess appointment ids).
 */
export const toolSchemas: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "get_available_slots",
      description:
        "List open appointment slots for a specific calendar date. Use this whenever the " +
        "user asks about availability. The date MUST be resolved to YYYY-MM-DD before calling.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Target date as YYYY-MM-DD" },
        },
        required: ["date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Book a specific open slot for a patient. Only call after you have a valid slotId " +
        "from get_available_slots AND the patient's full name AND phone number, AND the user " +
        "has confirmed the specific time.",
      parameters: {
        type: "object",
        properties: {
          slotId: { type: "string", description: "Exact id returned by get_available_slots" },
          name: { type: "string", description: "Patient full name" },
          phone: { type: "string", description: "Patient phone number" },
        },
        required: ["slotId", "name", "phone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description:
        "Cancel an existing appointment by its appointmentId (format appt_...). If the user " +
        "does not know the id, ask for it — do NOT guess or fabricate one.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string", description: "The appt_... id to cancel" },
        },
        required: ["appointmentId"],
        additionalProperties: false,
      },
    },
  },
];

/** Names the model is allowed to call. */
export const toolNames = new Set(toolSchemas.map((t) => t.function.name));

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Route a validated tool call to its domain handler. Never throws across the
 * boundary — unknown tools and shape problems come back as structured errors the
 * model can read and relay.
 */
export function dispatchTool(
  store: Store,
  name: string,
  args: Record<string, unknown>,
): DomainToolResult<unknown> {
  switch (name) {
    case "get_available_slots":
      return getAvailableSlots(store, str(args.date));
    case "book_appointment":
      return bookAppointment(store, {
        slotId: str(args.slotId),
        name: str(args.name),
        phone: str(args.phone),
      });
    case "cancel_appointment":
      return cancelAppointment(store, str(args.appointmentId));
    default:
      return err("UNKNOWN_TOOL", `There is no tool named "${name}".`);
  }
}
