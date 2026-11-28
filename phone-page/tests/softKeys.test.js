import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { softKeyLabels } from "../softKeys.js";

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(here, "..", "index.html"), "utf8");

test("soft keys on lock and STK input", () => {
  assert.deepEqual(softKeyLabels("lock"), { left: "—", right: "Unlock" });
  assert.deepEqual(softKeyLabels("stkCheckInput"), { left: "Back", right: "OK" });
});

test("keyboard legend is collapsible on page", () => {
  assert.match(indexHtml, /keyboard-legend/);
  assert.match(indexHtml, /id="key_5"/);
});