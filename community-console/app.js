import { createReport, listReports, updateReportStatus, checkNumber, listWarnings } from "./adapter.js";
import { trickLabel, riskLabel, statusLabel, formatTimestamp, escapeHtml } from "./format.js";

const statusLine = document.querySelector("#status_line");
const reportForm = document.querySelector("#report_form");
const reportsList = document.querySelector("#reports_list");
const warningsList = document.querySelector("#warnings_list");
const filterStatus = document.querySelector("#filter_status");
const refreshButton = document.querySelector("#refresh_reports");
const lookupNumber = document.querySelector("#lookup_number");
const lookupButton = document.querySelector("#lookup_button");
const lookupResult = document.querySelector("#lookup_result");

function setStatus(text, isError = false) {
  statusLine.textContent = text;
  statusLine.classList.toggle("is-unavailable", isError);
}

function reportRow(report) {
  const canModerate = report.status === "pending";
  return `<li class="report-card status-${report.status}" data-id="${report.id}">
    <div class="report-head">
      <strong>${escapeHtml(report.number)}</strong>
      <span class="status-badge status-badge-${report.status}">${statusLabel(report.status)}</span>
    </div>
    <div class="report-meta">${trickLabel(report.trick)} · reported ${formatTimestamp(report.ts)}</div>
    ${report.detail ? `<p class="report-detail">${escapeHtml(report.detail)}</p>` : ""}
    ${canModerate ? `
    <div class="report-actions">
      <button type="button" data-action="publish" data-id="${report.id}" class="primary-button small">Publish as warning</button>
      <button type="button" data-action="reject" data-id="${report.id}" class="ghost-button small">Reject</button>
    </div>` : ""}
  </li>`;
}

function warningRow(warning) {
  return `<li class="warning-card">
    <div class="report-head">
      <strong>${escapeHtml(warning.number)}</strong>
      <span class="status-badge status-badge-published">${trickLabel(warning.trick)}</span>
    </div>
    <p class="report-detail">${escapeHtml(warning.message)}</p>
    <div class="report-meta">Published ${formatTimestamp(warning.published_ts)}</div>
  </li>`;
}

async function loadReports() {
  const status = filterStatus.value || undefined;
  const result = await listReports(status);
  if (!result.ok) {
    reportsList.innerHTML = `<li class="empty-state">Could not load reports (${result.error}).</li>`;
    return;
  }
  const reports = result.data.reports;
  reportsList.innerHTML = reports.length
    ? reports.map(reportRow).join("")
    : `<li class="empty-state">No reports in this view yet.</li>`;
}

async function loadWarnings() {
  const result = await listWarnings();
  if (!result.ok) {
    warningsList.innerHTML = `<li class="empty-state">Could not load warnings (${result.error}).</li>`;
    return;
  }
  const warnings = result.data.warnings;
  warningsList.innerHTML = warnings.length
    ? warnings.map(warningRow).join("")
    : `<li class="empty-state">No warnings published yet.</li>`;
}

async function refreshAll() {
  await Promise.all([loadReports(), loadWarnings()]);
}

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const number = document.querySelector("#report_number").value.trim();
  const trick = document.querySelector("#report_trick").value;
  const reporterId = document.querySelector("#report_reporter").value.trim();
  const detail = document.querySelector("#report_detail").value.trim();
  if (!number || !reporterId) return;

  const result = await createReport({ number, trick, detail: detail || undefined, reporterId });
  if (!result.ok) {
    setStatus(`Could not submit report (${result.error}).`, true);
    return;
  }
  if (!result.data.accepted) {
    setStatus(result.data.message, true);
    return;
  }
  setStatus(result.data.message);
  document.querySelector("#report_detail").value = "";
  await loadReports();
});

reportsList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  const status = action === "publish" ? "published" : "rejected";
  const result = await updateReportStatus(id, status);
  if (!result.ok) {
    setStatus(`Could not update report #${id} (${result.error}).`, true);
    return;
  }
  setStatus(status === "published"
    ? `Report #${id} published as a warning.`
    : `Report #${id} rejected.`);
  await refreshAll();
});

refreshButton.addEventListener("click", loadReports);
filterStatus.addEventListener("change", loadReports);

lookupButton.addEventListener("click", async () => {
  const number = lookupNumber.value.trim();
  if (!number) return;
  lookupResult.textContent = "Checking…";
  const result = await checkNumber(number);
  if (!result.ok) {
    lookupResult.textContent = `Could not check this number (${result.error}).`;
    return;
  }
  const info = result.data;
  const warningLines = info.warnings.length
    ? info.warnings.map((w) => `• ${escapeHtml(w.message)}`).join("<br>")
    : "No published warnings for this number.";
  lookupResult.innerHTML = `
    <div class="lookup-risk risk-${info.risk}">${riskLabel(info.risk)} · ${info.report_count} report(s)</div>
    <p>${escapeHtml(info.message)}</p>
    <div class="lookup-warnings">${warningLines}</div>`;
});

setStatus("Connected. Submit a report below, then publish it to see it show up everywhere.");
refreshAll();
