import express, { type Express, type Router } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { correlation } from "./middleware/correlation.js";
import { rateLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { logger } from "./obs/logger.js";

export interface AppDeps {
  /** Reports whether at least one LLM provider is configured/healthy. */
  llmReady: () => boolean;
  /** The /api router (chat). Injected so tests can supply fakes (see TESTING.md §5). */
  apiRouter: Router;
}

/**
 * Build the Express app. Dependencies are injected so integration tests can
 * supply a fake agent/session store with no network.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.webOrigin }));
  app.use(express.json({ limit: "32kb" }));
  app.use(correlation);

  // Liveness: is the process up?
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "lakeside-dental-agent", env: config.env });
  });

  // Readiness: can it actually serve traffic (an LLM provider is available)?
  app.get("/ready", (_req, res) => {
    const ready = deps.llmReady();
    res.status(ready ? 200 : 503).json({ ready });
  });

  app.use("/api", rateLimiter, deps.apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  logger.info("app_initialized", { env: config.env, webOrigin: config.webOrigin });
  return app;
}
