# Testing Strategy

Testing is designed around one principle: **the LLM is non-deterministic, so everything
around it must be deterministic and independently testable.** We push correctness into
pure functions (store, tool handlers, validation) that need no network, and we test the
agent loop with a *mocked* provider so runs are fast and reproducible.

```
             ▲  fewer, slower, higher-confidence
        ┌────┴────┐
        │   E2E   │   Playwright: real browser drives the chat UI (LLM mocked at the network)
        ├─────────┤
        │  Integr.│   Supertest: POST /api/chat with a mocked LLM provider + real store
        │ + Agent │   Agent-eval: recorded tool-call scripts replayed through the loop
        ├─────────┤
        │Component│   React Testing Library: bubbles, composer, states
        ├─────────┤
        │  Unit   │   Vitest: store, seeding, date logic, validation, provider failover
        └─────────┘
             ▼  many, fast, run on every save
```

**Tooling:** Vitest (unit/integration/component), React Testing Library, MSW (mock
LLM + API at the network layer), Supertest (HTTP), Playwright (E2E), axe-core (a11y),
autocannon (smoke load). All wired to `npm test` and a CI-friendly `npm run test:ci`.

---

## 1. Unit Tests (pure, no network) — the backbone

| Target | Cases |
|---|---|
| `store.seed(today)` | Correct # of days (7), slots/day (16), 1st & 4th weekdays fully booked, weekends closed, deterministic scattered pattern. |
| `store.book()` | Books an open slot; **rejects a second book of the same slot** (double-book guard); flips `isBooked`. |
| `store.cancel()` | Frees the slot; removes the appointment; unknown id → not found. |
| `slots.getAvailableSlots()` | `BAD_DATE`, `OUT_OF_RANGE` (past / >7d), `NO_SLOTS` (full vs closed), success shape. |
| `booking.bookAppointment()` | `INVALID_NAME`, `INVALID_PHONE`, `SLOT_NOT_FOUND`, `SLOT_TAKEN`, success. |
| `booking.cancelAppointment()` | `NOT_FOUND`, success. |
| Date utils | Relative-window math is timezone-stable given an injected `today`. |

Because `seed(today)` and every handler take an **injected clock**, these run in
milliseconds and never flake.

---

## 2. Contract Tests — schema ↔ handler stay in sync

The three OpenAI tool JSON-schemas and their handlers must not drift.

- Every `required` parameter in a tool schema has a matching validation path in its handler.
- `dispatchTool(name, args)` rejects unknown tool names and malformed `args` with a
  structured error (never throws across the boundary).
- Golden snapshot of the exported `toolSchemas` so accidental schema changes are visible
  in review.

---

## 3. Provider / Failover Tests — the resilience core

The LLM layer is behind an `LLMProvider` interface with **primary (OpenAI) → fallback
(Groq)** failover, a timeout, bounded retries, and a circuit breaker. All tested with a
**fake provider**, no real API:

| Scenario | Expected |
|---|---|
| Primary succeeds | Fallback never called. |
| Primary throws 500 / network error | Retries, then fails over to Groq; response returned. |
| Primary times out (`> LLM_TIMEOUT_MS`) | Aborted; failover to Groq. |
| Primary 429 (rate limit) | Immediate failover (no pointless retry). |
| Both providers down | Returns a graceful `LLM_UNAVAILABLE` error envelope, not a 500 stack. |
| Circuit breaker open | Primary skipped entirely until cooldown elapses. |
| Retry backoff | Exponential + jitter; retry count bounded by `LLM_MAX_RETRIES`. |

Fixtures use fake timers so timeout/backoff tests are instant and deterministic.

---

## 4. Agent-Loop / Eval Tests — behavior without an LLM

We replay **scripted provider responses** through the real agent loop to assert the
*mechanics* are correct regardless of which model is used:

- Two-step tool chain (`get_available_slots` → `book_appointment`) drives the store to
  the right final state.
