import { CONFIG } from "./config.js";
import { SmartphoneShell, DOCK_APPS } from "./smartphoneShell.js";
import { SmartphoneFlow } from "./smartphoneFlow.js";
import { WaloNav, WALO_LAUNCH_MS } from "./waloNav.js";
import { handleSystemNav } from "./systemNav.js";
import { MOCK_THREAD_EXTRA } from "./mockMessages.js";
import { createDemoBridge } from "./services/demoBridge.js";
import * as controller from "./services/controllerAdapter.js";
import { getOrCreateRepId } from "./identity.js";
import { validateReportForm, buildReportPayload } from "./reportForm.js";
import { describeLookupResult, describeLookupFailure } from "./lookupDisplay.js";
import { loadLocale, t as translate } from "../phone-page/i18n/i18n.js";

const shell = new SmartphoneShell();
const flow = new SmartphoneFlow();
const waloNav = new WaloNav();
const repId = getOrCreateRepId();

const layers = {
  home: document.querySelector("#shell_home"),
  phone: document.querySelector("#shell_phone"),
  messages: document.querySelector("#shell_messages"),
  walo: document.querySelector("#shell_walo"),
};
const statusTime = document.querySelector("#status_time");
const demoToast = document.querySelector("#demo_toast");

const DEFAULT_COMMUNITY = "Kumasi · Zone 3";
const REPORT_REASONS = [
  "Asked for my PIN",
  "Fake prize / lottery",
  "Impersonating MTN / bank",
  "Wrong-number refund scam",
  "Other",
];
const DEFAULT_RECENTS = [
  { name: "Ama Mensah", number: "024 555 0192", direction: "incoming", time: "09:21", initials: "AM" },
  { name: "Kofi Mensah", number: "024 312 8870", direction: "missed", time: "08:54", initials: "KM" },
  { name: "Unknown", number: "020 000 0000", direction: "missed", time: "18:42", initials: "?" },
];

let translations = {};
let toastTimer = null;
let lookupLastRaw = null;

function t(key, fallback = "") {
  return translate(key, translations[key] || fallback);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || "?").toUpperCase();
}

function dockSvg(kind) {
  if (kind === "phone") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 3.8 9 7.5 6.8 10c1.3 2.8 3.4 4.9 6.2 6.2l2.5-2.2 3.7 3.8-.8 3c-.2.8-1 1.3-1.8 1.2C9.4 21.1 2.9 14.6 2 6.4c-.1-.8.4-1.6 1.2-1.8l2-.8Z"/></svg>';
  }
  if (kind === "messages") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18v13H9l-5 4v-4H3V4Z"/><path d="M7 8.5h10M7 12h7"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 20 5v6c0 5-3.2 8.6-8 10-4.8-1.4-8-5-8-10V5l8-3Z"/><path d="m8.6 11.6 2.3 2.3 4.4-4.8"/></svg>';
}

function systemTabbarHtml() {
  return `
    <nav class="system-tabbar" aria-label="System navigation">
      <button type="button" class="system-tab" data-sysnav="back" aria-disabled="true">
        <svg width="19" height="19" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        Back
      </button>
      <button type="button" class="system-tab home" data-sysnav="home">
        <span class="home-tile"><svg width="15" height="15" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8Z"/></svg></span>
        Home
      </button>
      <button type="button" class="system-tab" data-sysnav="recents" aria-disabled="true">
        <svg width="19" height="19" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5.5 15.5v-9a2 2 0 0 1 2-2h9"/></svg>
        Recent apps
      </button>
    </nav>`;
}

function bindSystemTabbar(root) {
  for (const button of root.querySelectorAll("[data-sysnav]")) {
    button.addEventListener("click", () => {
      handleSystemNav(button.dataset.sysnav, { onHome: goHome });
    });
  }
}

function goHome() {
  waloNav.close();
  shell.goHome();
  render();
}

function showLayer(name) {
  for (const [key, layer] of Object.entries(layers)) {
    layer.hidden = key !== name;
  }
}

