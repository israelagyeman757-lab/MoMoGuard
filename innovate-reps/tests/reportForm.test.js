import test from "node:test";
import assert from "node:assert/strict";
import { validateReportForm, buildReportPayload } from "../reportForm.js";

test("a complete form is valid", () => {
  const { valid, errors } = validateReportForm({
    number: "0240000009", community: "Madina", description: "Asked for my PIN.",
  });
  assert.equal(valid, true);
  assert.deepEqual(errors, {});
});

test("time is optional", () => {
  const { valid } = validateReportForm({
    number: "0240000009", community: "Madina", description: "Asked for my PIN.", time: "",
  });
  assert.equal(valid, true);
});

test("a missing or malformed number is rejected", () => {
  for (const number of ["", "abc", "123"]) {
    const { valid, errors } = validateReportForm({
      number, community: "Madina", description: "Something happened.",
    });
    assert.equal(valid, false);
    assert.ok(errors.number, `expected a number error for ${JSON.stringify(number)}`);
  }
});

test("a missing community or description is rejected, independently", () => {
  const missingCommunity = validateReportForm({ number: "0240000009", community: "", description: "x" });
  assert.equal(missingCommunity.valid, false);
  assert.ok(missingCommunity.errors.community);
  assert.ok(!missingCommunity.errors.description);

  const missingDescription = validateReportForm({ number: "0240000009", community: "Madina", description: "" });
  assert.equal(missingDescription.valid, false);
  assert.ok(missingDescription.errors.description);
  assert.ok(!missingDescription.errors.community);
});

test("buildReportPayload trims fields, fixes trick, and carries the reporter id", () => {
  const payload = buildReportPayload({
    number: " 0240000009 ", time: " this morning ", community: " Madina ",
    description: " Asked for my MoMo PIN. ",
  }, "rep-abc123");
  assert.deepEqual(payload, {
    number: "0240000009",
    trick: "community_reported",
    reporter_id: "rep-abc123",
    description: "Asked for my MoMo PIN.",
    community: "Madina",
    incident_time: "this morning",
  });
});

test("buildReportPayload tolerates a missing optional time", () => {
  const payload = buildReportPayload({
    number: "0240000009", community: "Madina", description: "Asked for my PIN.",
  }, "rep-abc123");
  assert.equal(payload.incident_time, "");
});
