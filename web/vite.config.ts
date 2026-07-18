/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Single source of truth for env: read the repo-root .env (shared with the server).
// Only VITE_-prefixed vars are exposed to the browser bundle.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, ".."),
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    css: true,
  },
});
