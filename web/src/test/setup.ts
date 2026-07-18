import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement scrollTo; the chat auto-scroll effect calls it.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// Ensure crypto.randomUUID exists in the test environment.
if (!globalThis.crypto?.randomUUID) {
  const g = globalThis as unknown as { crypto: { randomUUID: () => string } };
  g.crypto = g.crypto ?? ({} as { randomUUID: () => string });
  let n = 0;
  g.crypto.randomUUID = () => `test-uuid-${++n}`;
}
