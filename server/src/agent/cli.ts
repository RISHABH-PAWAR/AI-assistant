import readline from "node:readline";
import { createAgentRunner } from "./loop.js";
import { buildSystemPrompt } from "./prompt.js";
import { Store } from "../domain/store.js";
import { makeFailoverProvider } from "../llm/factory.js";
import { toDateStr } from "../domain/dates.js";
import { config } from "../config.js";
import type { ChatMessage } from "../llm/types.js";

/**
 * Terminal chat harness — proves the agent end-to-end without the web UI.
 * Run with `npm run cli`. Type "exit" to quit. Excluded from build/coverage.
 */
const store = new Store();
const runAgent = createAgentRunner({ store, maxIters: config.maxToolIters });
const today = toDateStr(new Date());
const history: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(today) }];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("close", () => process.exit(0));

console.log("\n  Lakeside Dental — virtual receptionist (CLI)");
console.log(`  Today is ${today}. Type your message, or "exit" to quit.\n`);

function turn(): void {
  rl.question("  you  › ", async (line) => {
    const text = line.trim();
    if (text === "exit" || text === "quit") {
      rl.close();
      return;
    }
    if (text.length === 0) {
      turn();
      return;
    }
    history.push({ role: "user", content: text });
    try {
      const provider = makeFailoverProvider("cli");
      const res = await runAgent({ history, provider, cid: "cli" });
      console.log(`\n  clara › ${res.reply}\n`);
      if (res.toolTrace.length > 0) {
        const trace = res.toolTrace
          .map((t) => `${t.name}${t.ok ? "" : ` (${t.error})`}`)
          .join(", ");
        console.log(`         · via ${provider.lastUsed}: ${trace}\n`);
      }
    } catch (e) {
      console.log(`\n  (error) ${e instanceof Error ? e.message : String(e)}\n`);
    }
    turn();
  });
}

turn();
