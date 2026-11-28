const STATUS_KEYS = {
  WARNING_AVAILABLE: "check.status.WARNING_AVAILABLE",
  MULTIPLE_REPORTS: "check.status.MULTIPLE_REPORTS",
  UNDER_REVIEW: "check.status.UNDER_REVIEW",
  NO_REPORTS_FOUND: "check.status.NO_REPORTS_FOUND",
  REPORTS_FOUND: "check.status.REPORTS_FOUND",
  INVALID: "check.status.INVALID",
  ERROR: "check.status.ERROR",
};

const MESSAGE_KEYS = {
  WARNING_AVAILABLE: "check.message.WARNING_AVAILABLE",
  MULTIPLE_REPORTS: "check.message.MULTIPLE_REPORTS",
  UNDER_REVIEW: "check.message.UNDER_REVIEW",
  NO_REPORTS_FOUND: "check.message.NO_REPORTS_FOUND",
  REPORTS_FOUND: "check.message.REPORTS_FOUND",
  INVALID: "check.message.INVALID",
  ERROR: "check.message.ERROR",
};

/** Plain-language check screen copy; never show raw API enums. */
export function checkResultLines(result, t) {
  const code = result?.result || "ERROR";
  const statusLabel = t(STATUS_KEYS[code] || "check.status.ERROR");
  const message = t(MESSAGE_KEYS[code] || "check.message.ERROR");
  const count = result?.reports_count;
  const countLine =
    typeof count === "number" && count > 0 ? t("check.reportsCount", { count }) : "";
  const noReports = count === 0 || code === "NO_REPORTS_FOUND" || code === "INVALID";
  const disclaimer = noReports ? t("check.disclaimer.none") : t("check.disclaimer.found");
  return { statusLabel, message, countLine, disclaimer };
}