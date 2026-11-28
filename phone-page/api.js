import { CONFIG } from "./config.js";

async function request(path, options = {}) {
  if (CONFIG.MODE !== "controller") {
    return { ok: false, error: "controller_not_configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.CONTROLLER_TIMEOUT_MS);
  try {
    const response = await fetch(`${CONFIG.API_BASE}${path}`, {
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

export function getHealth() {
  return request("/health");
}

export function checkNumber(phone) {
  return request(`/numbers/check/${encodeURIComponent(phone)}`);
}

export function submitReport(body) {
  return post("/reports", body);
}

export function getWarnings() {
  return request("/warnings?status=published");
}

export function getTrainingScenarios() {
  return request("/training/scenarios");
}

export function getTrainingScenario(id) {
  return request(`/training/scenarios/${encodeURIComponent(id)}`);
}

export function getTrainingQuestions(assessmentType = "pre") {
  return request(`/training/questions?assessment_type=${encodeURIComponent(assessmentType)}`);
}

export function submitTrainingAttempt(body) {
  return post("/training/attempts", body);
}

export function getTrainingResults(userId) {
  return request(`/training/results/${encodeURIComponent(userId)}`);
}

export function getTrainingRecommendations(userId) {
  return request(`/training/recommendations/${encodeURIComponent(userId)}`);
}

export function pollStkPush(consumer) {
  return request(`/stk/push?consumer=${encodeURIComponent(consumer)}`);
}

export function enqueueStkPush(body) {
  return post("/stk/push", body);
}

export function resetDemo() {
  return post("/reset-demo", {});
}

export function evaluateHold(body) {
  return post("/holds/evaluate", body);
}

export function withdrawCheck(phone) {
  return request(`/holds/withdraw-check/${encodeURIComponent(phone)}`);
}