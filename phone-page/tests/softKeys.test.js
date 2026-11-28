import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { softKeysFor } from "../softKeys.js";

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(here, "..", "index.html"), "utf8");

test("soft keys on lock and STK input", () => {
  assert.deepEqual(softKeysFor({ screen: "lock" }), { left: "soft.unlock", right: null });
  assert.deepEqual(softKeysFor({ screen: "stkCheckInput" }), { left: null, right: "soft.back" });
});

test("labels live on LCD footer", () => {
  assert.match(indexHtml, /id="soft_left"/);
  assert.match(indexHtml, /id="soft_right"/);
});

test("symmetric call and end flank D-pad", () => {
  assert.match(indexHtml, /id="key_call"/);
  assert.match(indexHtml, /id="key_end"/);
});

test("charset utf-8 for Walɔ copy", () => {
  assert.match(indexHtml, /charset="utf-8"/i);
  assert.match(indexHtml, /Walɔ/);
});