function render() {
  if (shell.isHome()) {
    renderHome();
    return;
  }
  if (shell.activeApp === "phone") renderPhone();
  else if (shell.activeApp === "messages") renderMessages();
  else if (shell.activeApp === "walo") renderWalo();
}

function renderHome() {
  showLayer("home");
  const launchingWalo = shell.activeApp === "walo" || waloNav.isLaunching() || waloNav.isOpen();
  layers.home.innerHTML = `
    <span class="home-blob a" aria-hidden="true"></span>
    <span class="home-blob b" aria-hidden="true"></span>
    <div class="home-clock">${escapeHtml(statusTime.textContent)}</div>
    <p class="rep-line"><span aria-hidden="true"></span>Community rep · Zone 3</p>
    <nav class="home-dock" aria-label="Dock">
      ${DOCK_APPS.map(app => `
        <button type="button" class="dock-icon${app.id === "walo" && launchingWalo ? " launching" : ""}" data-open-app="${app.id}">
          <span class="dock-tile${app.id === "walo" ? " solid" : ""}">${dockSvg(app.icon)}</span>
          <small>${escapeHtml(app.label)}</small>
        </button>`).join("")}
    </nav>`;
  for (const button of layers.home.querySelectorAll("[data-open-app]")) {
    button.addEventListener("click", () => openDockApp(button.dataset.openApp));
  }
}

function openDockApp(appId) {
  if (appId === "walo") {
    shell.openApp("walo");
    const token = waloNav.openFromDock();
    render();
    setTimeout(() => {
      if (waloNav.finishLaunch(token)) render();
    }, WALO_LAUNCH_MS);
    return;
  }
  waloNav.close();
  shell.openApp(appId);
  render();
}

function ensureRecentsSeeded() {
  if (!flow.recents.length) flow.recents = DEFAULT_RECENTS.map(r => ({ ...r }));
}

function renderPhone() {
  showLayer("phone");

  if (flow.callUi === "ringing" && flow.incomingCallContact) {
    const c = flow.incomingCallContact;
    layers.phone.innerHTML = `
      <div class="call-screen incoming">
        <p>${escapeHtml(t("incomingCall", "Incoming call"))}</p>
        <h2>${escapeHtml(c.name)}</h2>
        <p>${escapeHtml(c.number || "")}</p>
        <p class="tiny-note">${escapeHtml(c.trust)}</p>
        <div class="call-actions">
          <button type="button" class="call-decline" id="decline_call">Decline</button>
          <button type="button" class="call-answer" id="answer_call">Answer</button>
        </div>
      </div>
      ${systemTabbarHtml()}`;
    bindSystemTabbar(layers.phone);
    layers.phone.querySelector("#decline_call").addEventListener("click", () => { flow.declineCall(); render(); });
    layers.phone.querySelector("#answer_call").addEventListener("click", () => {
      if (!flow.answerSimulatedCall()) return;
      render();
      runSimulatedCallFlow();
    });
    return;
  }

  if (flow.callUi === "server" || flow.callUi === "error") {
    layers.phone.innerHTML = `
      <header class="app-header"><span>Phone</span></header>
      <div class="app-body"><p>${escapeHtml(flow.serverText)}</p>
        <button type="button" class="btn-ghost" id="end_call_ui">Done</button></div>
      ${systemTabbarHtml()}`;
    bindSystemTabbar(layers.phone);
    layers.phone.querySelector("#end_call_ui").addEventListener("click", () => { flow.declineCall(); render(); });
    return;
  }

  if (flow.callUi === "active") {
    layers.phone.innerHTML = `
      <header class="app-header"><span>Call in progress</span></header>
      <div class="app-body call-screen"><p>Connecting via MoMoGuard USSD…</p></div>
      ${systemTabbarHtml()}`;
    bindSystemTabbar(layers.phone);
    return;
  }

  ensureRecentsSeeded();
  const tab = flow.phoneTab;
  layers.phone.innerHTML = `
    <header class="app-header">Phone</header>
    <div class="app-body">
      <div class="phone-tabs-inline" role="tablist">
        <button type="button" class="phone-tab-btn ${tab === "recents" ? "is-active" : ""}" data-tab="recents">Recent calls</button>
        <button type="button" class="phone-tab-btn ${tab === "dialer" ? "is-active" : ""}" data-tab="dialer">Dialer</button>
      </div>
      ${tab === "recents" ? renderRecentsBlock() : renderDialerBlock()}
    </div>
    ${systemTabbarHtml()}`;
  bindSystemTabbar(layers.phone);
  for (const button of layers.phone.querySelectorAll(".phone-tab-btn")) {
    button.addEventListener("click", () => { flow.phoneTab = button.dataset.tab; render(); });
  }
  bindDialer();
}