- A tool error (`SLOT_TAKEN`) is fed back and the loop makes a follow-up model call
  (doesn't crash or claim success).
- `MAX_TOOL_ITERS` is enforced — a provider that keeps emitting tool calls terminates
  with the safety-valve message.
- Malformed `tool_calls.arguments` JSON → structured tool error, loop continues.

Plus a small **behavioral eval suite** (opt-in, real API, `npm run test:eval`) with
rubric-style assertions on transcripts: "does not confirm a booking unless a tool
succeeded", "asks for phone when missing", "offers alternatives when a day is full".
These are advisory (LLMs vary) and excluded from CI gating.

---

## 5. Integration Tests (HTTP) — the API contract

Supertest against the Express app with the LLM provider mocked via MSW:

- `POST /api/chat` happy path → `{ reply, toolTrace }`, correct shape.
- Session continuity: two calls with the same `sessionId` share history.
- Validation: missing `message`/`sessionId` → `400 { error }`.
- Provider outage → friendly `503 { error }`, never a leaked stack trace.
- CORS: disallowed origin is rejected; `WEB_ORIGIN` is allowed.
- Health/readiness endpoints return expected payloads.

---

## 6. Component Tests (React) — UI units

React Testing Library, provider/network mocked:

- Composer: Enter submits, Shift+Enter newlines, empty input disabled, disabled while loading.
- Optimistic user bubble appears immediately; assistant bubble on response.
- Error state renders an inline, retry-able message.
- Typing indicator shows during load and clears after.

---

## 7. E2E Tests (Playwright) — the whole thing

Real browser, backend running, **LLM stubbed at the network** for determinism:

1. Load → greeting + suggestion chips visible.
2. "What's open tomorrow?" → availability rendered.
3. Book with name + phone → confirmation bubble with an `appt_…` reference.
4. Cancel that reference → freed confirmation.
5. Full-day request → "offer other days" copy.
6. Network-failure injection → graceful error UI.

---

## 8. Accessibility Tests

- `axe-core` assertion on the chat view (0 serious/critical violations).
- Keyboard-only path: focus input → type → Enter → focus stays usable.
- Contrast tokens verified against WCAG AA (see Design System §2).
- `prefers-reduced-motion` disables animations (asserted via CSS/DOM check).

---

## 9. Non-Functional / Smoke

- **Load smoke:** `autocannon` a mocked-LLM `/api/chat` to confirm the store and loop
  hold up under light concurrency (and to catch accidental global mutable-state bugs).
- **Config validation:** app fails fast at boot if `OPENAI_API_KEY` is missing —
  asserted in a test.
- **No-PII-in-logs:** a test scans emitted log lines to ensure phone/name aren't logged raw.

---

## 10. Coverage & CI Gates

| Layer | Target |
|---|---|
| Domain (store, handlers, validation) | **100%** lines/branches — this is where money bugs live. |
| Provider/failover + agent loop | **≥ 90%** |
| Overall | **≥ 80%** |

CI runs, in order: typecheck → lint → unit → contract → integration → component →
build → E2E (headless). Eval + load are manual/nightly. A red bar blocks merge.

### Test file layout
```
server/src/**/__tests__/*.test.ts      # unit, contract, provider, agent, integration
server/test/fixtures/                  # scripted provider responses, seed snapshots
web/src/**/__tests__/*.test.tsx        # component
web/tests/e2e/*.spec.ts                # Playwright
```

---

## 11. Why This Is "Senior"

- Determinism engineered *in*: injected clock, mocked providers, scripted agent runs —
  no flaky "call the real LLM and hope" tests in CI.
- The failure modes are tested as first-class citizens (failover, breaker, timeouts,
  double-book, PII), not afterthoughts.
- Coverage is weighted by blast radius (100% on the store), not chased as a vanity number.
- Clear separation between **deterministic gates** (block CI) and **advisory evals**
  (inform, don't block).
