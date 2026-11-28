import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const phoneUrl = "http://127.0.0.1:9876/phone-page/index.html";

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-m", "http.server", "9876", "--bind", "127.0.0.1"], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    child.on("error", reject);
    setTimeout(() => resolve(child), 400);
  });
}

test("keyboard updates LCD quickly and supports D-pad menu scroll", async () => {
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(phoneUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("#phone");

    await page.focus("#phone");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#phone[data-screen=\"lock\"]", { timeout: 3000 });

    await page.keyboard.press("Enter");
    await page.keyboard.press("*");
    await page.waitForSelector("#phone[data-screen=\"idle\"]", { timeout: 3000 });

    await page.keyboard.press("Enter");
    await page.waitForSelector('#phone[data-screen="apps"]');

    await page.keyboard.press("Enter");
    await page.waitForSelector('#phone[data-screen="messages"]');

    await page.evaluate(() => window.performance.mark("menu-key"));
    await page.keyboard.press("ArrowDown");
    const latency = await page.evaluate(() => {
      window.performance.mark("menu-done");
      window.performance.measure("menu", "menu-key", "menu-done");
      const m = window.performance.getEntriesByName("menu").at(-1);
      return m?.duration ?? 999;
    });
    assert.ok(latency < 50, `menu patch should be under 50ms (saw ${latency.toFixed(2)}ms)`);

    const selected = await page.locator(".inbox-message.is-selected .inbox-sender").first().textContent();
    assert.ok(selected?.length, "inbox selection should move with arrow keys");

    await page.screenshot({ path: "/opt/cursor/artifacts/phone-nokia-layout.png", fullPage: true });
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
});