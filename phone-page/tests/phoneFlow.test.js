import test from "node:test";
import assert from "node:assert/strict";
import { PhoneFlow } from "../phoneFlow.js";

function enter(flow, value) {
  for (const key of value) flow.press(key);
  flow.press("ok");
}

function openMain(flow) {
  flow.press("call");
  enter(flow, "*000#");
}

function openPayment(flow, recipient, amount) {
  openMain(flow);
  flow.press("1");
  enter(flow, recipient);
  enter(flow, amount);
}

function answerInnocentVoiceCheck(flow) {
  flow.press("call");
  flow.press("call");
  flow.finishAudio();
  for (const key of ["3", "3", "2", "2", "1"]) flow.press(key);
}

test("call key opens USSD entry and the placeholder code opens the menu", () => {
  const flow = new PhoneFlow();
  assert.equal(flow.state.screen, "idle");
  openMain(flow);
  assert.equal(flow.state.screen, "main");
});

test("clear deletes one digit and back returns to the previous screen", () => {
  const flow = new PhoneFlow();
  flow.press("call");
  flow.press("*");
  flow.press("0");
  flow.press("clear");
  assert.equal(flow.state.entry, "*");
  flow.press("back");
  assert.equal(flow.state.screen, "idle");
  openMain(flow);
  flow.press("1");
  flow.press("back");
  assert.equal(flow.state.screen, "main");
});

test("a normal supplier payment reaches the sent result", () => {
  const flow = new PhoneFlow();
  openPayment(flow, "0240000006", "100");
  flow.press("1");
  assert.equal(flow.state.screen, "loading");
  flow.finishPayment();
  assert.equal(flow.state.screen, "sent");
});

test("a trusted big amount gets the special confirm screen", () => {
  const flow = new PhoneFlow();
  openPayment(flow, "0240000002", "7000");
  flow.press("1");
  flow.finishPayment();
  assert.equal(flow.state.screen, "bigConfirm");
  assert.equal(flow.state.confirm.usual, 100);
  flow.press("1");
  flow.finishPayment();
  assert.equal(flow.state.screen, "sent");
});

test("a high-risk demo pauses, locks during audio, then accepts answers", () => {
  const flow = new PhoneFlow();
  openPayment(flow, "0240000007", "300");
  flow.press("1");
  flow.finishPayment();
  assert.equal(flow.state.screen, "paused");
  flow.press("call");
  assert.equal(flow.state.screen, "incomingCall");
  flow.press("call");
  assert.equal(flow.state.screen, "voiceAudio");
  assert.equal(flow.state.locked, true);
  flow.press("1");
  assert.equal(flow.state.voiceStep, 0);
  flow.finishAudio();
  assert.equal(flow.state.locked, false);
  assert.equal(flow.state.screen, "voiceQuestion");
  for (const key of ["3", "3", "2", "2", "1"]) flow.press(key);
  assert.equal(flow.state.screen, "sent");
});

test("the very-high demo stops the payment and end always exits", () => {
  const flow = new PhoneFlow();
  openPayment(flow, "0240000005", "300");
  flow.press("1");
  flow.finishPayment();
  assert.equal(flow.state.screen, "blocked");
  flow.press("end");
  assert.equal(flow.state.screen, "idle");
  assert.equal(flow.state.recipient, "");
});

test("report, alerts, and language screens are reachable", () => {
  const flow = new PhoneFlow();
  openMain(flow);
  flow.press("2");
  enter(flow, "0240000005");
  flow.press("1");
  assert.equal(flow.state.screen, "reportSent");
  flow.press("end");

  openMain(flow);
  flow.press("3");
  assert.equal(flow.state.screen, "alerts");
  flow.press("back");
  flow.press("5");
  flow.press("2");
  assert.equal(flow.state.language, "en");
  assert.match(flow.state.notice, /English is active/);
});

