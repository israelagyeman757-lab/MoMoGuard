import test from "node:test";
import assert from "node:assert/strict";
import { SmartphoneShell, DOCK_APPS } from "../smartphoneShell.js";
import { SmartphoneFlow } from "../smartphoneFlow.js";

test("home has exactly three dock apps", () => {
  assert.equal(DOCK_APPS.length, 3);
  assert.deepEqual(DOCK_APPS.map(app => app.id), ["phone", "messages", "innovateReps"]);
});

test("openApp and goHome switch the active app", () => {
  const shell = new SmartphoneShell();
  assert.equal(shell.isHome(), true);
  assert.equal(shell.openApp("messages"), true);
  assert.equal(shell.activeApp, "messages");
  assert.equal(shell.isHome(), false);
  shell.goHome();
  assert.equal(shell.isHome(), true);
  assert.equal(shell.activeApp, null);
});

test("invalid app ids are rejected", () => {
  const shell = new SmartphoneShell();
  assert.equal(shell.openApp("calculator"), false);
  assert.equal(shell.isHome(), true);
});

test("messages app stores simulated SMS without scanning metadata", () => {
  const flow = new SmartphoneFlow();
  const message = flow.receiveSimulatedSms({ sender: "0240000005", text: "Hello rep" });
  assert.equal(flow.messages[0], message);
  assert.equal(message.source, "simulated");
  assert.equal("warning" in message, false);
  flow.openMessage(0);
  assert.equal(flow.messageScreen, "thread");
  flow.closeMessageThread();
  assert.equal(flow.messageScreen, "inbox");
});

test("incoming call rings only when not already in a call UI state", () => {
  const flow = new SmartphoneFlow();
  assert.equal(flow.receiveSimulatedCall({ name: "Kofi", number: "0240000002" }), true);
  assert.equal(flow.callUi, "ringing");
  assert.equal(flow.receiveSimulatedCall({ name: "Other" }), false);
  flow.declineCall();
  assert.equal(flow.callUi, null);
});