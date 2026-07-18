import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The logger reads config.logLevel at import time; to exercise every level/sink
// branch we re-import it under a debug log level via module reset.
async function freshLoggerAtDebug() {
  vi.resetModules();
  vi.stubEnv("LOG_LEVEL", "debug");
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  return import("../logger.js");
}

describe("logger.redact", () => {
  it("masks PII keys recursively and leaves other data intact", async () => {
    const { redact } = await import("../logger.js");
    const out = redact({
      cid: "abc",
      patient: { name: "Priya", phone: "555-0142", note: "ok" },
      items: [{ phone: "999" }, "plain"],
    });
    expect(out).toEqual({
      cid: "abc",
      patient: { name: "[redacted]", phone: "[redacted]", note: "ok" },
      items: [{ phone: "[redacted]" }, "plain"],
    });
  });

  it("passes through primitives", async () => {
    const { redact } = await import("../logger.js");
    expect(redact(42)).toBe(42);
    expect(redact("x")).toBe("x");
    expect(redact(null)).toBe(null);
  });
});

describe("logger emission", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("emits info/debug to console.log and warn/error to console.error", async () => {
    const { logger } = await freshLoggerAtDebug();
    logger.debug("d");
    logger.info("i", { a: 1 });
    logger.warn("w");
    logger.error("e");
    expect(console.log).toHaveBeenCalledTimes(2); // debug + info
    expect(console.error).toHaveBeenCalledTimes(2); // warn + error
    const infoLine = JSON.parse((console.log as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0]);
    expect(infoLine).toMatchObject({ level: "info", msg: "i", a: 1 });
  });

  it("child logger attaches a correlation id and redacts PII fields", async () => {
    const { logger } = await freshLoggerAtDebug();
    const child = logger.child("cid-9");
    child.info("turn", { phone: "555-0142", provider: "openai" });
    const line = JSON.parse((console.log as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]);
    expect(line).toMatchObject({ cid: "cid-9", provider: "openai", phone: "[redacted]" });
  });

  it("suppresses messages below the configured level", async () => {
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "error");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const { logger } = await import("../logger.js");
    logger.info("should not appear");
    expect(console.log).not.toHaveBeenCalled();
  });
});
