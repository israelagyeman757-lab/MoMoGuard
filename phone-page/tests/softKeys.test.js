import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { softKeyLabels } from "../softKeys.js";

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(here, "..", "index.html"), "utf8");

test("soft keys reflect idle menu and entry screens", () => {
  assert.deepEqual(softKeyLabels("idle"), { left: "—", right: "Menu" });
  assert.deepEqual(softKeyLabels("ussd"), { left: "Back", right: "OK" });
  assert.deepEqual(softKeyLabels("simToolkitCommunityFraudPin"), { left: "Back", right: "OK" });
  assert.deepEqual(softKeyLabels("demoCall"), { left: "Back", right: "Answer" });
});

test("page is phone-only without marketing clutter", () => {
  assert.doesNotMatch(indexHtml, /demo-guide|page-header|page-footer|keyboard-hint|SIMULATED PROTOTYPE/i);
  assert.match(indexHtml, /soft-key-row/);
  assert.match(indexHtml, /data-key="call"/);
  assert.match(indexHtml, /data-key="end"/);
});