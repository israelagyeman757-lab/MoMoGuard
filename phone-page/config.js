const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");

function resolveApiBase() {
  const override = params.get("api");
  if (override) return override.replace(/\/$/, "");
  if (typeof location === "undefined") return "http://127.0.0.1:8000";
  const { hostname, protocol } = location;
  if (protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://127.0.0.1:8000";
  }
  return "/api";
}

function resolveMode() {
  const override = params.get("mode");
  if (override === "controller" || override === "mock") return override;
  return "controller";
}

export const CONFIG = {
  MODE: resolveMode(),
  API_BASE: resolveApiBase(),
  CONTROLLER_TIMEOUT_MS: 5000,
  BOOT_MS: 1500,
  STK_POLL_MS: 10000,
  KEY_FLASH_MS: 45,
  T9_TAP_MS: 800,
  LONG_ZERO_MS: 600,
  USER_ID: "phone-user-1",
  /** Simulated MoMo wallet for this feature phone (payee in hold demo). */
  WALLET_MSISDN: "0244111222",
  DEMO_NEW_PAYEE: "0245000111",
  DEMO_FLAGGED_PAYEE: "0244123456",
};