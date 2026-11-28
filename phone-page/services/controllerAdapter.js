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

export function checkNumber(phone) {
  const enc = encodeURIComponent(phone);
  return request(`/numbers/check/${enc}`);
}

export function submitReport(payload) {
  return post("/reports", payload);
}

export function getWarnings() {
  return request("/warnings?status=published");
}

export function trainingQuestions(assessmentType = "pre") {
  return request(`/training/questions?assessment_type=${encodeURIComponent(assessmentType)}`);
}

export function submitTrainingAttempt(body) {
  return post("/training/attempts", body);
}

export function resetDemo() {
  return post("/reset-demo", {});
}

export function pollStkPush(consumer = "phone-user-1") {
  return request(`/stk/push?consumer=${encodeURIComponent(consumer)}`);
}

export function enqueueStkPush(body) {
  return post("/stk/push", body);
}