// Grid is 3x3, row-major: row0=[phone,messages,contacts], row1=[calculator,
// calendar,camera], row2=[settings,tools,simToolkit]. down,down,right,right
// walks phone(0) -> calculator(3) -> settings(6) -> tools(7) -> simToolkit(8).
function openSimToolkit(flow) {
  flow.press("ok");
  flow.press("down");
  flow.press("down");
  flow.press("right");
  flow.press("right");
  assert.equal(flow.state.selectedApp, "simToolkit");
  flow.press("ok");
}

test("SIM Toolkit is reachable from the app grid and lists its 3 options", () => {
  const flow = new PhoneFlow();
  openSimToolkit(flow);
  assert.equal(flow.state.screen, "simToolkit");
});

test("SIM Toolkit option 1 (Learn About Emerging Scams) is a placeholder with no content", () => {
  const flow = new PhoneFlow();
  openSimToolkit(flow);
  flow.press("1");
  assert.equal(flow.state.screen, "simToolkitLearn");
  flow.press("back");
  assert.equal(flow.state.screen, "simToolkit");
});

test("SIM Toolkit Reverse Number Lookup flags a known demo number (mock mode)", () => {
  const flow = new PhoneFlow();
  openSimToolkit(flow);
  flow.press("2");
  assert.equal(flow.state.screen, "simToolkitLookup");
  enter(flow, "0240000009");
  flow.finishReverseLookup();
  assert.equal(flow.state.screen, "simToolkitLookupResult");
  assert.equal(flow.state.reverseLookupStatus, "flagged");
});

test("SIM Toolkit Reverse Number Lookup never claims an unknown number is safe", () => {
  const flow = new PhoneFlow();
  openSimToolkit(flow);
  flow.press("2");
  enter(flow, "0209999999");
  flow.finishReverseLookup();
  assert.equal(flow.state.reverseLookupStatus, "no_results");
  assert.match(flow.state.reverseLookupMessage, /not proof/i);
});

test("a Reverse Number Lookup backend failure shows a clearly-labelled error, not a false clear", () => {
  const flow = new PhoneFlow();
  flow.state.reverseLookupNumber = "0240000009";
  flow.state.screen = "loading";
  flow.applyReverseLookupError();
  assert.equal(flow.state.reverseLookupStatus, "error");
  assert.match(flow.state.reverseLookupMessage, /not proof/i);
});

test("SIM Toolkit Report a Suspicious Number is a simpler, number-only flow", () => {
  const flow = new PhoneFlow();
  openSimToolkit(flow);
  flow.press("3");
  assert.equal(flow.state.screen, "simToolkitReport");
  enter(flow, "0240000005");
  flow.finishReportSuspiciousNumber();
  assert.equal(flow.state.screen, "simToolkitReportSent");
  assert.match(flow.state.reportSuspiciousMessage, /noted as suspected/i);
});

test("OK opens two apps and navigation changes the selected app", () => {
  const flow = new PhoneFlow();
  assert.equal(flow.state.screen, "idle");
  flow.press("ok");
  assert.equal(flow.state.screen, "apps");
  assert.equal(flow.state.selectedApp, "phone");
  flow.press("right");
  assert.equal(flow.state.selectedApp, "messages");
  flow.press("left");
  assert.equal(flow.state.selectedApp, "phone");
});

test("Phone opens USSD and Messages opens an inbox before the warning", () => {
  const flow = new PhoneFlow();
  flow.press("ok");
  flow.press("ok");
  assert.equal(flow.state.screen, "ussd");
  flow.press("end");
  assert.equal(flow.state.screen, "idle");
  flow.press("ok");
  flow.press("right");
  flow.press("ok");
  assert.equal(flow.state.screen, "messages");
  flow.press("ok");
  assert.equal(flow.state.screen, "sms");
  assert.match(flow.state.messageWarning, /may be/i);
  flow.press("back");
  assert.equal(flow.state.screen, "messages");
});

