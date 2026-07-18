import { describe, it, expect } from "vitest";
import { classifyError, isAbortError } from "../errors.js";

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe("classifyError", () => {
  it("treats aborts/timeouts as retryable", () => {
    const ab = Object.assign(new Error("Request aborted"), { name: "AbortError" });
    expect(isAbortError(ab)).toBe(true);
    expect(classifyError(ab)).toMatchObject({ retryable: true, reason: "timeout/abort" });
  });

  it("treats network errors (no status) as retryable", () => {
    expect(classifyError(new Error("ECONNRESET"))).toMatchObject({ retryable: true, reason: "network" });
  });

  it("treats 5xx and 408 as retryable", () => {
    expect(classifyError(httpError(500)).retryable).toBe(true);
    expect(classifyError(httpError(503)).retryable).toBe(true);
    expect(classifyError(httpError(408)).retryable).toBe(true);
  });

  it("treats 429 as non-retryable (fail over immediately)", () => {
    expect(classifyError(httpError(429))).toMatchObject({ retryable: false, reason: "rate_limited" });
  });

  it("treats other 4xx as non-retryable", () => {
    expect(classifyError(httpError(400)).retryable).toBe(false);
    expect(classifyError(httpError(401)).retryable).toBe(false);
    expect(classifyError(httpError(404)).retryable).toBe(false);
  });
});
