import test from "node:test";
import assert from "node:assert/strict";
import { PhoneFlow } from "../phoneFlow.js";

// These exercise the phone-page side of the demo-control bridge: a simulated
// SMS or call "arriving" from the separate demo-control page, without any
// network layer (app.js owns that). See demo-control/README.md for the
// end-to-end contract these methods are wired into.

test("a simulated SMS lands in the inbox like a real text, tagged simulated", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  const before = flow.messages.length;
  const message = flow.receiveSimulatedSms({
    sender: "0541234567",
    senderNumber: "0541234567",
    text: "Congratulations! You have won a cash grant. Pay a small fee to claim it.",
    trust: "suspicious",
  });
  assert.equal(flow.messages.length, before + 1);
  assert.equal(flow.messages[0], message);
  assert.equal(message.source, "simulated");
  assert.equal(message.senderNumber, "0541234567");
  assert.match(message.text, /cash grant/);
});

test("a simulated SMS without an explicit senderNumber falls back to sender", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  const message = flow.receiveSimulatedSms({ sender: "0599990000", text: "send your OTP now" });
  assert.equal(message.senderNumber, "0599990000");
});

test("a simulated SMS is accepted even while the phone is mid-flow", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  flow.press("ok");
  assert.equal(flow.state.screen, "apps");
  const before = flow.messages.length;
  flow.receiveSimulatedSms({ sender: "0240000002", text: "Hi Aunty!" });
  assert.equal(flow.messages.length, before + 1);
  assert.equal(flow.state.screen, "apps");
});

test("a simulated call only rings while idle, and shows the caller and trust label", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  const accepted = flow.receiveSimulatedCall({
    name: "Kofi", number: "0240000002", trust: "trusted", amount: 100,
  });
  assert.equal(accepted, true);
  assert.equal(flow.state.screen, "demoCall");
  assert.deepEqual(flow.state.incomingCallContact, {
    name: "Kofi", number: "0240000002", trust: "trusted", note: "", amount: 100,
  });
});

test("a simulated call is refused as busy when the phone is not idle", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  flow.press("ok");
  assert.equal(flow.state.screen, "apps");
  const accepted = flow.receiveSimulatedCall({ name: "Kofi", number: "0240000002" });
  assert.equal(accepted, false);
  assert.equal(flow.state.screen, "apps");
});

test("answering a simulated call hands off to a real controller session, not a local script", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  flow.receiveSimulatedCall({ name: "Unknown number", number: "0240000005", trust: "suspicious", amount: 300 });
  flow.press("call");
  assert.equal(flow.state.screen, "serverLoading");
  assert.equal(flow.state.loadingKind, "autoCall");
  assert.deepEqual(flow.state.autoCallContact, {
    name: "Unknown number", number: "0240000005", trust: "suspicious", note: "", amount: 300,
  });
  assert.equal(flow.state.incomingCallContact, null);
});

test("declining a simulated call (End) returns to idle without starting anything", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  flow.receiveSimulatedCall({ name: "Kofi", number: "0240000002", amount: 100 });
  flow.press("end");
  assert.equal(flow.state.screen, "idle");
  assert.equal(flow.state.incomingCallContact, null);
  assert.equal(flow.state.autoCallContact, null);
});

test("declining a simulated call (Back) also returns to idle", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  flow.receiveSimulatedCall({ name: "Kofi", number: "0240000002", amount: 100 });
  flow.press("back");
  assert.equal(flow.state.screen, "idle");
  assert.equal(flow.state.incomingCallContact, null);
});

test("a completed controller result from an answered call renders on the normal server screen", () => {
  const flow = new PhoneFlow({ mode: "controller" });
  flow.receiveSimulatedCall({ name: "Kofi", number: "0240000002", amount: 100 });
  flow.press("call");
  assert.equal(flow.state.screen, "serverLoading");
  // app.js would now drive /ussd and feed the final result back in here,
  // exactly as it does for a manually typed USSD session.
  flow.applyServerScreen({ text: "Sent GH₵100 to Kofi.", state: "result", done: false });
  assert.equal(flow.state.screen, "server");
  assert.equal(flow.messages[0].tag, "transaction");
});

test("mock mode is unaffected: a simulated call still just shows the demoCall screen locally", () => {
  const flow = new PhoneFlow();
  const accepted = flow.receiveSimulatedCall({ name: "Kofi", number: "0240000002", amount: 100 });
  assert.equal(accepted, true);
  assert.equal(flow.state.screen, "demoCall");
});