function renderRecentsBlock() {
  return `
    <div class="section-lbl">Recent calls</div>
    ${flow.recents.map(item => `
      <div class="recent-row">
        <span class="r-avatar">${escapeHtml(item.initials || initials(item.name))}</span>
        <div class="r-meta">
          <div class="r-name">${escapeHtml(item.name)}</div>
          <div class="r-num">${escapeHtml(item.number)} · ${escapeHtml(item.direction)}</div>
        </div>
        <div class="r-time"><b>${escapeHtml(item.time)}</b>Today</div>
      </div>`).join("")}`;
}

function renderDialerBlock() {
  const keys = [
    ["1", ""], ["2", "ABC"], ["3", "DEF"],
    ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
    ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
    ["*", ""], ["0", "+"], ["#", ""],
  ];
  const display = flow.dialEntry.trim();
  return `
    <div class="section-lbl">Dialer</div>
    <div class="dial-display${display ? "" : " empty"}">${escapeHtml(display || "Enter a number")}</div>
    <div class="keypad">
      ${keys.map(([digit, sub]) => `<button type="button" class="key" data-digit="${digit}"><b>${digit}</b>${sub ? `<span>${sub}</span>` : ""}</button>`).join("")}
    </div>
    <div class="call-row">
      <button type="button" class="call-btn" id="dial_call" aria-label="Call">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 3.8 9 7.5 6.8 10c1.3 2.8 3.4 4.9 6.2 6.2l2.5-2.2 3.7 3.8-.8 3c-.2.8-1 1.3-1.8 1.2C9.4 21.1 2.9 14.6 2 6.4c-.1-.8.4-1.6 1.2-1.8l2-.8Z"/></svg>
      </button>
    </div>
    <p class="tiny-note">Tap keys to dial · live calls need demo-control</p>`;
}

function bindDialer() {
  for (const button of layers.phone.querySelectorAll(".key")) {
    button.addEventListener("click", () => { flow.dialDigit(button.dataset.digit); render(); });
  }
  layers.phone.querySelector("#dial_call")?.addEventListener("click", () => {
    if (flow.placeCall()) {
      flow.phoneTab = "recents";
      render();
    }
  });
}

