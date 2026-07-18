# Lakeside Dental — AI Booking Agent

A full-stack chat app where a user talks to an AI receptionist that **finds slots, books,
and cancels** appointments for the fictional *Lakeside Dental Clinic*.

The LLM decides which tools to call; our code owns the data and every correctness rule.
Built on the **OpenAI SDK directly (no agent frameworks)**, with **Groq as an automatic
fallback** for resilience, a premium **"Warm Clinical"** UI, and a full **testing pyramid**.

> **Docs:** [HLD](docs/HLD.md) · [LLD](docs/LLD.md) · [ADRs](docs/ADR.md) ·
> [Testing](docs/TESTING.md) · [Design System](docs/DESIGN_SYSTEM.md) ·
> [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)

---

## Highlights

- 🧠 **Hand-written tool-calling loop** (bounded, provider-agnostic) with three tools:
  `get_available_slots`, `book_appointment`, `cancel_appointment`.
- 🔁 **Resilient LLM layer** — OpenAI primary → **Groq fallback**, with per-call timeout,
  retry (backoff + jitter), and a **circuit breaker**. Graceful `503` if all providers fail.
- 🛟 **Non-happy path as a first-class citizen** — full days, missing info, double-booking,
  unknown IDs, out-of-range dates, and LLM outages all handled deterministically.
- 🗓️ **In-memory store** (behind a repo interface) seeded with the **next 7 days**, some
  days fully booked, weekends closed; **idempotent booking** survives retries.
- 🎨 **Premium, tokenized UI** — warm cream + coral→pink→purple accent, soft shadows,
  eased motion, `prefers-reduced-motion` support. Not "vibe-coded."
- 🧪 **Full test pyramid** — unit → contract → provider/failover → agent-eval → integration
  → component → E2E → a11y, with coverage weighted by blast radius.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript + Express |
| LLM | OpenAI SDK (primary) + Groq (fallback), Chat Completions + tools |
| Frontend | React + Vite, "Warm Clinical" design system |
| Storage | In-memory (repo interface), seeded on boot |
| Testing | Vitest · RTL · MSW · Supertest · Playwright · axe · autocannon |

---

## Architecture at a Glance

```
React SPA ─POST /api/chat─▶ Express (edge: CORS·rate-limit·validate·correlation-id)
                                  │
                                  ▼
                          Agent loop (bounded) ──▶ LLM provider layer
                                  │                 OpenAI (1°) → Groq (2°)
                                  ▼                 timeout · retry · breaker
                          Tool handlers ──▶ In-memory store (7-day seed)
```

**Key decision:** the LLM handles *language* (intent, relative dates, tone, asking for
missing info); our **code handles *truth*** (which slots exist, atomic + idempotent
booking, validation, IDs). Tools return structured `{ ok, data | error }` and the model
is instructed never to claim success unless a tool confirmed it. Rationale in
[docs/HLD.md](docs/HLD.md) and [docs/ADR.md](docs/ADR.md).

---

## Getting Started

### Prerequisites
- Node.js ≥ 18
- An OpenAI API key (and optionally a Groq key for the fallback)

### 1. Configure environment
```bash
cp .env.example .env
# open .env, paste OPENAI_API_KEY and GROQ_API_KEY (either alone also works)
```

### 2. Backend
```bash
cd server && npm install && npm run dev   # http://localhost:8787
```

### 3. Frontend
```bash
cd web && npm install && npm run dev       # http://localhost:5173
```

Open http://localhost:5173 and start chatting.

> **Single `.env` for both packages:** `web/vite.config.ts` sets `envDir:'../'` so Vite
> reads the same root `.env` as the server. Only `VITE_`-prefixed vars reach the browser;
> the API keys never do.

---

## Environment Variables

See [.env.example](.env.example). Summary:

| Var | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | — | Primary LLM auth (server-side only). |
| `OPENAI_MODEL` | — | `gpt-4o-mini` | Primary model. |
| `GROQ_API_KEY` | ⚠️ rec. | — | Fallback LLM auth. Omit to run single-provider. |
| `GROQ_MODEL` | — | `llama-3.3-70b-versatile` | Fallback model. |
| `LLM_TIMEOUT_MS` | — | `20000` | Per-call deadline before abort. |
| `LLM_MAX_RETRIES` | — | `2` | Transient-error retries before failover. |
| `BREAKER_THRESHOLD` / `BREAKER_COOLDOWN_MS` | — | `3` / `30000` | Circuit-breaker tuning. |
| `MAX_TOOL_ITERS` | — | `5` | Safety bound on the tool loop. |
| `PORT` / `WEB_ORIGIN` | — | `8787` / `:5173` | Server port / CORS origin. |
| `RATE_LIMIT_PER_MIN` | — | `60` | Per-IP request cap. |
| `VITE_API_BASE` | — | `http://localhost:8787` | Frontend → backend base URL. |

---

## Testing

```bash
npm test          # watch: unit + contract + provider + agent + integration + component
npm run test:ci   # one-shot, coverage, used by CI
npm run test:e2e  # Playwright end-to-end (LLM stubbed)
npm run test:eval # optional: advisory behavioral evals against a real LLM
```

Determinism is engineered in: an **injected clock**, **mocked providers**, and **scripted
agent runs** mean CI never depends on a live LLM. Failure modes (failover, breaker,
timeout, double-book, PII-in-logs) are tested as first-class cases. Full strategy:
[docs/TESTING.md](docs/TESTING.md).

---

## Try These (demo script)

1. **Availability:** "What's open tomorrow?"
2. **Fully booked:** "Any slots today?" → today is seeded full → agent offers other days.
3. **Book:** "Book the 2pm Thursday. Name Priya Rao, phone 555-0142." → confirms with a ref.
4. **Missing info:** "Book me the 9am Wednesday" → agent asks for name & phone.
5. **Double-book / retry:** book a slot, then repeat → idempotent, no duplicate.
6. **Cancel:** "Cancel appointment appt_xxx" → frees the slot.
7. **Cancel unknown:** "Cancel appt_zzz" → agent says it can't find it.
8. **Out of range:** "Anything two weeks out?" → agent explains the 7-day window.
9. **Weekend:** "Slots this Saturday?" → closed.
10. **Resilience (optional):** set a bad `OPENAI_API_KEY` → watch logs fail over to Groq.

---

## Project Layout

```
docs/               HLD, LLD, ADR, TESTING, DESIGN_SYSTEM, implementation plan
design-tokens.json  Machine-readable theme tokens
server/             Express + TS API (agent loop, provider failover, tools, store)
web/                React + Vite chat UI (Warm Clinical theme)
.env.example        Environment template
```

Module-level breakdown in [docs/LLD.md](docs/LLD.md).

---

## Design Notes & Trade-offs

- **In-memory store / sessions** — behind interfaces; documented one-file swap to Redis/DB.
- **Bounded tool loop + circuit breaker** — predictable cost, latency, and failure behavior.
- **Reproducible seed** — today + day 3 fully booked so the "no availability" path always demos.
- **Low temperature** — predictable tool use.
- **PII discipline** — patient name/phone never logged; keys server-side only.

Every decision here is deliberate and recorded in [docs/ADR.md](docs/ADR.md) — not
incidental to any tool that helped write it. *"The AI wrote it that way" is not an answer.*
