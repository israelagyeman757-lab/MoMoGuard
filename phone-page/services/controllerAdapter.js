import { CONFIG } from "../config.js";

const DEFAULT_TIMEOUT_MS = 5000;

async function request(path, options = {}) {
  if (CONFIG.MODE !== "controller" || !CONFIG.CONTROLLER_URL) {
    return { ok: false, error: "controller_not_configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.CONTROLLER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${CONFIG.CONTROLLER_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return { ok: false, error: `http_${response.status}` };
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: error?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

function post(path, body) {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}

export function ussd(sessionId, key, sender) {
  return post("/ussd", { session_id: sessionId, key, sender });
}

export function assess(payload) {
  return post("/assess", payload);
}

export function confirmPayment(payload) {
  return post("/confirm", payload);
}

export function voiceResult(payload) {
  return post("/voice-result", payload);
}

export function resume(reference, sender) {
  return post("/resume", { reference, sender });
}

export function report(number, trick, reporterId) {
  return post("/report", { number, trick, reporter_id: reporterId });
}

export function checkNumber(number) {
  return request(`/check-number?number=${encodeURIComponent(number)}`);
}

export function checkSms(payload) {
  return post("/check-sms", payload);
}

export function resetDemo() {
  return post("/reset-demo", {});
}

export function metrics() {
  return request("/metrics");
}

export function audit() {
  return request("/audit");
}
