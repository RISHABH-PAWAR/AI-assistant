# Implementation Plan — Phase by Phase

A staged build for the Lakeside Dental agent. Each **phase** is a vertical slice that
ends in something runnable and testable, so progress is always demonstrable and the last
finished phase is a working deliverable.

**Guiding principles**
- Correct **data + tools** first, LLM second, UI last (highest-risk / highest-value first).
- Push correctness into **pure, testable** code; keep the LLM to language.
- Every phase ships with its tests (see [TESTING.md](TESTING.md)); a red bar blocks the next phase.
- Ship the **failover** and **design system** as first-class, not bolt-ons.

Legend: ⏱ rough effort · 🎯 exit criteria · 🧪 tests added this phase.

---

## Phase 0 — Foundations & guardrails  ⏱ ~10%
Scaffold both apps and the safety rails so nothing is retrofitted later.

- Monorepo layout: `server/` (Express + TS, `tsx` dev), `web/` (Vite React-TS).
- `web/vite.config.ts` → `envDir:'../'` so both read the single root `.env`.
- `config.ts`: load + **validate env with zod, fail fast** on missing keys.
- `obs/logger.ts`: structured, PII-safe logger. `middleware/`: correlation-id, error
  envelope, per-IP rate limit, helmet, CORS→`WEB_ORIGIN`.
- Design tokens wired in: import `styles/tokens.css`, load General Sans + Inter.
- Tooling: Vitest, RTL, MSW, Supertest, Playwright, ESLint/Prettier, `npm test` + `test:ci`.

🧪 config-fails-fast test; a passing smoke test proving the harness runs.
🎯 `GET /health` → `{ ok:true }`; Vite renders a themed empty shell; CI green.

---

## Phase 1 — Domain core (store + seed + tools)  ⏱ ~18%  ← highest value
The source of truth. **No LLM yet** — this is pure and must be bullet-proof.

- `domain/types.ts` — `Slot`, `Appointment`, `ToolResult`, `ToolErrorCode`.
- `domain/store.ts` — repo interface + in-memory impl + `seed(today)`:
  09:00–16:30 / 30 min (16 slots/day) for today..+6; today & day+3 fully booked;
  weekends closed; others ~30% booked; **deterministic** from injected `today`.
- `domain/slots.ts` — `getAvailableSlots` (`BAD_DATE`/`OUT_OF_RANGE`/`NO_SLOTS`).
- `domain/booking.ts` — `bookAppointment` (idempotent, full validation ladder) +
  `cancelAppointment`.

🧪 **Unit tests to 100%**: seeding shape, availability errors, book, **double-book guard**,
**idempotent re-book**, cancel, cancel-missing, validation.
🎯 A `scratch.ts` prints a full day → book → double-book(reject) → cancel → cancel-missing.

---

## Phase 2 — LLM provider layer with Groq failover  ⏱ ~15%  ← resilience core
The vendor-independent brain stem. Built and tested **before** the loop.

- `llm/provider.ts` — `LLMProvider` interface + request/response types.
- `llm/openai.ts`, `llm/groq.ts` — thin adapters over each OpenAI-compatible API.
- `llm/breaker.ts` — per-provider circuit breaker.
- `llm/failover.ts` — timeout (`AbortController`) + retry (backoff+jitter) + failover +
  breaker; returns `LlmUnavailableError` when all providers exhausted.

🧪 **Failover tests with a fake provider + fake timers**: primary ok; primary 5xx→retry→
Groq; timeout→failover; 429→immediate failover; both down→graceful error; breaker opens/
cools; retry bound respected.
🎯 A tiny script routes a prompt through the failover provider and logs which provider served it.

---

## Phase 3 — Agent orchestration loop  ⏱ ~12%  ← the heart
Wire tools + provider into the bounded tool-calling loop.

- `agent/tools.ts` — three OpenAI tool schemas + `dispatchTool` (routes to domain, never throws).
- `agent/prompt.ts` — system prompt with today's weekday/date + rules.
- `agent/loop.ts` — provider-agnostic loop, `MAX_TOOL_ITERS`, `safeParse` args, `toolTrace`.

