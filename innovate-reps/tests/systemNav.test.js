import test from "node:test";
import assert from "node:assert/strict";
import { handleSystemNav } from "../systemNav.js";

test("only Home invokes onHome", () => {
  let hits = 0;
  assert.equal(handleSystemNav("home", { onHome: () => { hits += 1; } }), true);
  assert.equal(hits, 1);
});

test("Back and Recent apps are visual-only", () => {
  let hits = 0;
  assert.equal(handleSystemNav("back", { onHome: () => { hits += 1; } }), false);
  assert.equal(handleSystemNav("recents", { onHome: () => { hits += 1; } }), false);
  assert.equal(hits, 0);
});