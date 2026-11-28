/** Pure mapping from a /rancard/reverse-lookup response to display copy,
 * kept separate from DOM code so it's unit-testable without a browser. */

const NOT_PROOF =
  "This is a risk signal, not a confirmed fraud finding.";

const STATUS_COPY = {
  flagged: { heading: "Elevated Glance signal", tone: "danger" },
  watch: { heading: "Low Glance signal", tone: "warning" },
  clear: { heading: "No threat found", tone: "ok" },
  no_results: { heading: "No results", tone: "neutral" },
  error: { heading: "Could not check", tone: "warning" },
  invalid_number: { heading: "Could not check", tone: "warning" },
};

function detailHistory(result) {
  const lines = [];
  if (result.times_reported != null) {
    lines.push(`Times reported: ${result.times_reported}`);
  }
  if (result.risk_color) {
    lines.push(`Risk colour: ${result.risk_color}`);
  }
  if (result.glance_risk_level) {
    lines.push(`Risk level: ${result.glance_risk_level}`);
  }
  if (result.first_reported) {
    lines.push(`First reported: ${result.first_reported}`);
  }
  if (result.last_reported) {
    lines.push(`Last reported: ${result.last_reported}`);
  }
  if (result.risk_description) {
    lines.push(result.risk_description);
  }
  if (Array.isArray(result.history)) {
    for (const item of result.history) {
      if (item && !lines.includes(item)) lines.push(item);
    }
  }
  lines.push(NOT_PROOF);
  return lines;
}

export function describeLookupResult(result) {
  if (!result) {
    return { heading: "No results", tone: "neutral", message: "", history: [], source: "unknown" };
  }
  const copy = STATUS_COPY[result.status] || { heading: "No results", tone: "neutral" };
  return {
    heading: copy.heading,
    tone: copy.tone,
    message: result.message || "",
    history: detailHistory(result),
    source: result.source || "unknown",
    sandbox_msisdn: result.sandbox_msisdn,
  };
}

export function describeLookupFailure() {
  return {
    heading: "Could not check",
    tone: "warning",
    message: "Could not reach Glance. That is not proof this number is safe or unsafe.",
    history: [NOT_PROOF],
    source: "unavailable",
  };
}