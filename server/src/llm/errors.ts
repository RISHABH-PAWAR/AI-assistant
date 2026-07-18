/**
 * Error classification for the resilience layer. We distinguish:
 *  - retryable: transient failures worth another attempt on the SAME provider
 *    (network blips, 5xx, request timeouts, aborts).
 *  - non-retryable: retrying the same provider is pointless (429 rate limit,
 *    auth/4xx) — fail over to the next provider immediately.
 */

export interface ClassifiedError {
  retryable: boolean;
  status?: number;
  reason: string;
}

function statusOf(e: unknown): number | undefined {
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return undefined;
}

export function isAbortError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "AbortError" || e.name === "TimeoutError" || /aborted|timed? ?out/i.test(e.message))
  );
}

export function classifyError(e: unknown): ClassifiedError {
  if (isAbortError(e)) return { retryable: true, reason: "timeout/abort" };

  const status = statusOf(e);
  if (status === undefined) {
    // No HTTP status → network/transport error.
    return { retryable: true, reason: "network" };
  }
  if (status === 429) return { retryable: false, status, reason: "rate_limited" };
  if (status === 408) return { retryable: true, status, reason: "request_timeout" };
  if (status >= 500) return { retryable: true, status, reason: "server_error" };
  // 400/401/403/404/... — client errors; another attempt won't help.
  return { retryable: false, status, reason: "client_error" };
}
