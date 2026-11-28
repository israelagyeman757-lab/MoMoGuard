// Thin fetch wrapper against the real controller, same shape as
// phone-page/services/controllerAdapter.js. Nothing here scores anything
// locally -- every result is exactly what the controller's /reports,
// /numbers, /warnings and /training endpoints returned.

import { CONFIG } from "./config.js";

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.CONTROLLER_TIMEOUT_MS);
  try {
    const response = await fetch(`${CONFIG.CONTROLLER_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: `http_${response.status}`, data };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

function post(path, body) {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}

function patch(path, body) {
  return request(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function createReport({ number, trick, detail, reporterId }) {
  return post("/reports", { number, trick, detail, reporter_id: reporterId });
}

export function listReports(status) {
  return request(status ? `/reports?status=${encodeURIComponent(status)}` : "/reports");
}

export function updateReportStatus(id, status) {
  return patch(`/reports/${id}/status`, { status });
}

export function checkNumber(number) {
  return request(`/numbers/check/${encodeURIComponent(number)}`);
}

export function listWarnings() {
  return request("/warnings");
}

export function resetDemo() {
  return post("/reset-demo", {});
}
