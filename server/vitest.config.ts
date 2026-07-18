import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Keep test output clean; individual tests can still assert on logger calls via spies.
    env: { LOG_LEVEL: "error", NODE_ENV: "test" },
    include: ["src/**/*.test.ts"],
    exclude: ["**/*.eval.test.ts", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.test.ts",
        "src/index.ts",
        "src/agent/cli.ts",
        "src/**/types.ts",
      ],
      thresholds: {
        // Domain logic is where money bugs live — hold it high.
        "src/domain/**": { lines: 100, functions: 100, branches: 95, statements: 100 },
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
