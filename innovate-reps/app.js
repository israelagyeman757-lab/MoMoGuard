import { CONFIG } from "./config.js";
import { SmartphoneShell, DOCK_APPS } from "./smartphoneShell.js";
import { SmartphoneFlow } from "./smartphoneFlow.js";
import { createDemoBridge } from "./services/demoBridge.js";
import * as controller from "./services/controllerAdapter.js";
import { getOrCreateRepId } from "./identity.js";
import { validateReportForm, buildReportPayload } from "./reportForm.js";
import { describeLookupResult, describeLookupFailure } from "./lookupDisplay.js";
import { loadLocale, t as translate } from "../phone-page/i18n/i18n.js";

const shell = new SmartphoneShell();
const flow = new SmartphoneFlow();
const repId = getOrCreateRepId();

const layers = {
  home: document.querySelector("#shell_home"),
  phone: document.querySelector("#shell_phone"),
  messages: document.querySelector("#shell_messages"),
  innovateReps: document.querySelector("#shell_innovate_reps"),
};
const statusTime = document.querySelector("#status_time");
const homeButton = document.querySelector("#home_button");
const demoToast = document.querySelector("#demo_toast");

let translations = {};
let toastTimer = null;

function t(key, fallback = "") {
  return translate(key, translations[key] || fallback);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function dockIcon(kind) {
  if (kind === "phone") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 3.8 9 7.5 6.8 10c1.3 2.8 3.4 4.9 6.2 6.2l2.5-2.2 3.7 3.8-.8 3c-.2.8-1 1.3-1.8 1.2C9.4 21.1 2.9 14.6 2 6.4c-.1-.8.4-1.6 1.2-1.8l2-.8Z"/></svg>';
  }
  if (kind === "messages") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v13H9l-5 4v-4H3V4Z"/><path d="M7 8h10M7 12h7"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V7l-8-4Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
}

function renderHome() {
  layers.home.hidden = false;
  layers.phone.hidden = true;
  layers.messages.hidden = true;
  layers.innovateReps.hidden = true;
  layers.home.innerHTML = `
    <div class="home-wallpaper" aria-hidden="true"></div>
    <div class="home-clock">${escapeHtml(statusTime.textContent)}</div>
    <nav class="home-dock" aria-label="Dock">
      ${DOCK_APPS.map(app => `
        <button type="button" class="dock-icon" data-open-app="${app.id}" aria-label="${escapeHtml(app.label)}">
          <span class="dock-glyph">${dockIcon(app.icon)}</span>
          <span class="dock-label">${escapeHtml(app.label)}</span>
        </button>`).join("")}
    </nav>`;
  for (const button of layers.home.querySelectorAll("[data-open-app]")) {
    button.addEventListener("click", () => {
      shell.openApp(button.dataset.openApp);
      render();
    });
  }
}

