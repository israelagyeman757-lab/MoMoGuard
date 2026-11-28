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

/** SIM Toolkit: Reverse Number Lookup. Calls the Rancard Glance stub
 * service directly (not through /ussd) -- same pattern as checkSms(), since
 * the SIM Toolkit is a standalone app in the grid, not nested in the dial
 * code flow. See controller/plugs/rancard_glance_plug.py. */
export function reverseLookup(number) {
  return request(`/rancard/reverse-lookup?number=${encodeURIComponent(number)}`);
}

/** SIM Toolkit: Report a Suspicious Number (simpler flow than the Innovate
 * Reps form -- just the number). Reuses the same /report endpoint and
 * GlancePlug-backed storage, not a separate reporting system. */
export function reportSuspiciousNumber(number, reporterId) {
  return post("/report", { number, trick: "community_reported", reporter_id: reporterId });
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
