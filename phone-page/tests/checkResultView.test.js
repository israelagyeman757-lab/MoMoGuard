import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkResultLines } from "../checkResultView.js";

const tw = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../i18n/tw.json"), "utf8"),
);
const en = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../i18n/en.json"), "utf8"),
);

function tFactory(dict) {
  return (key, vars = {}) =>
    String(dict[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

test("maps status codes to plain labels, not enums", () => {
  const lines = checkResultLines(
    { result: "WARNING_AVAILABLE", reports_count: 2 },
    tFactory(en),
  );
  assert.equal(lines.statusLabel, "Community warning");
  assert.notEqual(lines.statusLabel, "WARNING_AVAILABLE");
});

test("reports count line uses i18n", () => {
  const lines = checkResultLines({ result: "UNDER_REVIEW", reports_count: 2 }, tFactory(en));
  assert.equal(lines.countLine, "Reports: 2");
});

test("hides count when zero", () => {
  const lines = checkResultLines({ result: "NO_REPORTS_FOUND", reports_count: 0 }, tFactory(en));
  assert.equal(lines.countLine, "");
});

test("disclaimer switches by report presence", () => {
  const none = checkResultLines({ result: "NO_REPORTS_FOUND", reports_count: 0 }, tFactory(en));
  const found = checkResultLines({ result: "WARNING_AVAILABLE", reports_count: 1 }, tFactory(en));
  assert.match(none.disclaimer, /does not mean safe/i);
  assert.match(found.disclaimer, /PIN/i);
});

test("tw.json has matching status keys", () => {
  const required = [
    "check.status.WARNING_AVAILABLE",
    "check.disclaimer.found",
    "check.reportsCount",
  ];
  for (const key of required) {
    assert.ok(tw[key], `missing ${key}`);
  }
});