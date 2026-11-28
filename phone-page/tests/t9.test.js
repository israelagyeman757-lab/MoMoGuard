import test from "node:test";
import assert from "node:assert/strict";
import { T9Input } from "../t9.js";

test("text mode cycles letters on same key within tap window", () => {
  const t9 = new T9Input({ mode: "text", tapMs: 800 });
  const t0 = 1000;
  t9.pressDigit("2", t0);
  assert.equal(t9.display().slice(-1), "a");
  t9.pressDigit("2", t0 + 100);
  assert.equal(t9.display().slice(-1), "b");
});

test("multi-tap commits after 800ms gap", () => {
  const t9 = new T9Input({ mode: "text", tapMs: 800 });
  const t0 = 5000;
  t9.pressDigit("3", t0);
  assert.equal(t9.display(), "d");
  t9.pressDigit("5", t0 + 801);
  assert.equal(t9.display(), "dj");
});

test("default tap window is 800ms", () => {
  const t9 = new T9Input({ mode: "text" });
  assert.equal(t9.tapMs, 800);
});