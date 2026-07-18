# Architecture Decision Records (ADRs)

Short, dated records of the decisions that shaped this system and *why*. Each is a
deliberate, owned choice — the trade-offs are stated so a reviewer can challenge them.

Format: **Context → Decision → Consequences → Alternatives considered.**

---

## ADR-001 — Call the OpenAI SDK directly, no agent framework
**Status:** Accepted · 2026-07-19

**Context.** The brief forbids agent frameworks (LangChain, Vercel AI SDK agents). We
need a tool-calling loop we fully understand and can defend line by line.

**Decision.** Implement the loop by hand: call Chat Completions with `tools`, execute
returned `tool_calls`, append `role:"tool"` results, repeat until a text answer or a
`MAX_TOOL_ITERS` bound.

**Consequences.** Full control and transparency; trivial to test with scripted
responses; we own ret/failover/observability. More boilerplate than a framework, which
is acceptable and educational.

**Alternatives.** Framework agents (banned, and hide the loop); Assistants API (server
state we don't control, harder to test).

---

## ADR-002 — Provider abstraction with OpenAI primary, Groq fallback
**Status:** Accepted · 2026-07-19

**Context.** A single LLM vendor is a single point of failure (outage, rate limits,
latency spikes). The user asked for Groq as a fallback. Both expose an OpenAI-compatible
Chat Completions + tool-calling API.

**Decision.** Define an `LLMProvider` interface. A `FailoverProvider` wraps
`[OpenAIProvider, GroqProvider]`: try primary with timeout + bounded retry; on
error/timeout/429 or an open circuit, fail over to Groq. Tool schemas and the loop are
provider-agnostic.

**Consequences.** Resilience and vendor independence; testable via a fake provider.
Slightly more config (two keys, two model names). Models differ subtly in tool-calling
quality — mitigated by keeping tool schemas strict and the system prompt explicit.

**Alternatives.** Single provider (fragile); a gateway/proxy like LiteLLM (extra infra,
another dependency to justify).

---

## ADR-003 — In-memory store behind a repository interface
**Status:** Accepted · 2026-07-19

**Context.** The brief allows an in-memory store. We still want a clean seam to a real
DB later.

**Decision.** All persistence goes through a `Store`/repository interface. The default
impl is a `Map`-backed in-memory store seeded from an injected `today`. Nothing outside
the domain layer touches the maps directly.

**Consequences.** Pure, fast, 100%-testable domain logic; a documented one-file swap to
Postgres/Redis. Data resets on restart (acceptable for a demo; stated explicitly).

**Alternatives.** SQLite (persistence we don't need in 90 min); scattering state in the
route handlers (untestable, would leak).

---

## ADR-004 — LLM handles language, code owns truth
**Status:** Accepted · 2026-07-19

**Context.** The riskiest failure is the model *claiming* a booking that didn't happen,
inventing slots, or fabricating IDs.

**Decision.** Split responsibilities explicitly (see HLD §4). Tools are strict and
return a discriminated `{ ok, data | error }`. The system prompt forbids asserting
success unless a tool confirmed it. IDs are generated only in code.

**Consequences.** Hallucinated state is structurally prevented; errors become
deterministic codes the model merely relays. Requires disciplined prompt + strict schemas.

**Alternatives.** Let the model reason about availability (unsafe); free-text tool
outputs (ambiguous, hard to test).

---

## ADR-005 — Idempotent booking to survive retries & double-clicks
**Status:** Accepted · 2026-07-19

**Context.** Retries (network, failover) and double-taps can re-issue `book_appointment`,
risking duplicate bookings.

**Decision.** `book_appointment` is idempotent per `(slotId)`: a slot already booked to
the same patient within the turn returns the existing appointment rather than erroring or
double-booking. An optional client `idempotencyKey` collapses identical retried requests.

**Consequences.** Safe under at-least-once delivery; no phantom double-bookings.
Slightly more logic in the booking handler, covered by tests.

**Alternatives.** Naive book (duplicates on retry); a distributed lock (overkill for a
single-process in-memory store — Node's single thread already serializes the check-set).

---

## ADR-006 — Bounded, observable agent loop
**Status:** Accepted · 2026-07-19

**Context.** A tool loop can ping-pong forever (bad args retried, model indecision) and
is otherwise a black box.

**Decision.** Cap iterations at `MAX_TOOL_ITERS`; emit structured logs per turn
(correlation id, provider used, tool name, latency, ok/err) and a `toolTrace` in the
response for demo transparency. No PII (name/phone) in logs.

**Consequences.** Predictable cost and latency ceiling; debuggable live. A capped loop
can occasionally give up — handled with a graceful fallback message.

**Alternatives.** Unbounded loop (runaway cost/latency); no logging (undebuggable).

---

## ADR-007 — Server-side session store behind an interface
**Status:** Accepted · 2026-07-19

**Context.** Conversation history must persist across turns; we may scale later.

**Decision.** `SessionStore` interface with an in-memory `Map<sessionId, Message[]>`
default. History and the system prompt live server-side, keyed by a client-generated
`sessionId`.

**Consequences.** Simple, keeps prompt/tokens off the wire each turn; Redis swap is a
one-file change. In-memory means sessions reset on restart and don't share across
instances (documented).

**Alternatives.** Client sends full history each turn (stateless server, but larger
payloads and client can tamper with the system prompt).

---

## ADR-008 — Resilience patterns: timeout, retry-with-jitter, circuit breaker, graceful degradation
**Status:** Accepted · 2026-07-19

**Context.** External LLM calls are the least reliable part of the system.

**Decision.** Every provider call has an `AbortController` timeout; transient failures
retry with exponential backoff + jitter (bounded); repeated failures trip a per-provider
circuit breaker that short-circuits to the fallback; total exhaustion returns a friendly
`503` envelope. The UI shows a retry-able message.

**Consequences.** The app degrades gracefully instead of hanging or 500-ing. More moving
parts, all unit-tested with fake timers.

**Alternatives.** Fire-and-hope single call (hangs on slow API, cascades failures).

---

## ADR-009 — Vitest + Playwright + MSW test stack
**Status:** Accepted · 2026-07-19

**Context.** Need fast, deterministic tests around a non-deterministic LLM.

**Decision.** Vitest for unit/integration/component, MSW to mock providers at the network
layer, Supertest for HTTP, Playwright for E2E, axe for a11y. Deterministic tests gate CI;
real-LLM evals are advisory. (Full plan in [TESTING.md](./TESTING.md).)

**Consequences.** Sub-second feedback, no flaky CI. Real-model behavior is checked
separately and doesn't block merges.

**Alternatives.** Jest (heavier ESM/TS setup); testing against the live LLM in CI (slow,
flaky, costs money).

---

## ADR-010 — "Warm Clinical" design system with tokenized theme
**Status:** Accepted · 2026-07-19

**Context.** The UI must read as premium and calm (Pythagoras AI–style), not
"vibe-coded", with smooth motion and non-harsh colors.

**Decision.** A tokenized design system (JSON + CSS variables) with a warm cream base, a
single coral→pink→purple accent, soft warm shadows, a real type scale, and eased motion
tokens honoring `prefers-reduced-motion`. Components reference tokens only.
(See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).)

**Consequences.** Visual consistency, easy theming, accessible by construction. Requires
loading two web fonts (degrades to system fonts offline).

**Alternatives.** A component library (Material/Chakra — recognizable, off-brand);
ad-hoc CSS (drifts into the "vibe-coded" look we're avoiding).
