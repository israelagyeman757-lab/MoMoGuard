// Pure display-formatting helpers, kept separate from app.js so they can be
// unit tested without a DOM (same split as demo-control/contacts.js vs app.js).

export const TRICK_LABELS = {
  possible_fake_reversal: "Possible fake reversal",
  possible_impersonation: "Possible impersonation",
  possible_advance_fee: "Possible advance fee",
  other: "Other / suspected scam",
};

export const RISK_LABELS = {
  high: "High \u2014 several reports",
  single_source: "Single report",
  unreported: "No reports yet",
};

export const STATUS_LABELS = {
  pending: "Pending review",
  published: "Published",
  rejected: "Rejected",
};

export function trickLabel(trick) {
  return TRICK_LABELS[trick] || TRICK_LABELS.other;
}

export function riskLabel(risk) {
  return RISK_LABELS[risk] || risk;
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function formatTimestamp(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}
