import test from "node:test";
import assert from "node:assert/strict";
import { T9 } from "../t9.js";

test("text mode cycles letters on same key within tap window", () => {
  let now = 1000;
  const t9 = new T9({ tapMs: 800, now: () => now });
  t9.setMode("abc");
  t9.tap("2");
  assert.match(t9.display(), /a$/);
  now += 100;
  t9.tap("2");
  assert.match(t9.display(), /b$/);
});

test("number mode and clear", () => {
  const t9 = new T9();
  t9.tap("0");
  t9.tap("2");
  assert.match(t9.display(), /02/);
  t9.backspace();
  assert.equal(t9.display().replace(/\s/g, "").length, 1);
});