🧪 **Agent-eval tests (scripted provider)**: two-step book chain drives store to correct
state; `SLOT_TAKEN` fed back → follow-up call, no false success; malformed args → tool
error, loop continues; iteration cap → safety message.
🎯 A CLI harness holds a full terminal conversation end-to-end. *This alone satisfies
"a working agent" if the UI slips.*

---

## Phase 4 — HTTP API & sessions  ⏱ ~10%
Expose the agent over HTTP with real session continuity.

- `session/store.ts` — `SessionStore` interface + in-memory impl.
- `routes/chat.ts` — `POST /api/chat` (zod-validated) → append user msg → `runAgent` →
  `{ reply, toolTrace }`. `/health`, `/ready`.
- Mount middleware; consistent `{ error }` envelope; friendly `503` on `LlmUnavailable`.

🧪 **Integration (Supertest + MSW-mocked LLM)**: happy path shape, session continuity,
bad input→400, provider outage→503 (no stack leak), CORS allow/deny, PII-not-logged.
🎯 `curl` a multi-turn conversation; failover observable in logs.

---

## Phase 5 — React chat UI ("Warm Clinical")  ⏱ ~18%
The premium, on-brand frontend — tokens only, smooth motion.

- `api.ts` — `postChat` wrapper with error handling + `sessionId` (`crypto.randomUUID`).
- `App.tsx` — messages/loading/error state; optimistic user bubble; auto-scroll.
- Components: `Header` (glyph + live pill), `MessageList`, `MessageBubble` (assistant/user
  gradient), `Composer` (pill input + coral send, Enter/Shift+Enter), `Typing` indicator.
- Empty-state greeting + suggestion chips; inline retry-able error; subtle `toolTrace` line.
- Motion via tokens (`msg-enter`, `typing-pulse`), `prefers-reduced-motion` honored.

🧪 **Component (RTL)**: composer submit/disable, optimistic bubble, error+retry, typing.
🎯 Full app: chat in the browser; looks premium, animates smoothly, no harsh colors.

---

## Phase 6 — End-to-end, accessibility & hardening  ⏱ ~12%
Prove the whole thing and lock quality.

- **E2E (Playwright, LLM stubbed at network)**: greeting → availability → book → cancel →
  full-day path → injected network failure → graceful UI.
- **a11y**: axe (0 serious/critical), keyboard-only path, contrast, reduced-motion.
- **Smoke load** (autocannon, mocked LLM) to catch global mutable-state bugs.
- README "Try these" script verified; final consistency pass on docs.

🎯 All CI gates green (typecheck → lint → unit → contract → integration → component →
build → E2E). Definition of Done met.

---

## Cross-cutting, done continuously
- **Tests every phase** — never deferred to the end.
- **Structured logs + correlation id** from Phase 0.
- **Design tokens** referenced from first pixel (Phase 0), never hard-coded hex.
- **No PII in logs**, keys server-side only, throughout.

---

## Build-order rationale
1. **Store before provider before loop before UI** — you can't test a loop against fake
   data or a flaky LLM; each layer is proven before the next depends on it.
2. **Failover early (Phase 2)** — resilience designed in, not patched on.
3. **CLI before UI (Phase 3)** — de-risks the live demo; the agent is provable without a frontend.
4. **UI last** — most forgiving to cut; the rubric weights the tool loop and edge behavior over pixels.

## Risk / cut list (if behind)
| If short on time… | Cut / simplify |
|---|---|
| UI unfinished | Ship the Phase 3 CLI — still "a working agent." |
| Second provider key missing | Run single-provider; failover code stays, just no fallback target. |
| E2E/load | Rely on unit + integration gates; note the gap in the README. |
| toolTrace UI | Drop the visual; keep the plain reply. |

## Definition of Done (maps to the rubric)
- ✅ Correct, **bounded** tool-calling loop; tools mutate real, validated state.
- ✅ Clear **LLM-vs-code** split, enforced by strict tools ([ADR-004](ADR.md)).
- ✅ **Non-happy path** handled (full days, missing info, double-book, unknown id, range, LLM outage).
- ✅ **Resilient**: OpenAI→Groq failover, timeout, retry, breaker, graceful degradation.
- ✅ **Tested**: deterministic gates across unit→E2E; coverage weighted by blast radius.
- ✅ **Premium UI**: tokenized "Warm Clinical" theme, smooth motion, accessible.
- ✅ Code you'd be glad to maintain: typed, small modules, documented decisions.
