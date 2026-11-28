import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../config.js";
import * as adapter from "../services/controllerAdapter.js";

const realFetch = globalThis.fetch;

function useControllerMode(overrides = {}) {
  CONFIG.MODE = "controller";
  CONFIG.CONTROLLER_URL = "http://127.0.0.1:8000";
  Object.assign(CONFIG, overrides);
}

function restore() {
  globalThis.fetch = realFetch;
  CONFIG.MODE = "mock";
  CONFIG.CONTROLLER_URL = "";
  delete CONFIG.CONTROLLER_TIMEOUT_MS;
}

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return calls;
}

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test("mock mode never calls fetch and reports not configured", async t => {
  restore();
  const calls = stubFetch(() => jsonResponse({}));
  const result = await adapter.ussd("s1", "", "0240000001");
  assert.equal(result.ok, false);
  assert.equal(result.error, "controller_not_configured");
  assert.equal(calls.length, 0);
  t.after(restore);
});

test("ussd posts the session, key and sender to the controller", async t => {
  useControllerMode();
  const calls = stubFetch(() => jsonResponse({ text: "Welcome", state: "main_menu", done: false }));
  const result = await adapter.ussd("s1", "1", "0240000001");
  assert.equal(result.ok, true);
  assert.equal(result.data.state, "main_menu");
  assert.equal(calls[0].url, "http://127.0.0.1:8000/ussd");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { session_id: "s1", key: "1", sender: "0240000001" });
  t.after(restore);
});

test("an http error becomes ok false with the status, never data", async t => {
  useControllerMode();
  stubFetch(() => jsonResponse({ detail: "boom" }, 500));
  const result = await adapter.metrics();
  assert.equal(result.ok, false);
  assert.equal(result.error, "http_500");
  assert.equal(result.data, undefined);
  t.after(restore);
});

test("a network failure becomes ok false with error network", async t => {
  useControllerMode();
  stubFetch(() => { throw new TypeError("failed to fetch"); });
  const result = await adapter.ussd("s1", "", "0240000001");
  assert.equal(result.ok, false);
  assert.equal(result.error, "network");
  t.after(restore);
});

test("a slow controller times out and reports timeout, not success", async t => {
  useControllerMode({ CONTROLLER_TIMEOUT_MS: 20 });
  stubFetch((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  }));
  const result = await adapter.metrics();
  assert.equal(result.ok, false);
  assert.equal(result.error, "timeout");
  t.after(restore);
});

test("reverseLookup uses a query parameter and never a body", async t => {
  useControllerMode();
  const calls = stubFetch(() => jsonResponse({ number: "0240000009", status: "flagged", source: "rancard_stub" }));
  const result = await adapter.reverseLookup("0240000009");
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, "http://127.0.0.1:8000/rancard/reverse-lookup?number=0240000009");
  assert.equal(calls[0].options.method, undefined);
  assert.equal(calls[0].options.body, undefined);
  t.after(restore);
});

test("reportSuspiciousNumber posts the SIM Toolkit payload object", async t => {
  useControllerMode();
  const calls = stubFetch(() => jsonResponse({ accepted: true }));
  await adapter.reportSuspiciousNumber({
    number: "0240000005",
    trick: "possible_fake_reversal",
    reporter_id: "0240000001",
    request_type: "reversal",
    channel: "customer_sim_toolkit",
  });
  assert.equal(calls[0].url, "http://127.0.0.1:8000/report");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    number: "0240000005",
    trick: "possible_fake_reversal",
    reporter_id: "0240000001",
    request_type: "reversal",
    channel: "customer_sim_toolkit",
  });
  t.after(restore);
});

test("check-sms posts the message and returns the warn-only result", async t => {
  useControllerMode();
  const calls = stubFetch(() => jsonResponse({ recommended_action: "warn", warning: "This may be a fake deposit." }));
  const result = await adapter.checkSms({ sender: "0240000005", recipient: "0240000001", text: "Return GH₵200 now.", ts: "2026-11-25T10:00:00" });
  assert.equal(result.ok, true);
  assert.equal(result.data.recommended_action, "warn");
  assert.equal(calls[0].url, "http://127.0.0.1:8000/check-sms");
  assert.equal(JSON.parse(calls[0].options.body).sender, "0240000005");
  t.after(restore);
});

test("report, resume, assess, confirm, voice-result and reset-demo send contract bodies", async t => {
  useControllerMode();
  const calls = stubFetch(() => jsonResponse({ status: "ok" }));
  await adapter.report("0240000009", "possible_fake_reversal", "s1");
  await adapter.resume("r1", "0240000001");
  await adapter.assess({ session_id: "s1", sender: "0240000001", recipient: "0240000002", amount: 300 });
  await adapter.confirmPayment({ session_id: "s1", sender: "0240000001", recipient: "0240000002", amount: 7000, answer: "yes" });
  await adapter.voiceResult({ reference: "r1", sender: "0240000001", answers: {} });
  await adapter.resetDemo();
  const sent = calls.map(call => [call.url, call.options.method, JSON.parse(call.options.body)]);
  assert.deepEqual(sent[0], ["http://127.0.0.1:8000/report", "POST", { number: "0240000009", trick: "possible_fake_reversal", reporter_id: "s1" }]);
  assert.deepEqual(sent[1], ["http://127.0.0.1:8000/resume", "POST", { reference: "r1", sender: "0240000001" }]);
  assert.equal(sent[2][0], "http://127.0.0.1:8000/assess");
  assert.equal(sent[3][0], "http://127.0.0.1:8000/confirm");
  assert.equal(sent[4][0], "http://127.0.0.1:8000/voice-result");
  assert.deepEqual(sent[5], ["http://127.0.0.1:8000/reset-demo", "POST", {}]);
  t.after(restore);
});

test("audit and metrics are plain GETs", async t => {
  useControllerMode();
  const calls = stubFetch(() => jsonResponse({ events: [] }));
  await adapter.audit();
  await adapter.metrics();
  assert.equal(calls[0].url, "http://127.0.0.1:8000/audit");
  assert.equal(calls[1].url, "http://127.0.0.1:8000/metrics");
  t.after(restore);
});
