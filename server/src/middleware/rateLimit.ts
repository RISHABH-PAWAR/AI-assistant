import rateLimit from "express-rate-limit";
import { config } from "../config.js";

/** Per-IP token bucket. Protects the LLM budget and the process from abuse. */
export const rateLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.rateLimitPerMin,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});