function renderPhoneApp() {
  layers.home.hidden = true;
  layers.phone.hidden = false;
  layers.messages.hidden = true;
  layers.innovateReps.hidden = true;

  if (flow.callUi === "ringing" && flow.incomingCallContact) {
    const c = flow.incomingCallContact;
    layers.phone.innerHTML = `
      <div class="call-screen incoming">
        <p class="call-label">${escapeHtml(t("incomingCall", "Incoming call"))}</p>
        <h2 class="call-name">${escapeHtml(c.name)}</h2>
        <p class="call-number">${escapeHtml(c.number || "")}</p>
        <p class="call-trust">${escapeHtml(c.trust)}</p>
        <div class="call-actions">
          <button type="button" class="call-decline" id="decline_call">Decline</button>
          <button type="button" class="call-answer" id="answer_call">Answer</button>
        </div>
      </div>`;
    layers.phone.querySelector("#decline_call").addEventListener("click", () => {
      flow.declineCall();
      render();
    });
    layers.phone.querySelector("#answer_call").addEventListener("click", () => {
      if (!flow.answerSimulatedCall()) return;
      render();
      runSimulatedCallFlow();
    });
    return;
  }

  if (flow.callUi === "server" || flow.callUi === "error") {
    layers.phone.innerHTML = `
      <header class="app-topbar"><button type="button" class="app-back" data-go-home>Home</button><span>Phone</span></header>
      <div class="server-panel ${flow.callUi === "error" ? "is-error" : ""}">
        <p>${escapeHtml(flow.serverText)}</p>
        <button type="button" class="ghost-button" id="end_call_ui">Done</button>
      </div>`;
    layers.phone.querySelector("[data-go-home]")?.addEventListener("click", () => goHome());
    layers.phone.querySelector("#end_call_ui")?.addEventListener("click", () => {
      flow.declineCall();
      render();
    });
    return;
  }

  if (flow.callUi === "active") {
    layers.phone.innerHTML = `
      <header class="app-topbar"><span>Call in progress</span></header>
      <div class="call-screen active"><p>Connecting via MoMoGuard USSD…</p></div>`;
    return;
  }

  const tab = flow.phoneTab;
  layers.phone.innerHTML = `
    <header class="app-topbar">
      <button type="button" class="app-back" data-go-home aria-label="Home">⌂</button>
      <span>Phone</span>
    </header>
    <h2 class="visually-hidden">Phone</h2>
    <div class="phone-tabs" role="tablist">
      <button type="button" class="phone-tab ${tab === "dialer" ? "is-active" : ""}" data-tab="dialer">Keypad</button>
      <button type="button" class="phone-tab ${tab === "recents" ? "is-active" : ""}" data-tab="recents">Recents</button>
    </div>
    ${tab === "dialer" ? renderDialer() : renderRecents()}`;

  layers.phone.querySelector("[data-go-home]")?.addEventListener("click", () => goHome());
  for (const button of layers.phone.querySelectorAll(".phone-tab")) {
    button.addEventListener("click", () => {
      flow.phoneTab = button.dataset.tab;
      render();
    });
  }
  bindDialer();
}

function renderDialer() {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  return `
    <div class="dial-display">${escapeHtml(flow.dialEntry) || " "}</div>
    <div class="dial-pad">
      ${keys.map(key => `<button type="button" class="dial-key" data-digit="${key}">${escapeHtml(key)}</button>`).join("")}
    </div>
    <div class="dial-actions">
      <button type="button" class="dial-clear" id="dial_clear">Clear</button>
      <button type="button" class="dial-call" id="dial_call">Call</button>
    </div>`;
}

function bindDialer() {
  const pad = layers.phone.querySelector(".dial-pad");
  if (!pad) return;
  for (const button of pad.querySelectorAll(".dial-key")) {
    button.addEventListener("click", () => {
      flow.dialDigit(button.dataset.digit);
      render();
    });
  }
  layers.phone.querySelector("#dial_clear")?.addEventListener("click", () => {
    flow.clearDial();
    render();
  });
  layers.phone.querySelector("#dial_call")?.addEventListener("click", () => {
    flow.placeCall();
    flow.phoneTab = "recents";
    render();
  });
}

function renderRecents() {
  if (!flow.recents.length) {
    return `<p class="empty-inbox">No recent calls yet.</p>`;
  }
  return `<ul class="recents-list">${flow.recents.map(item => `
    <li><span class="recents-number">${escapeHtml(item.number)}</span>
    <span class="recents-meta">${escapeHtml(item.time)} · ${escapeHtml(item.direction)}</span></li>`).join("")}</ul>`;
}

function renderMessagesApp() {
  layers.home.hidden = true;
  layers.phone.hidden = true;
  layers.messages.hidden = false;
  layers.innovateReps.hidden = true;

  if (flow.messageScreen === "thread") {
    const message = flow.messages[flow.selectedMessage];
    layers.messages.innerHTML = `
      <header class="app-topbar">
        <button type="button" class="app-back" id="back_inbox">Back</button>
        <span>Messages</span>
      </header>
      <div class="thread-card">
        <div class="thread-from">${escapeHtml(message?.sender || "UNKNOWN")}</div>
        <p>${escapeHtml(message?.text || "")}</p>
        <span class="thread-source">source: simulated</span>
      </div>`;
    layers.messages.querySelector("#back_inbox").addEventListener("click", () => {
      flow.closeMessageThread();
      render();
    });
    return;
  }

  layers.messages.innerHTML = `
    <header class="app-topbar">
      <button type="button" class="app-back" data-go-home>Home</button>
      <span>Messages</span>
    </header>
    <ul class="msg-inbox">
      ${flow.messages.length
        ? flow.messages.map((message, index) => `
          <li>
            <button type="button" class="msg-row" data-msg-index="${index}">
              <span class="msg-sender">${escapeHtml(message.sender)}</span>
              <span class="msg-preview">${escapeHtml(message.preview)}</span>
            </button>
          </li>`).join("")
        : `<li class="empty-inbox">No messages yet — use demo-control to simulate SMS.</li>`}
    </ul>`;
  layers.messages.querySelector("[data-go-home]")?.addEventListener("click", () => goHome());
  for (const button of layers.messages.querySelectorAll(".msg-row")) {
    button.addEventListener("click", () => {
      flow.openMessage(Number(button.dataset.msgIndex));
      render();
    });
  }
}

