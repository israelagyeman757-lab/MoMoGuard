/** Centralized phone-page copy (PRD §10). English default; Twi needs native review. */

const catalogs = { en: null, tw: null };
let activeLocale = "en";

export async function loadLocale(locale) {
  activeLocale = locale === "tw" ? "tw" : "en";
  if (!catalogs[activeLocale]) {
    const response = await fetch(`./i18n/${activeLocale}.json`);
    if (!response.ok) throw new Error(`locale ${activeLocale} unavailable`);
    catalogs[activeLocale] = await response.json();
  }
  return catalogs[activeLocale];
}

export function t(key, fallback = "") {
  const en = catalogs.en || {};
  const locale = catalogs[activeLocale] || {};
  const value = (locale[key] || en[key] || fallback || key).trim();
  return value || en[key] || fallback || key;
}

export function currentLocale() {
  return activeLocale;
}