import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const configSrc = readFileSync(join(here, "..", "config.js"), "utf8");

test("prod-style default is controller mode", () => {
  assert.match(configSrc, /return "controller"/);
});

test("local api base resolves to 127.0.0.1:8000", () => {
  assert.match(configSrc, /127\.0\.0\.1:8000/);
  assert.match(configSrc, /return "\/api"/);
});