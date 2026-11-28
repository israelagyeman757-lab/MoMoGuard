const STORAGE_KEY = "momoguard-innovate-reps-identity";

/** Demo-only pseudonymous identity for this browser, no real login.
 * Matches the project's existing convention of trusting a client-supplied
 * id (see CONTRACT.md's `reporter_id` handling) -- a known, documented
 * simplification for the hackathon build, not real authentication. Pass an
 * explicit `storage` for tests; defaults to `localStorage` in a browser. */
export function getOrCreateRepId(storage = defaultStorage()) {
  if (storage) {
    const existing = storage.getItem(STORAGE_KEY);
    if (existing) return existing;
  }
  const id = `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  if (storage) storage.setItem(STORAGE_KEY, id);
  return id;
}

function defaultStorage() {
  return typeof localStorage !== "undefined" ? localStorage : null;
}
