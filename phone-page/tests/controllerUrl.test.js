import test from "node:test";
import assert from "node:assert/strict";
import { resolveControllerUrl } from "../../shared/controllerUrl.js";

test("resolveControllerUrl defaults to local uvicorn when window is absent", () => {
  assert.equal(resolveControllerUrl(), "http://127.0.0.1:8000");
});