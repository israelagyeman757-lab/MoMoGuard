import test from "node:test";
import assert from "node:assert/strict";
import { SIMULATED_CONTACTS } from "../contacts.js";

test("every simulated contact has a well-formed, labelled shape", () => {
  assert.ok(SIMULATED_CONTACTS.length >= 4);
  const ids = new Set();
  for (const contact of SIMULATED_CONTACTS) {
    assert.match(contact.number, /^\+?\d{7,15}$/, `${contact.id} number looks invalid`);
    assert.ok(["trusted", "suspicious"].includes(contact.trust), `${contact.id} trust must be trusted|suspicious`);
    assert.equal(typeof contact.savedContact, "boolean");
    assert.equal(typeof contact.timesContactedBefore, "number");
    assert.ok(contact.note.length > 0, `${contact.id} needs an explanatory note`);
    assert.ok(contact.smsTemplate.length > 0, `${contact.id} needs a default message`);
    assert.match(contact.call.recipient, /^\+?\d{7,15}$/);
    assert.ok(contact.call.amount > 0, `${contact.id} call amount must be positive`);
    ids.add(contact.id);
  }
  assert.equal(ids.size, SIMULATED_CONTACTS.length, "contact ids must be unique");
});

test("trust is consistent with being saved: trusted contacts are saved, suspicious ones are not", () => {
  for (const contact of SIMULATED_CONTACTS) {
    if (contact.trust === "trusted") assert.equal(contact.savedContact, true, `${contact.id}`);
    if (contact.trust === "suspicious") assert.equal(contact.savedContact, false, `${contact.id}`);
  }
});

test("at least one trusted and one suspicious contact exist, covering both demo scenarios", () => {
  assert.ok(SIMULATED_CONTACTS.some(c => c.trust === "trusted"));
  assert.ok(SIMULATED_CONTACTS.some(c => c.trust === "suspicious"));
});
