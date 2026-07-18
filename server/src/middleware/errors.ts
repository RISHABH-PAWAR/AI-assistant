import type { NextFunction, Request, Response } from "express";
import { logger } from "../obs/logger.js";

/**
 * Application-level error with a stable HTTP status and a client-safe message.
 * Anything thrown that is NOT an AppError is treated as an unexpected 500 and its
 * details are never leaked to the client.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    override readonly message: string,
    readonly code: string = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class LlmUnavailableError extends AppError {
  constructor(message = "The assistant is temporarily unavailable. Please try again.") {
    super(503, message, "LLM_UNAVAILABLE");
  }
}

/** 404 handler for unmatched routes. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

/** Central error middleware — the only place that formats error responses. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.child(req.cid).error("request_failed", { code: err.code, status: err.status });
    }
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Unknown error: log server-side, return a generic message (no stack leak).
  logger.child(req.cid ?? "-").error("unhandled_error", {
    message: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ error: "Something went wrong. Please try again." });
}
