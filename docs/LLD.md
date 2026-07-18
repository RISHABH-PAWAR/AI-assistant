# Low-Level Design (LLD) — Lakeside Dental Booking Agent

Concrete types, tool schemas, store behavior, and the orchestration loop.
Pairs with **HLD.md** (the "why") and **IMPLEMENTATION_PLAN.md** (the "in what order").

---

## 1. Project Structure

```
assignment/
├── docs/                     # HLD, LLD, ADR, TESTING, DESIGN_SYSTEM, plan
├── design-tokens.json        # machine-readable theme tokens
├── server/
│   ├── src/
│   │   ├── index.ts          # Express bootstrap
│   │   ├── config.ts         # env loading & validation (fail-fast)
│   │   ├── middleware/
│   │   │   ├── correlation.ts# request id
│   │   │   ├── rateLimit.ts  # per-IP token bucket
│   │   │   └── errors.ts     # error envelope { error }
│   │   ├── routes/chat.ts    # POST /api/chat handler + zod validation
│   │   ├── agent/
│   │   │   ├── loop.ts       # provider-agnostic tool-calling loop
│   │   │   ├── prompt.ts     # system prompt builder (injects today's date)
│   │   │   └── tools.ts      # tool JSON schemas + dispatchTool()
│   │   ├── llm/
│   │   │   ├── provider.ts   # LLMProvider interface + types
│   │   │   ├── openai.ts     # OpenAIProvider
│   │   │   ├── groq.ts       # GroqProvider
│   │   │   ├── failover.ts   # FailoverProvider (retry/timeout/breaker)
│   │   │   └── breaker.ts    # circuit breaker
│   │   ├── session/
│   │   │   └── store.ts      # SessionStore interface + in-memory impl
│   │   ├── domain/
│   │   │   ├── store.ts      # Store (repo interface) + in-memory impl + seeding
│   │   │   ├── slots.ts      # get_available_slots handler
│   │   │   ├── booking.ts    # book / cancel handlers (idempotent)
│   │   │   └── types.ts      # Slot, Appointment, ToolResult types
│   │   ├── obs/logger.ts     # structured, PII-safe logger
│   │   └── **/__tests__/     # co-located tests (see TESTING.md)
│   ├── test/fixtures/        # scripted provider responses, seed snapshots
│   ├── package.json
│   └── tsconfig.json
├── web/
│   ├── src/
│   │   ├── App.tsx           # chat container + state
│   │   ├── components/       # Header, MessageList, MessageBubble, Composer, Typing
│   │   ├── styles/tokens.css # design tokens (mirrors design-tokens.json)
│   │   ├── api.ts            # fetch wrapper for /api/chat
│   │   ├── main.tsx
│   │   └── **/__tests__/     # component tests
│   ├── tests/e2e/            # Playwright specs
│   ├── vite.config.ts        # envDir:'../' → single root .env
│   ├── index.html
│   └── package.json
├── .env / .env.example       # secrets (gitignored) / template
└── README.md
```

---

## 2. Domain Types

```ts
// domain/types.ts

export interface Slot {
  id: string;            // "2026-07-20T09:00"  (stable, human-debuggable)
  date: string;          // "2026-07-20"  (ISO date, clinic-local)
  time: string;          // "09:00"       (24h, clinic-local)
  isBooked: boolean;
}

export interface Appointment {
  id: string;            // "appt_<nanoid>"
  slotId: string;
  patientName: string;
  patientPhone: string;
  createdAt: string;     // ISO timestamp
}

// Discriminated result all tools return — never throw across the tool boundary.
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ToolErrorCode; message: string };

export type ToolErrorCode =
  | "OUT_OF_RANGE"     // date outside the seeded 7-day window / in the past
  | "BAD_DATE"         // unparseable date string
  | "NO_SLOTS"         // valid date, but nothing open
  | "SLOT_NOT_FOUND"   // unknown slotId
  | "SLOT_TAKEN"       // slot already booked (double-book guard)
  | "INVALID_NAME"     // missing/blank name
  | "INVALID_PHONE"    // missing/malformed phone
  | "NOT_FOUND";       // unknown appointmentId on cancel
```

**Why `id = "<date>T<time>"`:** slot IDs are deterministic and readable, so tool
traces and logs are easy to follow during the live demo. Appointment IDs are opaque
(`appt_...`) because the model should treat them as tokens, not construct them.