function renderInnovateRepsApp() {
  layers.home.hidden = true;
  layers.phone.hidden = true;
  layers.messages.hidden = true;
  layers.innovateReps.hidden = false;
}

function goHome() {
  shell.goHome();
  render();
}

function render() {
  if (shell.isHome()) {
    renderHome();
    return;
  }
  if (shell.activeApp === "phone") renderPhoneApp();
  else if (shell.activeApp === "messages") renderMessagesApp();
  else if (shell.activeApp === "innovateReps") renderInnovateRepsApp();
}

async function runSimulatedCallFlow() {
  if (CONFIG.MODE !== "controller") {
    flow.applyServerScreen({ text: "Controller mode required for live calls.", state: "result", done: true });
    render();
    return;
  }
  const contact = flow.autoCallContact;
  if (!contact) return;
  const steps = ["", "1", contact.number, String(contact.amount)];
  let result = null;
  for (const key of steps) {
    result = await controller.ussd(flow.sessionId, key, flow.sender);
    if (flow.loadingKind !== "autoCall") return;
    if (!result.ok) break;
  }
  flow.autoCallContact = null;
  if (!result?.ok) {
    flow.applyServerError(result?.error === "timeout"
      ? "MoMoGuard took too long to answer."
      : "Could not reach MoMoGuard.");
  } else {
    flow.applyServerScreen(result.data);
  }
  render();
}

function showToast(text) {
  if (!demoToast) return;
  demoToast.textContent = text;
  demoToast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => demoToast.classList.remove("is-visible"), 4200);
}

// --- Innovate Reps form logic (unchanged behaviour) ---------------------
const tabs = { actions: document.querySelector("#tab_actions"), profile: document.querySelector("#tab_profile") };
const navButtons = document.querySelectorAll(".bottom-nav button[data-tab]");

function showTab(name) {
  for (const [key, panel] of Object.entries(tabs)) panel.classList.toggle("is-active", key === name);
  for (const button of navButtons) button.classList.toggle("is-active", button.dataset.tab === name);
}
for (const button of navButtons) button.addEventListener("click", () => showTab(button.dataset.tab));

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
    document.querySelector(`#field_${field}`)?.classList.add("has-error");
    const errorEl = document.querySelector(`#error_${field}`);
    if (errorEl) errorEl.textContent = message;
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

document.querySelector("#profile_rep_id").textContent = repId.slice(0, 12) + "…";
document.querySelector("#logout_button").addEventListener("click", () => showTab("actions"));

homeButton.addEventListener("click", () => goHome());

const demoBridge = createDemoBridge();
demoBridge.onMessage(event => {
  if (!event || typeof event !== "object") return;
  if (event.type === "incoming-sms") {
    const message = flow.receiveSimulatedSms(event);
    showToast(`New message from ${message.sender} (simulated)`);
    demoBridge.postMessage({ type: "ack", requestId: event.requestId, status: "delivered" });
    if (shell.activeApp === "messages") render();
    return;
  }
  if (event.type === "incoming-call") {
    if (CONFIG.MODE !== "controller") {
      showToast("Simulated calls need controller mode.");
      demoBridge.postMessage({ type: "ack", requestId: event.requestId, status: "rejected", reason: "mock_mode" });
      return;
    }
    const accepted = flow.receiveSimulatedCall(event);
    if (!accepted) {
      showToast("Phone busy — return home or end the current call, then try again.");
      demoBridge.postMessage({ type: "ack", requestId: event.requestId, status: "busy" });
      return;
    }
    shell.openApp("phone");
    render();
    demoBridge.postMessage({ type: "ack", requestId: event.requestId, status: "ringing" });
  }
});

function updateTime() {
  statusTime.textContent = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
}

loadLocale("en").then(catalog => { translations = { ...catalog }; }).catch(() => {});
updateTime();
setInterval(updateTime, 30000);
render();