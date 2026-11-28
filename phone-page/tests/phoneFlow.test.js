import test from "node:test";
import assert from "node:assert/strict";
import { PhoneFlow } from "../phoneFlow.js";
import { DEMO_SCAM_NUMBER } from "../mockResponses.js";
import { T9Input } from "../t9.js";
import { softKeyLabels } from "../softKeys.js";

test("boot leads to lock; Unlock then * reaches idle", () => {
  const flow = new PhoneFlow();
  assert.equal(flow.state.screen, "boot");
  flow.finishBoot();
  assert.equal(flow.state.screen, "lock");
  flow.press("softRight");
  assert.ok(flow.state.lockAwaitStar);
  flow.press("*");
  assert.equal(flow.state.screen, "idle");
});

test("idle soft keys: Select left, Menu right", () => {
  const labels = softKeyLabels("idle");
  assert.equal(labels.left, "Select");
  assert.equal(labels.right, "Menu");
});

test("T9 number mode and clear", () => {
  const t9 = new T9Input({ mode: "number" });
  t9.pressDigit("0");
  t9.pressDigit("2");
  assert.match(t9.value, /02/);
  t9.clear();
  assert.equal(t9.value.length, 1);
});

test("SIM Toolkit check number uses highlight menu, not digit prefix", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "stkMomo";
  flow.state.stkMenuIndex = 3;
  flow.press("ok");
  for (const d of DEMO_SCAM_NUMBER) flow.press(d);
  flow.press("ok");
  assert.equal(flow.state.screen, "loading");
  flow.applyCheckMock();
  assert.equal(flow.state.lookup.result, "WARNING_AVAILABLE");
});

test("scam SMS report uses Select soft key", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "sms";
  flow.state.messageTag = "scam";
  flow.state.smsReportNumber = DEMO_SCAM_NUMBER;
  flow.press("ok");
  assert.equal(flow.state.screen, "stkReportType");
});

test("stk popup dismiss and more", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "idle";
  flow.showStkPopup({ text: "Alert", more: true, report: false });
  assert.equal(flow.state.screen, "stkPopup");
  flow.press("ok");
  assert.equal(flow.state.screen, "loading");
  assert.equal(flow.state.loadingKind, "warnings");
});

test("red end key resets to idle", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "stkMomo";
  flow.press("end");
  assert.equal(flow.state.screen, "idle");
});