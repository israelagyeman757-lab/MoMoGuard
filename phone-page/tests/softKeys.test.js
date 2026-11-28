import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { softKeyLabels } from "../softKeys.js";

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(here, "..", "index.html"), "utf8");

test("soft keys on lock and STK input", () => {
  assert.deepEqual(softKeyLabels("lock"), { left: "", right: "Unlock" });
  assert.deepEqual(softKeyLabels("stkCheckInput"), { left: "", right: "Back" });
});

test("labels live on LCD footer, not bezel buttons", () => {
  assert.match(indexHtml, /id="screen_soft_left"/);
  assert.match(indexHtml, /id="screen_soft_right"/);
  assert.match(indexHtml, /id="soft_left"/);
  assert.doesNotMatch(indexHtml, /soft-key-row/);
  assert.doesNotMatch(indexHtml, /soft-chevron/);
  assert.doesNotMatch(indexHtml, /id="soft_left_label"/);
});

test("symmetric call and end flank D-pad", () => {
  assert.match(indexHtml, /id="key_call"/);
  assert.match(indexHtml, /id="key_end"/);
  assert.doesNotMatch(indexHtml, /id="key_clear"/);
});

test("keyboard legend is collapsible on page", () => {
  assert.match(indexHtml, /keyboard-legend/);
  assert.match(indexHtml, /id="key_5"/);
});