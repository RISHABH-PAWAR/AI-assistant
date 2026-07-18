import { test, expect } from "@playwright/test";

/**
 * Accessibility smoke test: inject axe-core and assert no serious/critical
 * violations on the initial chat view (TESTING.md §8).
 */
test("initial view has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });

  const results = await page.evaluate(async () => {
    // @ts-expect-error axe is injected globally by the script tag above.
    return await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
  });

  const serious = (results as { violations: { id: string; impact: string }[] }).violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});

test("respects prefers-reduced-motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  // With reduced motion, the message-enter animation should be effectively instant.
  const bubble = page.locator(".bubble-assistant").first();
  const durationMs = await bubble.evaluate((el) => {
    const d = getComputedStyle(el).animationDuration; // e.g. "0.001ms" or "0.24s"
    return d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000;
  });
  expect(durationMs).toBeLessThan(50); // full motion would be 240ms
  await context.close();
});
