import { controllerBase } from "../shared/controllerUrl.js";

const TOKEN_KEY = "momoguard_mod_token";

export function apiUrl(path) {
  const base = controllerBase().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(t) {
  sessionStorage.setItem(TOKEN_KEY, t || "");
}