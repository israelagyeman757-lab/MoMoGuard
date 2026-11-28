/**
 * Playwright e2e (run: npx playwright test -c phone-page/playwright.config.mjs)
 */
import { test, expect } from "@playwright/test";

test.describe("Walɔ phone-page @mock", () => {
  test("lock → menu → Walɔ STK check flow", async ({ page }) => {
    await page.goto("/phone-page/index.html?mode=mock");
    await page.waitForFunction(() => Boolean(window.__phone));
    await page.waitForFunction(
      () => window.__phone.flow.state.screen === "lock",
      null,
      { timeout: 10000 },
    );

    await page.evaluate(() => window.__phone.dispatch("*"));
    await page.evaluate(() => window.__phone.dispatch("soft-left"));
    await expect
      .poll(() => page.evaluate(() => window.__phone.flow.state.screen))
      .toBe("menu");

    await page.evaluate(() => window.__phone.dispatch("down"));
    await page.evaluate(() => window.__phone.dispatch("ok"));
    await page.evaluate(() => window.__phone.dispatch("ok"));
    await expect
      .poll(() => page.evaluate(() => window.__phone.flow.state.screen))
      .toBe("stkMomo");

    const header = await page.locator("#lcd_body .scr-head").innerText();
    expect(header).toMatch(/Wal/i);
  });
});