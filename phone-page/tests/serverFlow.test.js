import test from "node:test";
import assert from "node:assert/strict";
import { PhoneFlow } from "../phoneFlow.js";

function controllerFlow() {
  return new PhoneFlow({ mode: "controller" });
}

function enter(flow, value) {
  for (const key of value) flow.press(key);
  flow.press("ok");
}

function startSession(flow, screen = { text: "Welcome to MoMoGuard\n1 Send Money", state: "main_menu", done: false }) {
  flow.press("call");
  enter(flow, "*000#");
  flow.applyServerScreen(screen);
}

test("controller mode starts a server session after the demo code", () => {
  const flow = controllerFlow();
  flow.press("call");
  enter(flow, "*000#");
  assert.equal(flow.state.screen, "serverLoading");
  assert.equal(flow.state.serverPendingKey, "");
  assert.ok(flow.sessionId);
  assert.equal(flow.sender, "0240000001");
});

test("the server screen shows controller text and sends the typed key on OK", () => {
  const flow = controllerFlow();
  startSession(flow);
  assert.equal(flow.state.screen, "server");
  assert.equal(flow.state.serverText, "Welcome to MoMoGuard\n1 Send Money");
  assert.equal(flow.state.serverState, "main_menu");
  enter(flow, "1");
  assert.equal(flow.state.screen, "serverLoading");
  assert.equal(flow.state.serverPendingKey, "1");
  assert.equal(flow.state.entry, "");
  flow.applyServerScreen({ text: "Send Money. Enter recipient number:", state: "send_recipient", done: false });
  enter(flow, "0240000002");
  assert.equal(flow.state.serverPendingKey, "0240000002");
});

test("a wrong demo code still fails locally in controller mode", () => {
  const flow = controllerFlow();
  flow.press("call");
  enter(flow, "*123#");
  assert.equal(flow.state.screen, "error");
  assert.equal(flow.state.serverPendingKey, null);
});

test("end and back close the server session and return to idle", () => {
  const flow = controllerFlow();
  startSession(flow);
  flow.press("end");
  assert.equal(flow.state.screen, "idle");
  startSession(flow);
  flow.press("back");
  assert.equal(flow.state.screen, "idle");
});

test("a controller result that says Sent adds a transaction receipt", () => {
  const flow = controllerFlow();
  const before = flow.messages.length;
  startSession(flow);
  enter(flow, "1");
  flow.applyServerScreen({ text: "Send Money. Enter recipient number:", state: "send_recipient", done: false });
  enter(flow, "0240000002");
  flow.applyServerScreen({ text: "Enter amount (GH₵):", state: "send_amount", done: false });
  enter(flow, "100");
  flow.applyServerScreen({ text: "Sent GH₵100 to Kofi.", state: "result", done: false });
  assert.equal(flow.state.screen, "server");
  assert.equal(flow.messages.length, before + 1);
  assert.equal(flow.messages[0].tag, "transaction");
  assert.match(flow.messages[0].text, /Sent GH₵100 to Kofi/);
  assert.equal(flow.messages[0].source, "simulated");
  flow.press("end");
  assert.equal(flow.messages.length, before + 1);
});

test("cancelled or blocked controller text never adds a receipt", () => {
  const flow = controllerFlow();
  const before = flow.messages.length;
  startSession(flow);
  enter(flow, "1");
  flow.applyServerScreen({ text: "Payment cancelled. Nothing was sent.", state: "result", done: false });
  assert.equal(flow.messages.length, before);
  enter(flow, "2");
  flow.applyServerScreen({ text: "This payment has been stopped to protect you. It may be a trick. Nothing was sent. Report? 1 Yes 2 No", state: "offer_report", done: false });
  assert.equal(flow.messages.length, before);
});

test("a controller failure shows an error screen, never sent", () => {
  const flow = controllerFlow();
  flow.press("call");
  enter(flow, "*000#");
  flow.applyServerError("Could not reach MoMoGuard. Nothing was sent.");
  assert.equal(flow.state.screen, "serverError");
  assert.notEqual(flow.state.screen, "sent");
  assert.match(flow.state.message, /Nothing was sent/);
  flow.press("ok");
  assert.equal(flow.state.screen, "idle");
});

test("a done response ends the session locally", () => {
  const flow = controllerFlow();
  flow.press("call");
  enter(flow, "*000#");
  flow.applyServerScreen({ text: "Session ended.", state: "ended", done: true });
  assert.equal(flow.state.screen, "idle");
});

test("server results are ignored unless a request is pending", () => {
  const flow = controllerFlow();
  flow.applyServerScreen({ text: "Sent GH₵100 to Kofi.", state: "result", done: false });
  assert.equal(flow.state.screen, "idle");
  assert.equal(flow.messages.filter(message => message.tag === "transaction").length, 1);
});

test("clear edits the typed key and empty OK asks for a value", () => {
  const flow = controllerFlow();
  startSession(flow);
  flow.press("1");
  flow.press("2");
  flow.press("clear");
  assert.equal(flow.state.entry, "1");
  flow.press("clear");
  flow.press("ok");
  assert.equal(flow.state.screen, "server");
  assert.match(flow.state.notice, /enter a value/i);
});

test("mock mode is unchanged when no mode is passed", () => {
  const flow = new PhoneFlow();
  flow.press("call");
  enter(flow, "*000#");
  assert.equal(flow.state.screen, "main");
});
