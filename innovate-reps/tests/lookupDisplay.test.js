import test from "node:test";
import assert from "node:assert/strict";
import { describeLookupResult, describeLookupFailure } from "../lookupDisplay.js";

test("a flagged result shows a danger tone and carries history + source", () => {
  const described = describeLookupResult({
    number: "0240000009", status: "flagged", risk: "high",
    history: ["reported for an advance-fee scam pattern (demo data)"],
    message: "Glance has flagged this number. That may be a warning sign, not proof it is unsafe.",
    source: "rancard_stub",
  });
  assert.equal(described.tone, "danger");
  assert.equal(described.heading, "Elevated Glance signal");
  assert.ok(described.history.length >= 1);
  assert.ok(described.history.some(line => /not a confirmed fraud finding/i.test(line)));
  assert.equal(described.source, "rancard_stub");
});

test("a clear result shows an ok tone", () => {
  const described = describeLookupResult({ status: "clear", message: "No threat history found.", source: "rancard_stub" });
  assert.equal(described.tone, "ok");
  assert.equal(described.heading, "No threat found");
});

test("no_results never implies safe", () => {
  const described = describeLookupResult({ status: "no_results", message: "No Glance record found for this number. That is not proof it is safe.", source: "rancard_stub" });
  assert.match(described.message, /not proof/i);
  assert.equal(described.tone, "neutral");
});

test("a missing/unknown status falls back to a neutral no-results display, not an error", () => {
  const described = describeLookupResult({});
  assert.equal(described.tone, "neutral");
  assert.equal(described.heading, "No results");
});

test("a null result (should not normally happen) still renders safely", () => {
  const described = describeLookupResult(null);
  assert.equal(described.heading, "No results");
  assert.deepEqual(described.history, []);
});

test("a network/HTTP failure maps to a clearly-labelled 'could not check' state, never a false 'clear'", () => {
  const described = describeLookupFailure();
  assert.equal(described.tone, "warning");
  assert.equal(described.heading, "Could not check");
  assert.match(described.message, /not proof/i);
});
