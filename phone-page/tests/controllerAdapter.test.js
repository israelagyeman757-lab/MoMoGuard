import test from "node:test";
import assert from "node:assert/strict";
import { mock, describe, before, after } from "node:test";

describe("controllerAdapter", () => {
  let calls = [];
  const originalFetch = global.fetch;

  before(() => {
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { result: "NO_REPORTS_FOUND" };
        },
      };
    };
  });

  after(() => {
    global.fetch = originalFetch;
  });

  test("checkNumber hits GET /numbers/check", async () => {
    calls = [];
    const adapter = await import("../services/controllerAdapter.js");
    const result = await adapter.checkNumber("0244999000");
    assert.ok(result.ok);
    assert.match(calls[0].url, /\/numbers\/check\/0244999000$/);
  });

  test("submitReport POSTs /reports", async () => {
    calls = [];
    const adapter = await import("../services/controllerAdapter.js");
    await adapter.submitReport({ reporter_id: "u1", scam_type: "other" });
    assert.match(calls[0].url, /\/reports$/);
    assert.equal(calls[0].options.method, "POST");
  });
});