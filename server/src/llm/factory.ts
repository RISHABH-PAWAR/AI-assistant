import { config } from "../config.js";
import { CircuitBreaker } from "./breaker.js";
import { FailoverProvider } from "./failover.js";
import { createGroqProvider, createOpenAIProvider } from "./openaiCompatible.js";
import type { LLMProvider } from "./types.js";
import { logger } from "../obs/logger.js";

// Build vendor adapters once (stateless HTTP clients). Order defines failover
// priority: OpenAI primary, Groq fallback.
const providers: LLMProvider[] = [];
if (config.llm.openai) providers.push(createOpenAIProvider(config.llm.openai));
if (config.llm.groq) providers.push(createGroqProvider(config.llm.groq));

// One breaker shared across requests so failure state accumulates per provider.
const breaker = new CircuitBreaker(config.llm.breakerThreshold, config.llm.breakerCooldownMs);

logger.info("llm_providers_configured", { providers: providers.map((p) => p.name) });

export function isLlmConfigured(): boolean {
  return providers.length > 0;
}

/**
 * A per-request failover provider (cheap wrapper) that shares the adapters and
 * breaker. `cid` threads the correlation id into resilience logs.
 */
export function makeFailoverProvider(cid?: string): FailoverProvider {
  return new FailoverProvider(providers, {
    timeoutMs: config.llm.timeoutMs,
    maxRetries: config.llm.maxRetries,
    breaker,
    cid,
  });
}
