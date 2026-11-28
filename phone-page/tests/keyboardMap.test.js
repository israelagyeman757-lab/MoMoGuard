import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mapKeyboardEvent } from "../keyboardMap.js";

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(here, "..", "index.html"), "utf8");

function map(key, extras = {}) {
  return mapKeyboardEvent({ key, ctrlKey: false, metaKey: false, altKey: false, ...extras });
}

test("Escape maps to back (not end)", () => {
  const m = map("Escape");
  assert.equal(m.phoneKey, "back");
  assert.equal(m.highlight, null);
});

test("End and Home map to red end and green call", () => {
  assert.equal(map("End").phoneKey, "end");
  assert.equal(map("End").highlight, "#key_end");
  assert.equal(map("Home").phoneKey, "call");
  assert.equal(map("F3").phoneKey, "call");
  assert.equal(map("F4").phoneKey, "end");
});

test("soft keys and digit keys target matching on-screen ids", () => {
  assert.equal(map("[").highlight, "#soft_left");
  assert.equal(map("]").highlight, "#soft_right");
  assert.equal(map("5").highlight, "#key_5");
  assert.match(indexHtml, /id="key_5"/);
  assert.match(indexHtml, /id="soft_left"/);
  assert.match(indexHtml, /id="key_end"/);
});

test("modifier keys are ignored", () => {
  assert.equal(map("Enter", { ctrlKey: true }), null);
});