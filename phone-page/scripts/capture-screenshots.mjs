import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(repo, "media", "phone-screenshots");
mkdirSync(outDir, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function staticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url?.split("?")[0] || "/";
      const file = join(repo, path.replace(/^\//, "") || "index.html");
      try {
        const body = readFileSync(file);
        const ext = file.slice(file.lastIndexOf("."));
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { server, base } = await staticServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${base}/phone-page/index.html?mode=mock`);
  await page.waitForFunction(() => Boolean(window.__phone));

  const screen = () => page.evaluate(() => window.__phone.flow.state.screen);
  const d = (a) => page.evaluate((action) => window.__phone.dispatch(action), a);

  await page.waitForFunction(
    () => window.__phone?.flow?.state?.screen === "lock",
    null,
    { timeout: 10000 },
  );
  await page.screenshot({ path: join(outDir, "01-lock.png") });

  await d("*");
  await sleep(100);
  await d("soft-left");
  await page.waitForFunction(() => window.__phone.flow.state.screen === "menu");
  await page.screenshot({ path: join(outDir, "02-menu-3x3.png") });

  await d("down");
  await d("ok");
  await page.waitForFunction(() => window.__phone.flow.state.screen === "stkCarrier");
  await d("ok");
  await page.waitForFunction(() => window.__phone.flow.state.screen === "stkMomo");
  await page.screenshot({ path: join(outDir, "03-stk-walo-menu.png") });

  for (let i = 0; i < 3; i += 1) await d("down");
  await d("ok");
  await page.waitForFunction(() => window.__phone.flow.state.screen === "stkCheckInput");
  for (const digit of "0244123456") await d(digit);
  await d("ok");
  await page.waitForFunction(
    () => window.__phone.flow.state.screen === "stkCheckResult",
    null,
    { timeout: 8000 },
  );
  await page.screenshot({ path: join(outDir, "04-check-result.png") });

  await d("end");
  await page.waitForFunction(() => window.__phone.flow.state.screen === "idle");
  await page.evaluate(() => window.__phone.dispatch("stk-push"));
  await page.waitForFunction(() => window.__phone.flow.state.screen === "stkPopup");
  await page.screenshot({ path: join(outDir, "05-stk-popup.png") });

  await browser.close();
  server.close();
  console.log("screenshots:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});