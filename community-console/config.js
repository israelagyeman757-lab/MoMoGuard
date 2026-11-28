import { resolveControllerUrl } from "../shared/controllerUrl.js";

const TOKEN_KEY = "momoguard_mod_token";

function baseUrl() {
  if (typeof location !== "undefined") {
    const override = new URLSearchParams(location.search).get("api");
    if (override) return override.replace(/\/$/, "");
  }
  return resolveControllerUrl().replace(/\/$/, "");
}

export function apiUrl(path) {
  const base = baseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(t) {
  sessionStorage.setItem(TOKEN_KEY, t || "");
}