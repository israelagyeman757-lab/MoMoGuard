/** Pure mapping from a /rancard/reverse-lookup response to display copy,
 * kept separate from DOM code so it's unit-testable without a browser. */

const STATUS_COPY = {
  flagged: { heading: "Flagged by Glance", tone: "danger" },
  clear: { heading: "No threat found", tone: "ok" },
  no_results: { heading: "No results", tone: "neutral" },
  error: { heading: "Could not check", tone: "warning" },
};

export function describeLookupResult(result) {
  if (!result) {
    return { heading: "No results", tone: "neutral", message: "", history: [], source: "unknown" };
  }
  const copy = STATUS_COPY[result.status] || { heading: "No results", tone: "neutral" };
  return {
    heading: copy.heading,
    tone: copy.tone,
    message: result.message || "",
    history: Array.isArray(result.history) ? result.history : [],
    source: result.source || "unknown",
  };
}

export function describeLookupFailure() {
  return {
    heading: "Could not check",
    tone: "warning",
    message: "Could not reach Glance. That is not proof this number is safe or unsafe.",
    history: [],
    source: "unavailable",
  };
}
