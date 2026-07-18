import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./obs/logger.js";
import { Store } from "./domain/store.js";
import { toDateStr } from "./domain/dates.js";
import { createAgentRunner } from "./agent/loop.js";
import { buildSystemPrompt } from "./agent/prompt.js";
import { InMemorySessionStore } from "./session/store.js";
import { createChatRouter } from "./routes/chat.js";
import { isLlmConfigured, makeFailoverProvider } from "./llm/factory.js";

/**
 * Composition root — wires the domain store, agent runner, session store, LLM
 * failover provider, and HTTP router into the Express app.
 */
function main(): void {
  const store = new Store(); // real clock; seeds the 7-day window on boot
  const sessions = new InMemorySessionStore();
  const runAgent = createAgentRunner({ store, maxIters: config.maxToolIters });

  const apiRouter = createChatRouter({
    runAgent,
    sessions,
    makeProvider: (cid) => makeFailoverProvider(cid),
    today: () => toDateStr(new Date()),
    buildSystemPrompt,
  });

  const app = createApp({ apiRouter, llmReady: isLlmConfigured });

  app.listen(config.port, () => {
    logger.info("server_listening", {
      port: config.port,
      url: `http://localhost:${config.port}`,
      windowStart: store.windowStart,
      windowEnd: store.windowEnd,
    });
  });
}

main();