test("demo PIN digits are shown only as a count and never stored", () => {
  const flow = new PhoneFlow();
  openPayment(flow, "0240000006", "100");
  flow.press("1");
  flow.finishPayment();
  flow.press("ok");
  assert.equal(flow.state.screen, "pin");
  for (const key of ["1", "2", "3", "4"]) flow.press(key);
  assert.equal(flow.state.pinLength, 4);
  assert.equal(flow.state.entry, "");
  assert.equal(JSON.stringify(flow.state).includes("1234"), false);
  flow.press("ok");
  assert.equal(flow.state.screen, "demoComplete");
});

test("a failed local request shows an error and never a sent result", () => {
  const flow = new PhoneFlow();
  openPayment(flow, "0240000006", "100");
  flow.press("1");
  flow.fail("Please try again");
  assert.equal(flow.state.screen, "error");
  assert.notEqual(flow.state.screen, "sent");
  assert.match(flow.state.message, /try again/i);
});

test("end cancels even while the audio keypad is locked", () => {
  const flow = new PhoneFlow();
  openPayment(flow, "0240000007", "300");
  flow.press("1");
  flow.finishPayment();
  flow.press("call");
  flow.press("call");
  flow.press("end");
  assert.equal(flow.state.screen, "idle");
  assert.equal(flow.state.locked, false);
});

test("app grid moves in three rows and inactive apps stay closed", () => {
  const flow = new PhoneFlow();
  flow.press("ok");
  flow.press("down");
  assert.equal(flow.state.selectedApp, "calculator");
  flow.press("right");
  assert.equal(flow.state.selectedApp, "calendar");
  flow.press("down");
  assert.equal(flow.state.selectedApp, "tools");
  flow.press("up");
  assert.equal(flow.state.selectedApp, "calendar");
  flow.press("left");
  assert.equal(flow.state.selectedApp, "calculator");
  flow.press("up");
  assert.equal(flow.state.selectedApp, "phone");
  flow.press("right");
  assert.equal(flow.state.selectedApp, "messages");
  flow.press("right");
  assert.equal(flow.state.selectedApp, "contacts");
  flow.press("ok");
  assert.equal(flow.state.screen, "apps");
});

test("inbox lists several messages and navigation selects without opening", () => {
  const flow = new PhoneFlow();
  assert.ok(flow.messages.length >= 5);
  flow.press("ok");
  flow.press("right");
  flow.press("ok");
  assert.equal(flow.state.screen, "messages");
  assert.equal(flow.state.selectedMessage, 0);
  flow.press("down");
  assert.equal(flow.state.selectedMessage, 1);
  flow.press("down");
  assert.equal(flow.state.selectedMessage, 2);
  flow.press("up");
  assert.equal(flow.state.selectedMessage, 1);
  assert.equal(flow.state.screen, "messages");
});

test("selected suspicious message shows a possible fake tag and warning", () => {
  const flow = new PhoneFlow();
  flow.press("ok");
  flow.press("right");
  flow.press("ok");
  flow.press("ok");
  assert.equal(flow.state.screen, "sms");
  assert.equal(flow.state.messageTag, "possible_fake");
  assert.match(flow.state.messageWarning, /may be/i);
  assert.match(flow.state.message, /GH₵300/);
});

test("successful payment adds a transaction receipt that survives End", () => {
  const flow = new PhoneFlow();
  const before = flow.messages.length;
  openPayment(flow, "0240000006", "100");
  flow.press("1");
  flow.finishPayment();
  assert.equal(flow.state.screen, "sent");
  assert.equal(flow.messages.length, before + 1);
  assert.equal(flow.messages[0].tag, "transaction");
  assert.match(flow.messages[0].text, /0240000006/);
  flow.press("end");
  assert.equal(flow.messages.length, before + 1);
  flow.press("ok");
  flow.press("right");
  flow.press("ok");
  assert.equal(flow.state.selectedMessage, 0);
  flow.press("ok");
  assert.match(flow.state.message, /successful/i);
});

test("blocked payment does not add a transaction receipt", () => {
  const flow = new PhoneFlow();
  const before = flow.messages.length;
  openPayment(flow, "0240000005", "300");
  flow.press("1");
  flow.finishPayment();
  assert.equal(flow.state.screen, "blocked");
  assert.equal(flow.messages.length, before);
});
