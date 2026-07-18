/**
 * Per-provider circuit breaker. After `threshold` consecutive failures a
 * provider's circuit opens and is skipped for `cooldownMs`, so we stop hammering
 * a provider that is clearly down and fail straight to the fallback (ADR-008).
 *
 * The clock is injectable for deterministic tests (fake timers not required).
 */
export class CircuitBreaker {
  private failures = new Map<string, number>();
  private openedAt = new Map<string, number>();

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** True if the provider's circuit is open (should be skipped). */
  isOpen(name: string): boolean {
    const opened = this.openedAt.get(name);
    if (opened === undefined) return false;

    if (this.now() - opened >= this.cooldownMs) {
      // Cooldown elapsed → half-open: allow a single trial. One more failure
      // (back to threshold) re-opens the circuit immediately.
      this.openedAt.delete(name);
      this.failures.set(name, this.threshold - 1);
      return false;
    }
    return true;
  }

  recordSuccess(name: string): void {
    this.failures.delete(name);
    this.openedAt.delete(name);
  }

  recordFailure(name: string): void {
    const next = (this.failures.get(name) ?? 0) + 1;
    this.failures.set(name, next);
    if (next >= this.threshold) this.openedAt.set(name, this.now());
  }

  /** Test/observability helper. */
  snapshot(name: string): { failures: number; open: boolean } {
    return { failures: this.failures.get(name) ?? 0, open: this.isOpen(name) };
  }
}
