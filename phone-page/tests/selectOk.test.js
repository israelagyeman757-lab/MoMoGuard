import test from "node:test";
import assert from "node:assert/strict";
import { SELECT_PHONE_KEY, isSelectControl } from "../selectAction.js";
import { mapKeyboardEvent } from "../keyboardMap.js";
import { PhoneFlow } from "../phoneFlow.js";

const bare = { ctrlKey: false, metaKey: false, altKey: false };

test("centre OK and left Select use the same phone action", () => {
  assert.ok(isSelectControl("soft_left"));
  assert.ok(isSelectControl("key_ok"));
  assert.equal(SELECT_PHONE_KEY, "ok");
});

test("Enter matches left soft Select mapping", () => {
  const enter = mapKeyboardEvent({ key: "Enter", ...bare });
  const f1 = mapKeyboardEvent({ key: "F1", ...bare });
  assert.deepEqual(enter, { phoneKey: SELECT_PHONE_KEY, highlight: "#soft_left" });
  assert.deepEqual(f1, { phoneKey: SELECT_PHONE_KEY, highlight: "#soft_left" });
});

test("Select from lock has identical outcome regardless of entry", () => {
  const left = new PhoneFlow();
  left.finishBoot();
  left.press(SELECT_PHONE_KEY);
  const centre = new PhoneFlow();
  centre.finishBoot();
  centre.press(SELECT_PHONE_KEY);
  assert.equal(left.state.lockAwaitStar, centre.state.lockAwaitStar);
  assert.equal(left.state.screen, centre.state.screen);
});