function renderMessages() {
  showLayer("messages");

  if (flow.messageScreen === "thread") {
    const message = flow.messages[flow.selectedMessage];
    const extras = MOCK_THREAD_EXTRA[message?.id] || [];
    layers.messages.innerHTML = `
      <header class="app-header">
        <button type="button" class="header-back" id="back_inbox" aria-label="Back to inbox">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span class="header-sub">${escapeHtml(message?.sender || "Thread")}<small>${escapeHtml(message?.number || message?.sender || "")}</small></span>
      </header>
      <div class="app-body">
        <div class="thread-meta">Today · ${escapeHtml(message?.time || "")}</div>
        ${extras.map(text => `<div class="bubble"><div class="who">${escapeHtml((message?.sender || "Contact").split(" ")[0])}</div>${escapeHtml(text)}</div>`).join("")}
        <div class="bubble"><div class="who">${escapeHtml((message?.sender || "Contact").split(" ")[0])}</div>${escapeHtml(message?.text || "")}</div>
        <div class="bubble rep"><div class="who">You · Rep</div>${escapeHtml(MOCK_THREAD_EXTRA["mock-1-rep-reply"])}</div>
      </div>
      ${systemTabbarHtml()}`;
    bindSystemTabbar(layers.messages);
    layers.messages.querySelector("#back_inbox").addEventListener("click", () => { flow.closeMessageThread(); render(); });
    return;
  }

  layers.messages.innerHTML = `
    <header class="app-header">Messages</header>
    <div class="app-body">
      ${flow.messages.map((message, index) => `
        <button type="button" class="msg-row" data-msg-index="${index}">
          <div class="msg-top"><span class="msg-from">${escapeHtml(message.sender)}</span><span class="msg-time">${escapeHtml(message.time)}</span></div>
          <div class="msg-num">${escapeHtml(message.number || message.sender)}</div>
          <div class="msg-text">${escapeHtml(message.text)}</div>
        </button>`).join("")}
    </div>
    ${systemTabbarHtml()}`;
  bindSystemTabbar(layers.messages);
  for (const button of layers.messages.querySelectorAll(".msg-row")) {
    button.addEventListener("click", () => { flow.openMessage(Number(button.dataset.msgIndex)); render(); });
  }
}

function renderWalo() {
  if (waloNav.isLaunching()) {
    showLayer("walo");
    layers.walo.innerHTML = `
      <div class="launch-wrap">
        <span class="home-blob a" aria-hidden="true"></span>
        <span class="home-blob b" aria-hidden="true"></span>
        <div class="walo-window">
          <header class="app-header">Walo <span style="font-size:12px;font-weight:600;opacity:.9">Community rep console</span></header>
          <div class="walo-body">
            <p class="walo-hint">Opening Walo…</p>
          </div>
          ${systemTabbarHtml()}
        </div>
        <div class="launch-ring" aria-hidden="true"></div>
      </div>`;
    bindSystemTabbar(layers.walo);
    return;
  }

  showLayer("walo");
  if (!waloNav.isOpen() && !waloNav.isLaunching()) {
    const token = waloNav.openFromDock();
    waloNav.finishLaunch(token);
  }

  if (waloNav.view === "menu") renderWaloMenu();
  else if (waloNav.view === "report") renderWaloReport();
  else if (waloNav.view === "lookup") renderWaloLookup();
  else if (waloNav.view === "profile") renderWaloProfile();
}

function renderWaloMenu() {
  layers.walo.innerHTML = `
    <header class="app-header">Walo <span style="font-size:12px;font-weight:600;opacity:.9">Community rep console</span></header>
    <div class="walo-body">
      <button type="button" class="walo-action" data-walo-view="report">Report a number
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
      <button type="button" class="walo-action" data-walo-view="lookup">Look up a number
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
      <button type="button" class="walo-action" data-walo-view="profile">Profile
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
    </div>
    ${systemTabbarHtml()}`;
  bindSystemTabbar(layers.walo);
  for (const button of layers.walo.querySelectorAll("[data-walo-view]")) {
    button.addEventListener("click", () => {
      waloNav.openView(button.dataset.waloView);
      render();
    });
  }
}

function renderWaloReport() {
  layers.walo.innerHTML = `
    <header class="app-header">
      <button type="button" class="header-back" data-walo-back aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      Walo · Report a number
    </header>
    <div class="app-body">
      <form id="report_form" novalidate>
        <div class="field" id="field_number">
          <label class="lbl" for="report_number">Number</label>
          <input id="report_number" name="number" type="text" inputmode="tel" placeholder="e.g. 0245550192" autocomplete="off">
          <p class="field-error" id="error_number"></p>
        </div>
        <div class="field" id="field_reason">
          <label class="lbl" for="report_reason">Reason</label>
          <select id="report_reason" name="reason">${REPORT_REASONS.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}</select>
        </div>
        <div class="field" id="field_description">
          <label class="lbl" for="report_description">Details</label>
          <textarea id="report_description" name="description" placeholder="What happened?"></textarea>
          <p class="field-error" id="error_description"></p>
        </div>
        <input type="hidden" id="report_community" value="${escapeHtml(DEFAULT_COMMUNITY)}">
        <button type="submit" class="btn-primary" id="report_submit">Send report</button>
        <p class="status-banner" id="report_status" role="status"></p>
        <p class="helper">Reports are suspected, not proof. A moderator reviews every report before a warning is published.</p>
      </form>
    </div>
    ${systemTabbarHtml()}`;
  bindSystemTabbar(layers.walo);
  layers.walo.querySelector("[data-walo-back]").addEventListener("click", () => { waloNav.backToMenu(); render(); });
  bindReportForm();
}

