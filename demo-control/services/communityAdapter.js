import { CONFIG } from "../config.js";

export async function fetchCommunityIntelligence(number) {
  if (!number) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.CONTROLLER_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${CONFIG.CONTROLLER_URL}/community/intelligence?number=${encodeURIComponent(number)}`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}