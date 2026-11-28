import test from "node:test";
import assert from "node:assert/strict";
import { PhoneFlow } from "../phoneFlow.js";

const DEMO_SCAM_NUMBER = "0244123456";

test("boot leads to lock; * reaches idle", () => {
  const flow = new PhoneFlow();
  assert.equal(flow.state.screen, "boot");
  flow.finishBoot();
  assert.equal(flow.state.screen, "lock");
  flow.press("*");
  assert.equal(flow.state.screen, "idle");
});

test("idle soft key routes: OK opens menu from primary", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "idle";
  flow.press("ok");
  assert.equal(flow.state.screen, "menu");
});

test("SIM Toolkit check number via highlight menu", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "stkMomo";
  flow.state.stkIndex = 3;
  flow.press("ok");
  for (const d of DEMO_SCAM_NUMBER) flow.press(d);
  flow.press("ok");
  assert.equal(flow.state.screen, "stkLoading");
  flow.applyCheckMock();
  assert.equal(flow.state.screen, "stkCheckResult");
  assert.equal(flow.state.checkResult.result, "WARNING_AVAILABLE");
});

test("scam SMS report uses OK / Select", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "sms";
  flow.state.currentSms = {
    from: "MTN Support",
    number: DEMO_SCAM_NUMBER,
    tag: "scam",
    text: "Verify PIN",
  };
  flow.press("ok");
  assert.equal(flow.state.screen, "stkReportType");
});

test("stk popup More fetches warnings", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "idle";
  flow.showStkPopup({ text: "Alert", more: true, report: false });
  assert.equal(flow.state.screen, "stkPopup");
  flow.press("ok");
  assert.equal(flow.state.screen, "stkLoading");
  assert.equal(flow.state.pending?.kind, "warnings");
});

test("red end key resets to idle", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "stkMomo";
  flow.press("end");
  assert.equal(flow.state.screen, "idle");
});

test("OK and soft-left both trigger primary", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "settings";
  flow.state.settingsIndex = 0;
  assert.equal(flow.press("ok"), "full");
  assert.equal(flow.press("soft-left"), "full");
});