function renderWaloLookup() {
  const card = lookupLastRaw ? renderLookupCard(lookupLastRaw) : "";
  layers.walo.innerHTML = `
    <header class="app-header">
      <button type="button" class="header-back" data-walo-back aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      Walo · Look up a number
    </header>
    <div class="app-body">
      <div class="field">
        <label class="lbl" for="lookup_number">Number to check</label>
        <input id="lookup_number" type="text" inputmode="tel" placeholder="e.g. 0240000009" autocomplete="off">
      </div>
      <button type="button" class="btn-primary" id="lookup_submit">Look up</button>
      <p class="status-banner" id="lookup_status" role="status"></p>
      <div id="lookup_card_wrap" style="margin-top:12px">${card}</div>
      <p class="helper">No reports is also not proof that a number is safe.</p>
    </div>
    ${systemTabbarHtml()}`;
  bindSystemTabbar(layers.walo);
  layers.walo.querySelector("[data-walo-back]").addEventListener("click", () => { waloNav.backToMenu(); render(); });
  bindLookup();
}

function renderLookupCard(raw) {
  const described = describeLookupResult(raw);
  const risk = raw.glance_risk_level || raw.risk || raw.risk_color || "—";
  const times = raw.times_reported != null ? raw.times_reported : "—";
  return `
    <div class="result-card" role="region" aria-live="polite">
      <div class="result-num">${escapeHtml(raw.number || described.sandbox_msisdn || "")}</div>
      <div class="result-sub">Community reports · ${escapeHtml(described.source)}</div>
      <div class="kv">
        <div class="cell"><div class="k">Times reported</div><div class="v">${escapeHtml(String(times))}</div></div>
        <div class="cell"><div class="k">Risk level</div><div class="v"><span class="risk-chip">${escapeHtml(String(risk))}</span></div></div>
        <div class="cell"><div class="k">First reported</div><div class="v" style="font-size:12px">${escapeHtml(raw.first_reported || "—")}</div></div>
        <div class="cell"><div class="k">Last reported</div><div class="v" style="font-size:12px">${escapeHtml(raw.last_reported || "—")}</div></div>
      </div>
      <p style="font-size:11px;margin:10px 0 0">${escapeHtml(described.message)}</p>
      <div class="not-finding">This is not a fraud finding. Community reports are a warning sign only — check the facts before you advise anyone.</div>
    </div>`;
}

function renderWaloProfile() {
  layers.walo.innerHTML = `
    <header class="app-header">
      <button type="button" class="header-back" data-walo-back aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      Walo · Profile
    </header>
    <div class="app-body">
      <div class="profile-top">
        <div class="avatar">IA</div>
        <div class="p-name">Israel Agyeman</div>
        <div class="p-role">Community Representative</div>
      </div>
      <div class="p-row"><span>Zone</span><b>${escapeHtml(DEFAULT_COMMUNITY)}</b></div>
      <div class="p-row"><span>Rep ID</span><b id="profile_rep_id">…</b></div>
      <div class="p-row"><span>Member since</span><b>Nov 2026</b></div>
      <div class="stats">
        <div class="stat"><b>18</b><span>Reports filed</span></div>
        <div class="stat"><b>42</b><span>Lookups</span></div>
      </div>
      <button type="button" class="btn-ghost" id="logout_button">Sign out</button>
    </div>
    ${systemTabbarHtml()}`;
  bindSystemTabbar(layers.walo);
  layers.walo.querySelector("[data-walo-back]").addEventListener("click", () => { waloNav.backToMenu(); render(); });
  const shortId = repId.length > 12 ? `${repId.slice(0, 12)}…` : repId;
  layers.walo.querySelector("#profile_rep_id").textContent = shortId;
  layers.walo.querySelector("#logout_button").addEventListener("click", () => { waloNav.backToMenu(); render(); });
}

