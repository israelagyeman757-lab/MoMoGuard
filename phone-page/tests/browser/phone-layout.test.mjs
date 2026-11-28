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

async function measureDpadOffset(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".navigation");
    const call = document.querySelector("#key_call");
    const end = document.querySelector("#key_end");
    const phone = document.querySelector("#phone");
    if (!nav || !call || !end || !phone) return { error: "missing nodes" };
    const n = nav.getBoundingClientRect();
    const c = call.getBoundingClientRect();
    const e = end.getBoundingClientRect();
    const p = phone.getBoundingClientRect();
    const navCx = n.left + n.width / 2;
    const phoneCx = p.left + p.width / 2;
    const callDist = Math.abs(c.left + c.width / 2 - navCx);
    const endDist = Math.abs(e.left + e.width / 2 - navCx);
   return {
      centerOffsetPx: Math.abs(navCx - phoneCx),
      callEndBalancePx: Math.abs(callDist - endDist),
    };
  });
}

for (const viewport of [
  { name: "1366x768", width: 1366, height: 768, shot: "phone-layout-1366x768.png" },
  { name: "1280x800", width: 1280, height: 800, shot: "phone-layout-1280x800.png" },
]) {
  test(`layout ${viewport.name}: no scroll, D-pad centered`, async () => {
    const server = await startStaticServer();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(phoneUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(1600);

      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollHeight > window.innerHeight,
        body: document.body.scrollHeight > window.innerHeight,
      }));
      assert.equal(overflow.doc, false, "document should not overflow viewport");
      assert.equal(overflow.body, false, "body should not overflow viewport");

      assert.equal(await page.locator(".soft-key-row").count(), 0, "no bezel chevron row");

      const { centerOffsetPx, callEndBalancePx } = await measureDpadOffset(page);
      assert.ok(centerOffsetPx < 2, `D-pad vs phone center offset ${centerOffsetPx}px`);
      assert.ok(callEndBalancePx < 2, `call/end symmetry imbalance ${callEndBalancePx}px`);

      const insets = await page.evaluate(() => {
        const phone = document.querySelector("#phone");
        const call = document.querySelector("#key_call");
        const end = document.querySelector("#key_end");
        const p = phone.getBoundingClientRect();
        const c = call.getBoundingClientRect();
        const e = end.getBoundingClientRect();
        const margin = 10;
        return {
          callLeftInset: c.left - p.left,
          callRightInset: p.right - c.right,
          endLeftInset: e.left - p.left,
          endRightInset: p.right - e.right,
        };
      });
      const edgeMargin = 10;
      assert.ok(insets.callLeftInset >= edgeMargin - 0.5, `call left inset ${insets.callLeftInset}px`);
      assert.ok(insets.endRightInset >= edgeMargin - 0.5, `end right inset ${insets.endRightInset}px`);

      await page.screenshot({ path: `/opt/cursor/artifacts/${viewport.shot}`, fullPage: false });
    } finally {
      await browser.close();
      server.kill("SIGTERM");
    }
  });
}