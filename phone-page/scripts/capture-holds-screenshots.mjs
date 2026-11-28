import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mediaDir = path.join(repoRoot, "media", "holds-screenshots");

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(mediaDir, { recursive: true });
  const api = spawn(
    "python3",
    ["-m", "uvicorn", "controller.app:app", "--host", "127.0.0.1", "--port", "8765"],
    {
      cwd: repoRoot,
      env: { ...process.env, MOMOGUARD_AUTO_SEED: "1", PYTHONPATH: repoRoot },
      stdio: "ignore",
    },
  );
  const http = spawn("python3", ["-m", "http.server", "8766", "--bind", "127.0.0.1"], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  await sleep(1500);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto("http://127.0.0.1:8766/phone-page/?mode=mock", { waitUntil: "networkidle" });
  await sleep(800);

  await page.evaluate(async () => {
    const p = window.__phone;
    p.flow.skipBoot();
    p.flow.unlock();
    p.flow.state.screen = "stkSendAmount";
    p.flow.state.history = ["stkMomo", "stkSendPick", "stkCarrier", "idle"];
    p.flow.state.sendDemo = { pickIndex: 0, amount: "100", result: null };
    p.flow.t9.setMode("num");
    p.flow.t9.clear();
    p.flow.t9.buffer = ["1", "0", "0"];
    await new Promise(r => setTimeout(r, 50));
    p.dispatch("ok");
    await new Promise(r => setTimeout(r, 400));
    p.flow.state.screen = "inbox";
    p.flow.state.history = ["idle"];
    p.render();
  });
  await sleep(400);
  await page.screenshot({ path: path.join(mediaDir, "01-phone-hold-sms.png") });

  await page.evaluate(async () => {
    const p = window.__phone;
    p.flow.state.screen = "stkMomo";
    p.flow.state.history = ["stkCarrier"];
    p.flow.state.stkIndex = 5;
    p.render();
    p.dispatch("ok");
    await new Promise(r => setTimeout(r, 500));
    p.render();
  });
  await sleep(500);
  await page.screenshot({ path: path.join(mediaDir, "02-phone-withdraw-blocked.png") });

  await fetch("http://127.0.0.1:8765/holds/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payer: "0244999001",
      payee: "0244888001",
      amount: 200,
      payments_from_payer_before: 0,
    }),
  });

  const consolePage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await consolePage.goto("http://127.0.0.1:8766/community-console/", { waitUntil: "networkidle" });
  await sleep(500);
  await consolePage.click('button[data-section="holds"]');
  await sleep(400);
  await consolePage.screenshot({ path: path.join(mediaDir, "03-console-holds-panel.png") });

  await browser.close();
  api.kill();
  http.kill();
  console.log("Screenshots:", mediaDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});