const FIELDS = ["number", "community", "description"];

function clearFieldErrors() {
  for (const field of FIELDS) {
    document.querySelector(`#field_${field}`)?.classList.remove("has-error");
    const err = document.querySelector(`#error_${field}`);
    if (err) err.textContent = "";
  }
}

function showFieldErrors(errors) {
  for (const [field, message] of Object.entries(errors)) {
    document.querySelector(`#field_${field}`)?.classList.add("has-error");
    const err = document.querySelector(`#error_${field}`);
    if (err) err.textContent = message;
  }
}

function setReportStatus(text, tone) {
  const el = document.querySelector("#report_status");
  if (!el) return;
  el.textContent = text;
  el.className = `status-banner${text ? " is-visible" : ""}${tone ? ` is-${tone}` : ""}`;
}

function bindReportForm() {
  const form = document.querySelector("#report_form");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", async event => {
    event.preventDefault();
    clearFieldErrors();
    setReportStatus("", "");
    const reason = document.querySelector("#report_reason").value;
    const details = document.querySelector("#report_description").value;
    const values = {
      number: document.querySelector("#report_number").value,
      time: "",
      community: document.querySelector("#report_community").value || DEFAULT_COMMUNITY,
      description: `[${reason}] ${details}`.trim(),
    };
    const { valid, errors } = validateReportForm(values);
    if (!valid) {
      showFieldErrors(errors);
      return;
    }
    const submit = document.querySelector("#report_submit");
    submit.disabled = true;
    setReportStatus("Sending report…", "warning");
    const payload = buildReportPayload(values, repId);
    const result = await controller.submitReport(payload);
    submit.disabled = false;
    if (!result.ok) {
      setReportStatus("Could not reach MoMoGuard. Please try again.", "danger");
      return;
    }
    if (result.data.accepted === false) {
      setReportStatus(result.data.message || "This number was already reported today.", "warning");
      return;
    }
    setReportStatus(result.data.message || "Thank you. This number has been noted as suspected.", "ok");
    form.reset();
    document.querySelector("#report_community").value = DEFAULT_COMMUNITY;
  });
}

function setLookupStatus(text, tone) {
  const el = document.querySelector("#lookup_status");
  if (!el) return;
  el.textContent = text;
  el.className = `status-banner${text ? " is-visible" : ""}${tone ? ` is-${tone}` : ""}`;
}

function bindLookup() {
  const button = document.querySelector("#lookup_submit");
  const input = document.querySelector("#lookup_number");
  if (!button || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  const run = async () => {
    const number = input.value.trim();
    if (!/^\+?\d{7,15}$/.test(number)) {
      setLookupStatus("Enter a valid phone number first.", "danger");
      lookupLastRaw = null;
      document.querySelector("#lookup_card_wrap").innerHTML = "";
      return;
    }
    setLookupStatus("Checking with Glance…", "warning");
    button.disabled = true;
    const result = await controller.reverseLookup(number);
    button.disabled = false;
    if (!result.ok) {
      setLookupStatus("", "");
      lookupLastRaw = null;
      document.querySelector("#lookup_card_wrap").innerHTML = `
        <input type="hidden" id="_noop">
        <p class="helper">${escapeHtml(describeLookupFailure().message)}</p>`;
      return;
    }
    setLookupStatus("", "");
    lookupLastRaw = { ...result.data, number };
    document.querySelector("#lookup_card_wrap").innerHTML = renderLookupCard(lookupLastRaw);
  };
  button.addEventListener("click", run);
  input.addEventListener("keydown", event => { if (event.key === "Enter") run(); });
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
      showToast("Phone busy — end the current call, then try again.");
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