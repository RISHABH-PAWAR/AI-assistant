import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { LLMProvider, ChatMessage } from "../llm/types.js";
import type { AgentRunner } from "../agent/loop.js";
import { capHistory, type SessionStore } from "../session/store.js";
import { AppError } from "../middleware/errors.js";

/** Keep ~20 turns of context to bound token cost (see capHistory). */
const MAX_HISTORY_MESSAGES = 40;

const ChatBodySchema = z.object({
  sessionId: z.string().min(1).max(200),
  message: z.string().trim().min(1, "Message cannot be empty.").max(2000),
});

export interface ChatRouterDeps {
  runAgent: AgentRunner;
  sessions: SessionStore;
  makeProvider: (cid: string) => LLMProvider;
  /** Returns today's date (YYYY-MM-DD); injectable for tests. */
  today: () => string;
  /** Builds the system prompt for a given day; injectable for tests. */
  buildSystemPrompt: (today: string) => string;
}

/** Wrap an async handler so rejected promises reach the error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();

  router.post(
    "/chat",
    asyncHandler(async (req, res) => {
      const parsed = ChatBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "Invalid request.";
        throw new AppError(400, msg, "BAD_REQUEST");
      }
      const { sessionId, message } = parsed.data;

      // Load or start a session (seeded with a fresh, date-aware system prompt).
      const existing = deps.sessions.get(sessionId);
      const history: ChatMessage[] = existing ?? [
        { role: "system", content: deps.buildSystemPrompt(deps.today()) },
      ];
      history.push({ role: "user", content: message });

      const capped = capHistory(history, MAX_HISTORY_MESSAGES);
      const provider = deps.makeProvider(req.cid);
      const turn = await deps.runAgent({ history: capped, provider, cid: req.cid });

      deps.sessions.set(sessionId, capped);
      res.json({ reply: turn.reply, toolTrace: turn.toolTrace });
    }),
  );

  return router;
}
