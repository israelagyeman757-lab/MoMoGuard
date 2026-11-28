import test from "node:test";
import assert from "node:assert/strict";
import { PhoneFlow } from "../phoneFlow.js";

test("showStkPopup overlays idle", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "idle";
  flow.showStkPopup({ text: "Demo", more: false, report: true });
  assert.equal(flow.state.screen, "stkPopup");
  assert.equal(flow.state.popup.text, "Demo");
});

test("dismiss returns to idle", () => {
  const flow = new PhoneFlow();
  flow.state.screen = "idle";
  flow.showStkPopup({ text: "x" });
  flow.dismissStkPopup();
  assert.equal(flow.state.screen, "idle");
  assert.equal(flow.state.popup, null);
});