---

## 3. In-Memory Store

```ts
// domain/store.ts (behavioral contract)

class Store {
  private slots = new Map<string, Slot>();          // slotId -> Slot
  private appointments = new Map<string, Appointment>(); // apptId -> Appointment

  seed(today: Date): void;                 // build next-7-days slots, mark some full
  getSlotsByDate(date: string): Slot[];    // all slots for a day (booked + open)
  getOpenSlotsByDate(date: string): Slot[];// only open
  getSlot(id: string): Slot | undefined;
  book(slotId, name, phone): Appointment;  // flips isBooked, creates appt — atomic
  getAppointment(id): Appointment | undefined;
  cancel(id: string): Slot;                // deletes appt, frees slot, returns slot
}
```

### Seeding rules
- Generate slots for **today .. today+6** (7 days).
- Business hours **09:00–16:30**, every **30 min** → 16 slots/day.
- Deterministic "fully booked" pattern so the demo is reproducible:
  - **Day 0 (today)** and **day 3** are **fully booked** (every slot `isBooked = true`).
  - **Weekend days** (if any fall in the window) get **no slots** (closed).
  - Other days: mark a scattered ~30% booked so lists look realistic.
- Seeding is **pure w.r.t. an injected `today`** so behavior is testable and stable.

### Atomicity / double-book guard
`book()` re-reads the slot, checks `isBooked` inside the same synchronous call, and
flips it before returning. Node's single-threaded event loop means no interleave
between the check and the write — good enough and documented as such.

---

## 4. Tool Definitions (OpenAI schema)

Exposed to the model via the `tools` param. Descriptions are written *for the model*.

```ts
// agent/tools.ts

export const toolSchemas = [
  {
    type: "function",
    function: {
      name: "get_available_slots",
      description:
        "List open appointment slots for a specific calendar date. " +
        "Use whenever the user wants to know availability. " +
        "Date MUST be resolved to YYYY-MM-DD before calling.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Target date as YYYY-MM-DD" },
        },
        required: ["date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Book a specific open slot for a patient. Only call after you have a valid " +
        "slotId from get_available_slots AND the patient's full name and phone number, " +
        "AND the user has confirmed the specific time.",
      parameters: {
        type: "object",
        properties: {
          slotId: { type: "string", description: "Exact id from get_available_slots" },
          name:   { type: "string", description: "Patient full name" },
          phone:  { type: "string", description: "Patient phone number" },
        },
        required: ["slotId", "name", "phone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description:
        "Cancel an existing appointment by its appointmentId (format appt_...). " +
        "If the user doesn't know the id, ask for identifying details — do NOT guess.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string", description: "The appt_... id to cancel" },
        },
        required: ["appointmentId"],
        additionalProperties: false,
      },
    },
  },
] as const;
```

### Tool return payloads (the `data` on success)

| Tool | `data` shape |
|---|---|
| `get_available_slots` | `{ date, slots: { slotId, time }[] }` — only open slots, times sorted. |
| `book_appointment` | `{ appointmentId, slotId, date, time, name }` |
| `cancel_appointment` | `{ appointmentId, freedSlotId, date, time }` |

Tool results are serialized to JSON and sent back as `role: "tool"` messages. Errors
go back as `{ ok:false, error, message }` so the model can read the code *and* a
human-friendly message.

---

## 5. Tool Handlers — Validation Rules

```
get_available_slots(date):
  - parse date; if unparseable        → BAD_DATE
  - if date < today or > today+6      → OUT_OF_RANGE
  - open = store.getOpenSlotsByDate(date)
  - if open.length === 0              → NO_SLOTS (message notes closed vs full)
  - else                              → ok { date, slots }

book_appointment(slotId, name, phone, idempotencyKey?):
  - name.trim() empty                 → INVALID_NAME
  - phone fails /[\d]{7,}/ after strip → INVALID_PHONE
  - slot = store.getSlot(slotId)
  - if !slot                          → SLOT_NOT_FOUND
  - if slot.isBooked:
      - if booked to same (name,phone)/idempotencyKey → ok (return existing appt)  # idempotent
      - else                          → SLOT_TAKEN
  - appt = store.book(...)            → ok { appointmentId, ... }

cancel_appointment(appointmentId):
  - appt = store.getAppointment(id)
  - if !appt                          → NOT_FOUND
  - slot = store.cancel(id)           → ok { freedSlotId, ... }
```

