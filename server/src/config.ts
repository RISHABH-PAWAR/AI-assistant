import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

// Load the single root .env (shared with the web package). Server lives at
// <root>/server/src, so the root is two levels up.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../.env") });

// Treat blank env values ("") as absent — a common .env footgun where an
// unfilled key like `GROQ_API_KEY=` would otherwise fail a min-length check.
const optionalSecret = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().min(1).optional(),
);

/**
 * Environment schema. The server refuses to boot if required values are missing
 * or malformed (fail-fast) — see ADR-003 / IMPLEMENTATION_PLAN Phase 0.
 */
const EnvSchema = z
  .object({
    OPENAI_API_KEY: optionalSecret,
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    GROQ_API_KEY: optionalSecret,
    GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),

    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
    LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
    BREAKER_THRESHOLD: z.coerce.number().int().positive().default(3),
    BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(30_000),
    MAX_TOOL_ITERS: z.coerce.number().int().positive().default(5),

    PORT: z.coerce.number().int().positive().default(8787),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),
    RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .refine((e) => e.OPENAI_API_KEY || e.GROQ_API_KEY, {
    message: "At least one LLM provider key is required (OPENAI_API_KEY or GROQ_API_KEY).",
    path: ["OPENAI_API_KEY"],
  });

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // Fail fast with a readable message, no secrets echoed.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);

/** Derived, structured config consumed across the app. */
export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  webOrigin: env.WEB_ORIGIN,
  rateLimitPerMin: env.RATE_LIMIT_PER_MIN,
  logLevel: env.LOG_LEVEL,
  maxToolIters: env.MAX_TOOL_ITERS,
  llm: {
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    breakerThreshold: env.BREAKER_THRESHOLD,
    breakerCooldownMs: env.BREAKER_COOLDOWN_MS,
    openai: env.OPENAI_API_KEY
      ? { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL }
      : null,
    groq: env.GROQ_API_KEY
      ? { apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL }
      : null,
  },
} as const;

export type AppConfig = typeof config;

// Re-export the pure parser so tests can exercise validation without the module side effect.
export const __test = { parseEnv, EnvSchema };
