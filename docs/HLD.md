# High-Level Design (HLD) — Lakeside Dental Booking Agent

> A chat web app where a user talks to an AI receptionist that books and cancels
> appointments for "Lakeside Dental Clinic". The LLM drives the conversation; our
> code owns the data and the rules.

---

## 1. Goal & Scope

**In scope**
- Natural-language chat to **find slots**, **book**, and **cancel** appointments.
- A correct OpenAI **tool-calling loop** (OpenAI SDK directly — no agent frameworks).
- In-memory data seeded with slots for the **next 7 days**, some days fully booked.
- Graceful handling of the **non-happy path** (no slots, bad input, double-book, etc.).

**Out of scope (explicitly, to stay within time)**
- Persistent DB, auth, payments, real SMS/email, multi-clinic, timezones beyond one.
- Rescheduling as a first-class tool (can be expressed as cancel + book).

---

## 2. System Context

```
   ┌───────────────┐     HTTP/JSON      ┌─────────────────────────────────────────┐
   │  React SPA    │  POST /api/chat    │            Express + TS API              │
   │  (chat UI,    │ ─────────────────▶ │  ┌────────────────────────────────────┐  │
   │  Warm Clinical│ ◀───────────────── │  │  Edge: CORS · rate-limit · validate │  │
   │  design)      │  { reply, trace }  │  │        · correlation-id             │  │
   └───────────────┘                    │  └───────────────┬────────────────────┘  │
                                        │                  ▼                        │
                                        │        Agent orchestrator (bounded loop)  │
                                        │                  │                        │
                                        │        ┌─────────┴──────────┐             │
                                        │        ▼                    ▼             │
                                        │  Tool layer           LLM provider layer  │
                                        │  get_available_slots   ┌────────────────┐ │
                                        │  book_appointment      │ Failover:      │ │
                                        │  cancel_appointment    │  OpenAI (1°) → │ │
                                        │        │               │  Groq   (2°)   │ │
                                        │        ▼               │ timeout·retry· │ │
                                        │  In-memory store       │ circuit-breaker│ │
                                        │  (repo interface,      └───────┬────────┘ │
                                        │   seeded 7 days)               │          │
                                        └────────────────────────────────┼──────────┘
                                                                         │ Chat Completions + tools
                                                            ┌────────────┴────────────┐
                                                            ▼                         ▼
                                                     ┌────────────┐            ┌────────────┐
                                                     │ OpenAI API │            │  Groq API  │
                                                     └────────────┘            └────────────┘
```

The frontend never talks to any LLM directly — **all keys stay server-side**. If OpenAI
errors, times out, or is rate-limited, the request **fails over to Groq** transparently
(both speak the OpenAI-compatible tool-calling API). See [ADR-002](ADR.md) and
[ADR-008](ADR.md).

---

## 3. Core Components

| Component | Responsibility |
|---|---|
| **React SPA** | Render the conversation, capture input, POST messages, show loading/errors. Holds a `sessionId`; keeps no business logic. |
| **Express API** | One thin endpoint (`/api/chat`). Owns the agent loop and session history. |
| **Agent orchestrator** | Runs the OpenAI tool-calling loop: model → tool calls → execute → feed results back → repeat until a final text answer. |
| **Tool layer** | Deterministic functions the model may call. Validates inputs, enforces rules, mutates the store. This is where correctness lives. |
| **LLM provider layer** | An `LLMProvider` interface with a `FailoverProvider` wrapping OpenAI (primary) → Groq (fallback). Owns timeouts, retries, and the circuit breaker. Provider-agnostic to the loop. |
| **In-memory store** | Source of truth for slots and appointments during the process lifetime. Seeded on boot. Sits behind a repository interface (Redis/DB-ready). |
| **Edge middleware** | CORS, rate limiting, request validation (zod), correlation-id, structured logging, error envelope. |
| **System prompt** | Defines the receptionist persona, the current date, and the rules the model must follow (ask for missing info, confirm before booking, never invent slots). |

---

## 4. Key Design Decision — LLM vs. Code

The single most important split. Rule of thumb: **the LLM handles language; our code handles truth.**