Phone validation is intentionally lenient (≥7 digits after stripping spaces/dashes/
parens) — enough to catch empties/garbage without rejecting valid international formats.

---

## 6. LLM Provider Abstraction (OpenAI → Groq failover)

The loop never imports a vendor SDK directly; it depends on an interface.

```ts
// llm/provider.ts
export interface ChatRequest {
  messages: ChatMessage[];
  tools: ToolSchema[];
  temperature?: number;
  signal?: AbortSignal;
}
export interface LLMProvider {
  readonly name: "openai" | "groq";
  createChatCompletion(req: ChatRequest): Promise<AssistantMessage>; // may throw
}
```

`OpenAIProvider` and `GroqProvider` are thin adapters over each vendor's OpenAI-compatible
Chat Completions API (both support tool calling; Groq default model
`llama-3.3-70b-versatile`). The loop is handed a `FailoverProvider`:

```ts
// llm/failover.ts (behavioral contract)
class FailoverProvider implements LLMProvider {
  constructor(private primary, private fallback, private cfg) {}

  async createChatCompletion(req) {
    for (const p of [this.primary, this.fallback]) {
      if (breaker.isOpen(p.name)) continue;               // skip a known-down provider
      try {
        return await withRetryAndTimeout(p, req, this.cfg); // backoff+jitter, AbortController
      } catch (e) {
        breaker.record(p.name, e);                        // maybe trip the breaker
        if (isNonRetryable(e) && p === this.fallback) throw e;
        // else fall through to the next provider
      }
    }
    throw new LlmUnavailableError();                       // → graceful 503 envelope
  }
}
```

- **Retry:** transient 5xx/network → exponential backoff + jitter, up to `LLM_MAX_RETRIES`.
- **429 / auth errors:** non-retryable → immediate failover.
- **Timeout:** `AbortController` at `LLM_TIMEOUT_MS`.
- **Circuit breaker** (`llm/breaker.ts`): per-provider failure counter; after N failures
  within a window it opens for a cooldown, short-circuiting to the fallback.
- **Testable:** the loop and failover are exercised with a **fake `LLMProvider`** and fake
  timers — no real network (see [TESTING.md](TESTING.md) §3–4).

---

## 7. Agent Orchestration Loop

```ts
// agent/loop.ts (pseudocode)

const MAX_ITERS = config.maxToolIters; // default 5

async function runAgent(history: ChatMessage[], llm: LLMProvider, cid: string): Promise<AgentTurn> {
  const trace: ToolTrace[] = [];
  for (let i = 0; i < MAX_ITERS; i++) {
    const msg = await llm.createChatCompletion({    // failover happens inside
      messages: history, tools: toolSchemas, temperature: 0.2,
    });
    history.push(msg);
    log.turn({ cid, provider: llm.lastUsed, iter: i }); // structured, no PII

    if (!msg.tool_calls?.length) {
      return { reply: msg.content ?? "", history, trace }; // final answer
    }

    for (const call of msg.tool_calls) {
      const args = safeParse(call.function.arguments);     // try/catch → tool error, not 500
      const result = dispatchTool(call.function.name, args);
      trace.push({ name: call.function.name, ok: result.ok });
      history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "Sorry, I'm having trouble completing that. Could you rephrase?", history, trace };
}
```

- **`tool_choice: "auto"`** — the model decides when to call tools.
- **`MAX_ITERS`** bounds runaway loops (invalid args retried forever, etc.).
- **Loop is provider-agnostic** — swapping/adding a provider changes zero loop code.
- Tool-call arg parsing is wrapped in try/catch → malformed args become a structured
  tool error rather than a 500.

---

## 8. System Prompt (shape)

Built per-request so **today's date is always fresh** (`prompt.ts`):

```
You are the virtual receptionist for Lakeside Dental Clinic.
Today is {WEEKDAY}, {YYYY-MM-DD}. The clinic books appointments up to 7 days ahead.
Hours: Mon–Fri, 09:00–16:30. Closed weekends.

Rules:
- Resolve relative dates ("tomorrow", "next Monday") to YYYY-MM-DD yourself before
  calling tools; today's date is given above.
- NEVER invent slots, prices, appointment IDs, or confirmations. Only state a booking
  is confirmed after book_appointment returns ok.
- Before booking, make sure you have: a specific open slot, the patient's full name,
  and a phone number, and that the user confirmed the time.
- To cancel, you need the appointmentId. If the user lacks it, ask — do not guess.
- If a tool returns an error, explain it plainly and offer the next best option.
- Be warm, concise, and proactive (offer nearby days when one is full).
```

