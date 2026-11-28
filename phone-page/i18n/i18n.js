const catalogues = { en: {}, tw: {} };
let active = "en";

export async function initI18n() {
  const stored = localStorage.getItem("walo.locale");
  active = stored === "tw" ? "tw" : "en";
  const [en, tw] = await Promise.all([
    fetch("./i18n/en.json").then(response => response.ok ? response.json() : {}).catch(() => ({})),
    fetch("./i18n/tw.json").then(response => response.ok ? response.json() : {}).catch(() => ({})),
  ]);
  catalogues.en = en;
  catalogues.tw = tw;
}

export function setLocale(locale) {
  active = locale === "tw" ? "tw" : "en";
  localStorage.setItem("walo.locale", active);
}

export function getLocale() {
  return active;
}

export function t(key, params) {
  const value = catalogues[active]?.[key] ?? catalogues.en?.[key] ?? key;
  if (!params) return value;
  return String(value).replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? "").toString());
}