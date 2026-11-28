import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";

describe("api.js controller paths", () => {
  let calls = [];
  const originalFetch = global.fetch;

  before(() => {
    global.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || "GET", body: options.body });
      return {
        ok: true,
        async json() {
          if (String(url).includes("/training/attempts")) {
            return { attempt_id: 1, score: 100, total_questions: 2, correct: 2 };
          }
          if (String(url).includes("/stk/push") && !options.method) {
            return { pending: true, text: "tip", id: "a1" };
          }
          if (String(url).includes("/numbers/check")) {
            return { result: "NO_REPORTS_FOUND", phone_number: "0244999000" };
          }
          if (String(url).includes("/warnings")) {
            return { warnings: [], source: "walo_db" };
          }
          if (String(url).includes("/training/scenarios")) {
            return { scenarios: [] };
          }
          if (String(url).includes("/training/questions")) {
            return { questions: [] };
          }
          if (String(url).includes("/training/results")) {
            return { user_id: "phone-user-1", history: [] };
          }
          if (options.method === "POST" && String(url).endsWith("/reports")) {
            return { id: 9, status: "UNVERIFIED" };
          }
          return { status: "ok" };
        },
      };
    };
  });

  after(() => {
    global.fetch = originalFetch;
  });

  test("checkNumber hits GET /numbers/check", async () => {
    calls = [];
    const api = await import("../api.js");
    const result = await api.checkNumber("0244999000");
    assert.ok(result.ok);
    assert.match(calls[0].url, /\/numbers\/check\/0244999000$/);
  });

  test("submitReport POST /reports with JSON body", async () => {
    calls = [];
    const api = await import("../api.js");
    const body = { reporter_id: "phone-user-1", scam_type: "reversal_scam", description: "x" };
    const result = await api.submitReport(body);
    assert.ok(result.ok);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /\/reports$/);
    assert.equal(JSON.parse(calls[0].body).scam_type, "reversal_scam");
  });

  test("pollStkPush includes consumer query", async () => {
    calls = [];
    const api = await import("../api.js");
    await api.pollStkPush("phone-user-1");
    assert.match(calls[0].url, /consumer=phone-user-1/);
  });

  test("submitTrainingAttempt POST /training/attempts", async () => {
    calls = [];
    const api = await import("../api.js");
    await api.submitTrainingAttempt({
      user_id: "phone-user-1",
      assessment_type: "pre",
      answers: [{ question_id: 1, selected_answer: "a" }],
    });
    assert.match(calls[0].url, /\/training\/attempts$/);
    assert.equal(calls[0].method, "POST");
  });
});