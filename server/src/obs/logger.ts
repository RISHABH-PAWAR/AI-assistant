import { config } from "../config.js";

/**
 * Minimal structured, PII-safe logger. Emits single-line JSON so logs are
 * grep-able and machine-parseable. Never log patient name/phone (see ADR-006);
 * `redact()` strips known PII keys defensively.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const PII_KEYS = new Set(["name", "phone", "patientName", "patientPhone"]);

export function redact(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(redact);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = PII_KEYS.has(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return obj;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[config.logLevel]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  const sink = level === "error" || level === "warn" ? console.error : console.log;
  sink(JSON.stringify(line));
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
  /** Child logger that always attaches a correlation id. */
  child: (cid: string) => ({
    debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, { cid, ...f }),
    info: (m: string, f?: Record<string, unknown>) => emit("info", m, { cid, ...f }),
    warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, { cid, ...f }),
    error: (m: string, f?: Record<string, unknown>) => emit("error", m, { cid, ...f }),
  }),
};

export type Logger = ReturnType<typeof logger.child>;
