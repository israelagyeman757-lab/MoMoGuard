import test from "node:test";
import assert from "node:assert/strict";
import { trickLabel, riskLabel, statusLabel, formatTimestamp, escapeHtml } from "../format.js";

test("trickLabel falls back to the 'other' label for an unknown trick", () => {
  assert.equal(trickLabel("possible_impersonation"), "Possible impersonation");
  assert.equal(trickLabel("something_unexpected"), "Other / suspected scam");
});

test("riskLabel passes through an unrecognised risk value rather than throwing", () => {
  assert.equal(riskLabel("high"), "High \u2014 several reports");
  assert.equal(riskLabel("weird"), "weird");
});

test("statusLabel covers all three report statuses", () => {
  assert.equal(statusLabel("pending"), "Pending review");
  assert.equal(statusLabel("published"), "Published");
  assert.equal(statusLabel("rejected"), "Rejected");
});

test("formatTimestamp returns the input unchanged when it can't be parsed", () => {
  assert.equal(formatTimestamp("not-a-date"), "not-a-date");
  assert.equal(formatTimestamp(""), "");
});

test("formatTimestamp formats a real ISO timestamp without throwing", () => {
  const result = formatTimestamp("2026-11-28T09:00:00+00:00");
  assert.ok(result.length > 0);
});

test("escapeHtml neutralises every HTML-special character", () => {
  assert.equal(escapeHtml(`<b>"tom's" & jerry</b>`),
    "&lt;b&gt;&quot;tom&#39;s&quot; &amp; jerry&lt;/b&gt;");
});

test("escapeHtml treats null/undefined as an empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});
