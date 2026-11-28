import { CONFIG } from "../config.js";

const DEFAULT_TIMEOUT_MS = 8000;

async function request(path, options = {}) {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(),
    CONFIG.CONTROLLER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${CONFIG.CONTROLLER_URL}${path}`, {
      ...options,
      signal: abortController.signal,
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

/** Reuses the existing /report endpoint (GlancePlug) -- the same backend
 * the old USSD "Report a Scam" flow already writes to. No new reporting
 * backend is created for this console. */
export function submitReport(payload) {
  return request("/report", { method: "POST", body: JSON.stringify(payload) });
}

/** Calls the new Rancard Glance stub service (see
 * controller/plugs/rancard_glance_plug.py) -- shared with the SIM Toolkit's
 * Reverse Number Lookup option, not a separate lookup implementation. */
export function reverseLookup(number) {
  return request(`/rancard/reverse-lookup?number=${encodeURIComponent(number)}`);
}

export function ussd(sessionId, key, sender) {
  return request("/ussd", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, key, sender }),
  });
}
