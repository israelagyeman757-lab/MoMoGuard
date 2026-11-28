/** Pure validation + payload-building for the Report-a-Scam form, kept
 * separate from DOM code so it's unit-testable without a browser. */

const NUMBER_PATTERN = /^\+?\d{7,15}$/;

export function validateReportForm({ number, community, description } = {}) {
  const errors = {};
  if (!number || !NUMBER_PATTERN.test(number.trim())) {
    errors.number = "Enter a valid phone number (digits only, 7-15 of them).";
  }
  if (!community || !community.trim()) {
    errors.community = "Enter your community.";
  }
  if (!description || !description.trim()) {
    errors.description = "Describe what happened.";
  }
  // `time` is optional -- not every report has a known exact time.
  return { valid: Object.keys(errors).length === 0, errors };
}

/** trick is fixed to "community_reported" -- this form has no category
 * picker (unlike the original USSD "Report a Scam" flow's 3-option menu),
 * per the brief's simpler field set (phone number, time, community,
 * description). The free-text description carries the detail instead. */
export function buildReportPayload({ number, time, community, description } = {}, reporterId) {
  return {
    number: number.trim(),
    trick: "community_reported",
    reporter_id: reporterId,
    description: (description || "").trim(),
    community: (community || "").trim(),
    incident_time: (time || "").trim(),
  };
}
