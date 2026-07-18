import express from "express";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./obs/logger.js";

/**
 * Composition root. Wiring for the agent/session/provider layers is added in
 * Phase 4; Phase 0 boots with health/ready and an empty API router so the
 * process and its middleware are verifiable end-to-end from the start.
 */
function main(): void {
  const apiRouter = express.Router();

  const app = createApp({
    apiRouter,
    llmReady: () => Boolean(config.llm.openai || config.llm.groq),
  });

  app.listen(config.port, () => {
    logger.info("server_listening", { port: config.port, url: `http://localhost:${config.port}` });
  });
}

main();
