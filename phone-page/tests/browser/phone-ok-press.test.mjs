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

function sameBox(a, b) {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

test("OK key bounding box unchanged while pressed", async () => {
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto(phoneUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(1600);

    const ok = page.locator("#key_ok");
    const before = await ok.boundingBox();
    assert.ok(before, "OK key should be visible");

  await page.evaluate(() => {
      const el = document.querySelector("#key_ok");
      el?.classList.add("is-pressed");
    });
    const duringClass = await ok.boundingBox();
    assert.ok(sameBox(before, duringClass), "is-pressed must not shift OK layout");

    const handle = await ok.elementHandle();
    await page.evaluate(el => el?.classList.remove("is-pressed"), handle);
    const rect = await handle.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    const duringMouse = await ok.boundingBox();
    await page.mouse.up();
    assert.ok(sameBox(before, duringMouse), "mousedown must not shift OK layout");
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
});