| Concern | Owner | Why |
|---|---|---|
| Understanding intent ("cancel my Tuesday appt") | **LLM** | Natural language is what it's good at. |
| Turning "tomorrow"/"next Monday" into a concrete date | **LLM** (given today's date in the prompt) | Cheap, flexible; the tool still validates the result. |
| Which slots actually exist / are open | **Code** | Must be real data, never hallucinated. |
| Booking a slot (atomic, no double-book) | **Code** | Correctness & concurrency — model must not "decide" this. |
| Validating name / phone presence & format | **Code** | Deterministic rules belong in code; returned as tool errors the model can relay. |
| Generating IDs | **Code** | Model must never fabricate an `appointmentId`. |
| Deciding what info is still missing, asking for it, tone, confirmation | **LLM** | Conversation management. |
| Refusing impossible requests (past dates, unknown slot) | **Code returns an error → LLM explains it** | Code is the gate; LLM is the messenger. |

**Consequence:** tools are strict and return structured success/error objects. The model
is instructed to *never* claim a booking succeeded unless a tool said so.

---

## 5. Request Flow (happy path)

1. User: "Can I get a cleaning next Tuesday morning?"
2. SPA `POST /api/chat { sessionId, message }`.
3. Server appends the user message to that session's history, calls OpenAI with the tool schema.
4. Model returns a `tool_calls` for `get_available_slots(date)`.
5. Server executes the tool against the store, appends the tool result, calls OpenAI again.
6. Model asks a clarifying/confirming question or emits a final assistant message.
7. Server returns the final assistant text (and optionally the tool trace) to the SPA.

Booking follows the same loop but adds a confirmation turn before `book_appointment`.

---

## 6. Non-Happy-Path Strategy (what makes this feel like a real receptionist)

| Situation | Behavior |
|---|---|
| Day fully booked | Tool returns `[]`; model offers nearby days. |
| No slots at all for a date | Same; model suggests alternatives from the 7-day window. |
| Missing name or phone at booking | Tool returns a validation error; model asks for the missing field. |
| Invalid / already-taken `slotId` | Tool returns `SLOT_TAKEN` / `SLOT_NOT_FOUND`; model apologizes, re-fetches slots. |
| Cancel unknown `appointmentId` | Tool returns `NOT_FOUND`; model says it can't find that booking. |
| Past or out-of-window date | Tool returns `OUT_OF_RANGE`; model explains the 7-day window. |
| Primary LLM (OpenAI) fails/times-out/rate-limits | Transparent failover to Groq; user sees no difference. |
| Both LLM providers down | Graceful `503` envelope; SPA shows a retry-able message, never a stack trace. |
| Model tries to double-book / invent a slot | Store rejects; model must relay the failure rather than lie. |

---

## 7. Resilience & Reliability

The LLM call is the least reliable dependency, so it is wrapped in defense-in-depth
(detailed in [ADR-008](ADR.md), tested per [TESTING.md](TESTING.md) §3):

| Pattern | What it does |
|---|---|
| **Timeout** | Every provider call has an `AbortController` deadline (`LLM_TIMEOUT_MS`); slow calls are cut, not left hanging. |
| **Retry w/ backoff + jitter** | Transient 5xx/network errors retry up to `LLM_MAX_RETRIES` with exponential backoff and jitter. 429s skip retry and fail over immediately. |
| **Failover** | On primary exhaustion, switch to Groq. Same tools, same loop. |
| **Circuit breaker** | Repeated primary failures trip a breaker that short-circuits to the fallback until a cooldown elapses — avoids hammering a down provider. |
| **Bounded loop** | `MAX_TOOL_ITERS` caps tool ping-pong; a non-converging loop returns a graceful message. |
| **Idempotent booking** | Retries/double-clicks can't create duplicate bookings ([ADR-005](ADR.md)). |
| **Graceful degradation** | Total LLM outage → friendly `503` envelope; UI shows a retry-able message, never a stack trace. |

## 8. Observability

- **Correlation id** per request, threaded through logs and returned to the client.
- **Structured logs** per agent turn: which provider served it, tool name, latency,
  ok/err, iteration count, failover count.
- **`toolTrace`** returned in the response for live-demo transparency (which tools ran).
- **Health/readiness** endpoints (`/health`, `/ready`) for uptime checks.
- **PII discipline:** patient name/phone are **never** written to logs (asserted by a test).

## 9. Security & Privacy

- All API keys are **server-side only**; only `VITE_`-prefixed, non-secret values reach
  the browser bundle.
- Input validation (zod) on every request; strict CORS to `WEB_ORIGIN`; security headers
  (helmet); per-IP rate limiting.
- Prompt-injection posture: tools are the only way to mutate state, and they validate
  independently of model output — a manipulated prompt still can't double-book or forge
  an appointment.
- No PII in logs or error messages returned to the client.

## 10. Non-Functional Notes

- **Statefulness:** conversation history lives behind a `SessionStore` interface
  (in-memory `Map` default; Redis-ready — [ADR-007](ADR.md)).
- **Determinism:** low temperature for predictable tool use; deterministic seed for a
  reproducible demo.
- **Config safety:** the server validates env at boot and **fails fast** if a required
  key is missing.
- **Config:** timeouts, retries, model names, and both provider keys via `.env`.

---

## 11. Diagram — Agent Loop

```
receive user message
        │
        ▼
append to history ──▶ call OpenAI (messages + tools)
                              │
                    finish_reason?
                    ┌─────────┴──────────┐
              tool_calls              stop / text
                    │                     │
        execute each tool           return assistant
        append tool results         text to client
                    │
                    └──▶ (loop, up to MAX_ITERS)
```

## Related documents
- [LLD.md](LLD.md) — schemas, types, provider abstraction, store implementation.
- [ADR.md](ADR.md) — the decisions behind this design and their trade-offs.
- [TESTING.md](TESTING.md) — how every layer (incl. failover) is verified.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — the "Warm Clinical" theme.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — phase-by-phase build order.
