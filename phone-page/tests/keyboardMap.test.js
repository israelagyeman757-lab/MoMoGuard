import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { KEYMAP, hardwareIdFor } from "../keyboardMap.js";

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(here, "..", "index.html"), "utf8");

test("Escape maps to back", () => {
  assert.equal(KEYMAP.Escape, "back");
});

test("End and Home map to end and call", () => {
  assert.equal(KEYMAP.End, "end");
  assert.equal(KEYMAP.Home, "call");
  assert.equal(KEYMAP.F3, "call");
  assert.equal(KEYMAP.F4, "end");
});

test("hardware ids match on-screen buttons", () => {
  assert.equal(hardwareIdFor("5"), "key_5");
  assert.equal(hardwareIdFor("soft-left"), "key_soft_left");
  assert.equal(hardwareIdFor("end"), "key_end");
  assert.match(indexHtml, /id="key_5"/);
  assert.match(indexHtml, /id="soft_left"/);
  assert.match(indexHtml, /id="key_end"/);
});

test("Enter maps to ok (same as Select)", () => {
  assert.equal(KEYMAP.Enter, "ok");
  assert.equal(hardwareIdFor("ok"), "key_ok");
});