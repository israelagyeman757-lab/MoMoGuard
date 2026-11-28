import * as controller from "./services/controllerAdapter.js";
import { getOrCreateRepId } from "./identity.js";
import { validateReportForm, buildReportPayload } from "./reportForm.js";
import { describeLookupResult, describeLookupFailure } from "./lookupDisplay.js";

const repId = getOrCreateRepId();

// --- Tab switching ----------------------------------------------------
const tabs = { actions: document.querySelector("#tab_actions"), profile: document.querySelector("#tab_profile") };
const navButtons = document.querySelectorAll(".bottom-nav button[data-tab]");

function showTab(name) {
  for (const [key, panel] of Object.entries(tabs)) panel.classList.toggle("is-active", key === name);
  for (const button of navButtons) button.classList.toggle("is-active", button.dataset.tab === name);
}
for (const button of navButtons) button.addEventListener("click", () => showTab(button.dataset.tab));

// --- Report a Scam form -------------------------------------------------
const reportForm = document.querySelector("#report_form");
const reportSubmit = document.querySelector("#report_submit");
const reportStatus = document.querySelector("#report_status");
const FIELDS = ["number", "community", "description"];

function clearFieldErrors() {
  for (const field of FIELDS) {
    document.querySelector(`#field_${field}`).classList.remove("has-error");
    document.querySelector(`#error_${field}`).textContent = "";
  }
}

function showFieldErrors(errors) {
  for (const [field, message] of Object.entries(errors)) {
    const fieldEl = document.querySelector(`#field_${field}`);
    const errorEl = document.querySelector(`#error_${field}`);
    if (!fieldEl || !errorEl) continue;
    fieldEl.classList.add("has-error");
    errorEl.textContent = message;
  }
}

function setReportStatus(text, tone) {
  reportStatus.textContent = text;
  reportStatus.className = `status-banner${text ? " is-visible" : ""}${tone ? ` is-${tone}` : ""}`;
}

reportForm.addEventListener("submit", async event => {
  event.preventDefault();
  clearFieldErrors();
  setReportStatus("", "");
  const values = {
    number: document.querySelector("#report_number").value,
    time: document.querySelector("#report_time").value,
    community: document.querySelector("#report_community").value,
    description: document.querySelector("#report_description").value,
  };
  const { valid, errors } = validateReportForm(values);
  if (!valid) {
    showFieldErrors(errors);
    return;
  }
  reportSubmit.disabled = true;
  setReportStatus("Sending report…", "warning");
  const payload = buildReportPayload(values, repId);
  const result = await controller.submitReport(payload);
  reportSubmit.disabled = false;
  if (!result.ok) {
    setReportStatus("Could not reach MoMoGuard. Please try again.", "danger");
    return;
  }
  if (result.data.accepted === false) {
    setReportStatus(result.data.message || "This number was already reported today.", "warning");
    return;
  }
  setReportStatus(result.data.message || "Thank you. This number has been noted as suspected.", "ok");
  reportForm.reset();
});

// --- Reverse Number Lookup ----------------------------------------------
const lookupInput = document.querySelector("#lookup_number");
const lookupButton = document.querySelector("#lookup_submit");
const lookupStatus = document.querySelector("#lookup_status");
const lookupResult = document.querySelector("#lookup_result");
const lookupHeading = document.querySelector("#lookup_heading");
const lookupMessage = document.querySelector("#lookup_message");
const lookupHistory = document.querySelector("#lookup_history");
const lookupSource = document.querySelector("#lookup_source");

function setLookupStatus(text, tone) {
  lookupStatus.textContent = text;
  lookupStatus.className = `status-banner${text ? " is-visible" : ""}${tone ? ` is-${tone}` : ""}`;
}

function renderLookup(described) {
  lookupResult.className = `lookup-result is-visible tone-${described.tone}`;
  lookupHeading.textContent = described.heading;
  lookupMessage.textContent = described.message;
  lookupHistory.innerHTML = described.history.map(item => `<li>${escapeHtml(item)}</li>`).join("");
  lookupSource.textContent = `source: ${described.source}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

async function runLookup() {
  const number = lookupInput.value.trim();
  if (!/^\+?\d{7,15}$/.test(number)) {
    setLookupStatus("Enter a valid phone number first.", "danger");
    lookupResult.className = "lookup-result";
    return;
  }
  setLookupStatus("Checking with Glance…", "warning");
  lookupButton.disabled = true;
  lookupResult.className = "lookup-result";
  const result = await controller.reverseLookup(number);
  lookupButton.disabled = false;
  if (!result.ok) {
    setLookupStatus("", "");
    renderLookup(describeLookupFailure());
    return;
  }
  setLookupStatus("", "");
  renderLookup(describeLookupResult(result.data));
}

lookupButton.addEventListener("click", runLookup);
lookupInput.addEventListener("keydown", event => { if (event.key === "Enter") runLookup(); });

// --- Profile (placeholder only) ------------------------------------------
document.querySelector("#logout_button").addEventListener("click", () => {
  // Placeholder only -- there is no real session to end yet.
  showTab("actions");
});
