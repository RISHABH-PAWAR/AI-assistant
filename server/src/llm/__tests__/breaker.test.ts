import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "../breaker.js";

describe("CircuitBreaker", () => {
  it("stays closed below the threshold", () => {
    const b = new CircuitBreaker(3, 1000, () => 0);
    b.recordFailure("openai");
    b.recordFailure("openai");
    expect(b.isOpen("openai")).toBe(false);
  });

  it("opens at the threshold and stays open during cooldown", () => {
    let now = 0;
    const b = new CircuitBreaker(3, 1000, () => now);
    b.recordFailure("openai");
    b.recordFailure("openai");
    b.recordFailure("openai");
    expect(b.isOpen("openai")).toBe(true);
    now = 999;
    expect(b.isOpen("openai")).toBe(true);
  });

  it("half-opens after cooldown and re-opens on a single further failure", () => {
    let now = 0;
    const b = new CircuitBreaker(3, 1000, () => now);
    for (let i = 0; i < 3; i++) b.recordFailure("openai");
    now = 1000; // cooldown elapsed
    expect(b.isOpen("openai")).toBe(false); // half-open trial allowed
    b.recordFailure("openai"); // trial failed
    expect(b.isOpen("openai")).toBe(true); // re-opened immediately
  });

  it("recordSuccess resets failures and closes the circuit", () => {
    const now = 0;
    const b = new CircuitBreaker(2, 1000, () => now);
    b.recordFailure("openai");
    b.recordFailure("openai");
    expect(b.isOpen("openai")).toBe(true);
    b.recordSuccess("openai");
    expect(b.isOpen("openai")).toBe(false);
    expect(b.snapshot("openai")).toEqual({ failures: 0, open: false });
  });

  it("tracks providers independently", () => {
    const b = new CircuitBreaker(1, 1000, () => 0);
    b.recordFailure("openai");
    expect(b.isOpen("openai")).toBe(true);
    expect(b.isOpen("groq")).toBe(false);
  });
});