---

## 9. HTTP Contract

### `POST /api/chat`
```jsonc
// request
{ "sessionId": "uuid-from-client", "message": "Any slots tomorrow?" }

// response 200
{
  "reply": "We have 09:00, 09:30 and 14:00 open tomorrow — want one of those?",
  "toolTrace": [                       // optional, for demo transparency
    { "name": "get_available_slots", "args": {"date":"2026-07-20"}, "ok": true }
  ]
}

// response 4xx/5xx
{ "error": "message safe to show the user" }
```

- `sessionId` generated client-side (crypto.randomUUID) on first load, kept in memory.
- Server maps `sessionId → history` via a `SessionStore` interface. Unknown session →
  new history seeded with the system prompt.

```ts
// session/store.ts — swap the impl for Redis without touching callers (ADR-007)
export interface SessionStore {
  get(id: string): ChatMessage[] | undefined;
  set(id: string, messages: ChatMessage[]): void;
}
// default: Map-backed, in-process.
```

---

## 10. Frontend State (React)

```ts
type UiMessage = { role: "user" | "assistant"; content: string };

// App state
messages: UiMessage[]
input: string
loading: boolean
error: string | null
sessionId: string   // useRef, set once
```

Flow: submit → optimistic push user bubble → `POST /api/chat` → push assistant reply →
on error show inline retry. Tool traces (if shown) render as a subtle system line.

---

## 11. Edge Cases → Concrete Handling

| Input | Result |
|---|---|
| "book me in" (no slot chosen) | Model calls `get_available_slots` first / asks which day. |
| Gives name but no phone | `book_appointment` → `INVALID_PHONE` → model asks for phone. |
| Picks a slot that just got taken | `SLOT_TAKEN` → model re-fetches and offers alternatives. |
| "cancel my appointment" (no id) | Model asks for the id (or name/phone to look up — noted as a stretch). |
| Date 10 days out | `OUT_OF_RANGE` → model explains 7-day window. |
| Saturday | `NO_SLOTS` with "closed weekends" message. |
| Gibberish date the model can't resolve | Model asks to clarify; if it still sends junk → `BAD_DATE`. |

---

## 12. Testing Hooks

- Pure `seed(today)` + pure handlers → unit-testable without HTTP or an LLM.
- Injected clock everywhere date logic runs → deterministic, timezone-stable tests.
- The loop takes an `LLMProvider`, so a **fake provider** replays scripted tool-call
  scripts; failover/breaker use **fake timers**. No network in CI.
- Full plan and coverage targets in [TESTING.md](TESTING.md).

---

## 13. Appendix — Worked Example (one booking turn)

User: *"Book the 2pm Thursday for Priya Rao, 555-0142."* (today = 2026-07-19)

```
1. history += user msg
2. → OpenAI  → tool_calls: get_available_slots({date:"2026-07-23"})
3. dispatch  → { ok:true, data:{ date:"2026-07-23",
                   slots:[{slotId:"2026-07-23T14:00", time:"14:00"}, ...] } }
   history += tool result
4. → OpenAI  → tool_calls: book_appointment({
                   slotId:"2026-07-23T14:00", name:"Priya Rao", phone:"555-0142" })
5. dispatch  → store.book(...) → { ok:true, data:{
                   appointmentId:"appt_a1b2c3", slotId:"2026-07-23T14:00",
                   date:"2026-07-23", time:"14:00", name:"Priya Rao" } }
   history += tool result
6. → OpenAI  → (no tool_calls) content:
   "You're booked, Priya — Thursday Jul 23 at 2:00 PM. Your reference is appt_a1b2c3."
7. return { reply, toolTrace:[get_available_slots ok, book_appointment ok] }
```

Failure variant — if step 4's slot was taken between steps 2 and 4, step 5 returns
`{ ok:false, error:"SLOT_TAKEN" }`; the model re-runs `get_available_slots` and offers
the nearest open time instead of confirming.
