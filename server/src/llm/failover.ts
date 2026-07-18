import type { AssistantMessage, ChatRequest, LLMProvider } from "./types.js";
import { CircuitBreaker } from "./breaker.js";
import { classifyError } from "./errors.js";
import { LlmUnavailableError } from "../middleware/errors.js";
import { logger } from "../obs/logger.js";

export interface FailoverConfig {
  timeoutMs: number;
  maxRetries: number;
  breaker: CircuitBreaker;
  /** Base backoff before exponential growth + jitter. */
  baseBackoffMs?: number;
  /** Injectable for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  cid?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ordered failover across providers with per-provider resilience.
 *
 * For each provider (skipping any whose circuit is open) we attempt the call
 * with a timeout and bounded retries (exponential backoff + jitter) for transient
 * errors. Non-retryable errors (429/auth) fail the provider immediately. When a
 * provider is exhausted we move to the next; when all are exhausted we throw
 * LlmUnavailableError, which the API layer turns into a graceful 503.
 */
export class FailoverProvider implements LLMProvider {
  readonly name = "failover";
  private lastUsedProvider = "";

  constructor(
    private readonly providers: LLMProvider[],
    private readonly cfg: FailoverConfig,
  ) {
    if (providers.length === 0) throw new Error("FailoverProvider requires at least one provider");
  }

  /** Which provider actually served the most recent successful call. */
  get lastUsed(): string {
    return this.lastUsedProvider;
  }

  async createChatCompletion(req: ChatRequest): Promise<AssistantMessage> {
    const log = this.cfg.cid ? logger.child(this.cfg.cid) : logger;
    let lastError: unknown;

    for (const provider of this.providers) {
      if (this.cfg.breaker.isOpen(provider.name)) {
        log.warn("llm_provider_skipped_open_circuit", { provider: provider.name });
        continue;
      }
      try {
        const res = await this.callWithResilience(provider, req);
        this.cfg.breaker.recordSuccess(provider.name);
        this.lastUsedProvider = provider.name;
        return res;
      } catch (e) {
        lastError = e;
        this.cfg.breaker.recordFailure(provider.name);
        const { reason, status } = classifyError(e);
        log.warn("llm_provider_failed", { provider: provider.name, reason, status });
        // Move to the next provider.
      }
    }

    log.error("llm_all_providers_exhausted", {
      message: lastError instanceof Error ? lastError.message : String(lastError),
    });
    throw new LlmUnavailableError();
  }

  private async callWithResilience(provider: LLMProvider, req: ChatRequest): Promise<AssistantMessage> {
    const sleep = this.cfg.sleep ?? defaultSleep;
    const random = this.cfg.random ?? Math.random;
    const base = this.cfg.baseBackoffMs ?? 250;

    let attempt = 0;
    for (;;) {
      try {
        return await this.callWithTimeout(provider, req);
      } catch (e) {
        const { retryable } = classifyError(e);
        if (!retryable || attempt >= this.cfg.maxRetries) throw e;
        // Exponential backoff with full jitter: random in [0, base * 2^attempt].
        const delay = Math.round(random() * base * 2 ** attempt);
        attempt += 1;
        await sleep(delay);
      }
    }
  }

  private async callWithTimeout(provider: LLMProvider, req: ChatRequest): Promise<AssistantMessage> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    try {
      return await provider.createChatCompletion({ ...req, signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
