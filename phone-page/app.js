import { CONFIG } from "./config.js";
import { PhoneFlow } from "./phoneFlow.js";
import * as controller from "./services/controllerAdapter.js";
import { createDemoBridge } from "./services/demoBridge.js";
import { loadLocale, t as translate, currentLocale } from "./i18n/i18n.js";

const flow = new PhoneFlow({ mode: CONFIG.MODE });
const screenContent = document.querySelector("#screen_content");
const phone = document.querySelector("#phone");
const timeLabel = document.querySelector("#screen_time");
let pendingTimer = null;
let translations = {};

function t(key, fallback = "") {
  return translate(key, translations[key] || fallback);
}

export function setPhoneLocale(locale) {
  flow.state.language = locale === "tw" ? "tw" : "en";
  return loadLocale(flow.state.language).then(catalog => {
    translations = { ...catalog };
    render();
  });
}

const voiceQuestions = [
  { question: "Who asked you to send it?", options: ["Called", "Message", "Self"] },
  { question: "What is it for?", options: ["Reversal", "Fee/prize/job", "Goods", "Family"] },
  { question: "Did they claim MTN, bank or government?", options: ["Yes", "No"] },
  { question: "Did they tell you to hurry?", options: ["Yes", "No"] },
  { question: "Do you know this person well?", options: ["Yes", "No"] },
];

const APP_META = [
  { id: "phone", label: "Phone", active: true, icon: '<path d="M5.2 3.8 9 7.5 6.8 10c1.3 2.8 3.4 4.9 6.2 6.2l2.5-2.2 3.7 3.8-.8 3c-.2.8-1 1.3-1.8 1.2C9.4 21.1 2.9 14.6 2 6.4c-.1-.8.4-1.6 1.2-1.8l2-.8Z"/>' },
  { id: "messages", label: "Messages", active: true, icon: '<path d="M3 4h18v13H9l-5 4v-4H3V4Z"/><path d="M7 8h10M7 12h7"/>' },
  { id: "contacts", label: "Contacts", active: false, icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>' },
  { id: "calculator", label: "Calculator", active: false, icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>' },
  { id: "calendar", label: "Calendar", active: false, icon: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>' },
  { id: "camera", label: "Camera", active: false, icon: '<path d="M4 8h4l2-3h4l2 3h4v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/>' },
  { id: "settings", label: "Settings", active: false, icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>' },
  { id: "tools", label: "Tools", active: false, icon: '<path d="M14 6a4 4 0 0 0-5.5 5.5L3 17l4 4 5.5-5.5A4 4 0 0 0 18 10l-3 3-3-3 3-3Z"/>' },
  // Replaces the old "Games" slot: the only purely-decorative, non-functional
  // app in this grid with zero thematic tie to a safety/security product, so
  // it's the lowest-cost one to give up for the new SIM Toolkit app.
  { id: "simToolkit", label: "SIM Toolkit", active: true, icon: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 6h6M9 10h6M9 14h4"/>' },
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function entryScreen(title, label, note = "") {
  return `<h2 class="screen-heading">${escapeHtml(title)}</h2>
    <label class="entry-label">${escapeHtml(label)}</label>
    <div class="entry-display">${escapeHtml(flow.state.entry)}</div>
    ${note ? `<p class="screen-small">${escapeHtml(note)}</p>` : ""}
    ${noticeHtml()}`;
}

function noticeHtml() {
  return flow.state.notice ? `<div class="screen-notice">${escapeHtml(flow.state.notice)}</div>` : "";
}

function centered(icon, title, message, hint = "", iconClass = "") {
  return `<div class="screen-center">
    <span class="screen-icon ${iconClass}" aria-hidden="true">${icon}</span>
    <h2 class="screen-heading">${escapeHtml(title)}</h2>
    <div class="screen-copy">${escapeHtml(message)}</div>
    ${hint ? `<div class="screen-actions">${escapeHtml(hint)}</div>` : ""}
    <div class="screen-source">source: simulated</div>
  </div>`;
}

function screenTemplate() {
  const state = flow.state;
  const amount = Number(state.amount || 0).toLocaleString();
  switch (state.screen) {
    case "idle":
      return `<div class="idle-wallpaper" aria-hidden="true">
        <span class="wallpaper-sun"></span>
        <span class="wallpaper-hill wallpaper-hill-back"></span>
        <span class="wallpaper-hill wallpaper-hill-front"></span>
      </div>`;
    case "apps":
      return `<div class="app-menu" aria-label="Applications">
        ${APP_META.map(app => `<div class="app-item ${state.selectedApp === app.id ? "is-selected" : ""} ${app.active ? "" : "is-inactive"}" ${state.selectedApp === app.id ? 'aria-current="true"' : ""}>
          <span class="app-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${app.icon}</svg></span>
          <strong>${escapeHtml(app.label)}</strong>
        </div>`).join("")}
        </div>
        <div class="app-menu-hint">Navigation: choose &nbsp; OK: open</div>`;
    case "messages":
      return `<h2 class="screen-heading">Messages</h2>
        <div class="inbox-list" role="listbox" aria-label="Message inbox">
          ${flow.messages.map((message, index) => `<div class="inbox-message ${index === state.selectedMessage ? "is-selected" : ""}" role="option" aria-selected="${index === state.selectedMessage}">
            <div class="inbox-top"><span class="inbox-sender">${escapeHtml(message.sender)}</span><span class="inbox-time">${escapeHtml(message.time)}</span></div>
            <p class="inbox-preview">${escapeHtml(message.preview)}</p>
            ${message.tag === "possible_fake" ? '<span class="msg-tag fake">POSSIBLE FAKE</span>' : message.tag === "transaction" ? '<span class="msg-tag txn">PAYMENT</span>' : ""}
          </div>`).join("")}
        </div>
        <div class="screen-actions">Up/Down: choose &nbsp; OK: read</div>
        <div class="screen-source">source: simulated</div>`;
    case "ussd":
      return entryScreen("USSD entry", "Demo code", "Placeholder only. Not a real service code. OK to continue.");
    case "serverLoading":
      return `<div class="screen-center"><span class="loading-spinner" aria-hidden="true"></span>
        <h2 class="screen-heading">Please wait</h2><p class="screen-small">Checking with MoMoGuard…</p></div>`;
    case "server":
      return `<h2 class="screen-heading">MoMoGuard</h2>
        <div class="server-text">${escapeHtml(state.serverText).replace(/\n/g, "<br>")}</div>
        <div class="entry-display server-entry">${escapeHtml(state.entry)}</div>
        <div class="screen-actions">Type, then OK &nbsp; End: exit</div>
        <div class="screen-source">controller · source: simulated</div>`;
    case "serverError":
      return centered("!", "Please try again", state.message, "OK: back to idle", "warning");
    case "main":
      return `<h2 class="screen-heading">${escapeHtml(translations.mainTitle)}</h2>
        <ol class="screen-menu">
          <li><span class="menu-number">1</span>${escapeHtml(translations.sendMoney)}</li>
          <li><span class="menu-number">2</span>${escapeHtml(translations.reportScam)}</li>
          <li><span class="menu-number">3</span>${escapeHtml(translations.scamAlerts)}</li>
          <li><span class="menu-number">5</span>${escapeHtml(translations.language)}</li>
        </ol>`;
    case "recipient":
      return entryScreen("Send Money", "Recipient number", "OK to continue. Back for menu.");
    case "amount":
      return `${entryScreen("Send Money", "Amount in GH₵", `To: ${state.recipient}. OK to continue.`)}`;
    case "confirm":
      return `<h2 class="screen-heading">Confirm payment</h2>
        <p class="screen-small">TO</p><div>${escapeHtml(state.recipient)}</div>
        <div class="payment-amount">GH₵${escapeHtml(amount)}</div>
        <div class="screen-rule"></div><div class="screen-actions">1 Yes &nbsp; 2 No</div>`;
    case "bigConfirm":
      return `<h2 class="screen-heading">Check this amount</h2>
        <p class="screen-copy">You usually send about GH₵100 to Kofi. You are sending GH₵${escapeHtml(amount)} (${escapeHtml(state.confirm?.in_words)}).</p>
        <div class="screen-actions">Continue? 1 Yes &nbsp; 2 No</div>`;
    case "loading":
      return `<div class="screen-center"><span class="loading-spinner" aria-hidden="true"></span>
        <h2 class="screen-heading">Please wait</h2><p class="screen-small">Checking locally…<br>No controller connected.</p></div>`;
    case "sent":
      return centered("✓", "Sent", state.message || `Sent GH₵${amount} to ${state.recipient}.`, "OK: demo PIN screen");
    case "caution":
      return centered("!", "Caution", state.message, "1 Continue", "warning");
    case "paused":
      return centered("Ⅱ", "Pause before sending", state.message, "Call: safety check", "warning");
    case "blocked":
      return centered("×", "Payment stopped", state.message, "End: return to idle", "stop");
    case "incomingCall":
      return `<div class="incoming-call">
        <span class="call-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3 9 7l-2 3c1 3 3 5 6 6l3-2 4 4-1 3c-1 1-2 1-3 1C9 21 3 15 2 8c0-1 0-2 1-3l2-2Z"/></svg></span>
        <strong>MoMoGuard safety call</strong><small>SIMULATED VOICE CHECK</small>
        <div class="call-answer-hint">Call: answer<br>End: cancel</div>
      </div>`;
    case "demoCall": {
      const contact = state.incomingCallContact || {};
      const trustLabel = contact.trust === "trusted" ? "Saved contact \u00b7 trusted" : "Not in contacts \u00b7 unverified";
      return `<div class="incoming-call demo-incoming-call">
        <span class="call-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3 9 7l-2 3c1 3 3 5 6 6l3-2 4 4-1 3c-1 1-2 1-3 1C9 21 3 15 2 8c0-1 0-2 1-3l2-2Z"/></svg></span>
        <strong>${escapeHtml(contact.name || "Unknown caller")}</strong>
        <small>${escapeHtml(contact.number || "")}</small>
        <small>${escapeHtml(trustLabel)}</small>
        <span class="msg-tag demo-tag">DEMO-CONTROL \u00b7 SIMULATED CALL</span>
        <div class="call-answer-hint">Call: answer<br>End: decline</div>
      </div>`;
    }
    case "voiceAudio":
      return `<div class="screen-center"><h2 class="screen-heading">Audio playing</h2>
        <div class="audio-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <span class="lock-label">KEYPAD LOCKED</span><p class="screen-small">Listen to the short warning.<br>End still cancels.</p>
        <div class="screen-source">simulated playback</div></div>`;
    case "voiceQuestion": {
      const item = voiceQuestions[state.voiceStep];
      return `<div class="question-progress">SAFETY CHECK · ${state.voiceStep + 1} / 5</div>
        <h2 class="screen-heading">${escapeHtml(item.question)}</h2>
        <ol class="screen-menu">${item.options.map((option, index) => `<li><span class="menu-number">${index + 1}</span>${escapeHtml(option)}</li>`).join("")}</ol>`;
    }
    case "cancelled":
      return centered("×", "Cancelled", "Payment cancelled. Nothing was sent.", "End: return to idle", "stop");
    case "reportNumber":
      return entryScreen("Report a Scam", "Number to report", "OK to continue.");
    case "reportType":
      return `<h2 class="screen-heading">What may have happened?</h2><ol class="screen-menu">
        <li><span class="menu-number">1</span>Possible fake reversal</li>
        <li><span class="menu-number">2</span>Possible impersonation</li>
        <li><span class="menu-number">3</span>Possible advance fee</li></ol>`;
    case "reportSent":
      return centered("✓", "Report sent", "This number has been noted as suspected.", "End: return to idle");
    case "alerts":
      return `<h2 class="screen-heading">Scam Alerts</h2><ul class="alert-list">
        <li>A caller may ask you to reverse a payment you never received.</li>
        <li>A real worker will not ask for your secret code.</li>
        <li>No reports is not proof a number is safe.</li></ul><div class="screen-source">simulated alerts</div>`;
    case "simToolkit":
      return `<h2 class="screen-heading">${escapeHtml(t("simToolkitTitle"))}</h2><ol class="screen-menu">
        <li><span class="menu-number">1</span>${escapeHtml(t("simLearnTitle"))}</li>
        <li><span class="menu-number">2</span>${escapeHtml(t("simLookupTitle"))}</li>
        <li><span class="menu-number">3</span>${escapeHtml(t("simReportTitle"))}</li></ol>`;
    case "simToolkitLearn":
      return centered("i", t("simLearnTitle"), t("simLearnBody"), "Back: SIM Toolkit menu");
    case "simToolkitLookup":
      return entryScreen(t("simLookupTitle"), t("simLookupNumber"), "OK to check with Glance.");
    case "simToolkitLookupResult": {
      const heading = { flagged: "Flagged by Glance", clear: "No threat found", error: "Could not check" }[state.reverseLookupStatus] || "No results";
      return `<h2 class="screen-heading">${escapeHtml(heading)}</h2>
        <p class="screen-copy">${escapeHtml(state.reverseLookupMessage)}</p><div class="screen-rule"></div>
        <p class="screen-small">Back: SIM Toolkit menu</p><div class="screen-source">source: Glance (stub)</div>`;
    }
    case "simToolkitReport":
      return entryScreen(t("simReportTitle"), t("simReportNumber"), t("simReportNumberNote"));
    case "simToolkitReportType":
      return `<h2 class="screen-heading">${escapeHtml(t("simReportTypeTitle"))}</h2><ol class="screen-menu">
        <li><span class="menu-number">1</span>${escapeHtml(t("simReportType1"))}</li>
        <li><span class="menu-number">2</span>${escapeHtml(t("simReportType2"))}</li>
        <li><span class="menu-number">3</span>${escapeHtml(t("simReportType3"))}</li>
        <li><span class="menu-number">4</span>${escapeHtml(t("simReportType4"))}</li>
        <li><span class="menu-number">5</span>${escapeHtml(t("simReportType5"))}</li></ol>`;
    case "simToolkitReportIdentity":
      return entryScreen(t("simReportIdentityTitle"), t("simReportIdentityLabel"),
        t("simReportIdentityNote"));
    case "simToolkitReportLost":
      return `<h2 class="screen-heading">${escapeHtml(t("simReportLostTitle"))}</h2><ol class="screen-menu">
        <li><span class="menu-number">1</span>${escapeHtml(t("simReportLostYes"))}</li>
        <li><span class="menu-number">2</span>${escapeHtml(t("simReportLostNo"))}</li></ol>`;
    case "simToolkitReportSent":
      return centered("✓", "Report sent", state.reportSuspiciousMessage || "Thank you. This number has been noted as suspected.", "End: return to idle");
    case "language":
      return `<h2 class="screen-heading">Language</h2><ol class="screen-menu">
        <li><span class="menu-number">1</span>English</li><li><span class="menu-number">2</span>Twi</li></ol>${noticeHtml()}
        <p class="screen-small">${escapeHtml(t("twSecurityReview"))}</p>`;
    case "sms": {
      const current = flow.messages[state.selectedMessage] || {};
      const title = state.messageTag === "transaction" ? "Payment receipt" : "Message";
      return `<h2 class="screen-heading">${escapeHtml(title)}</h2>
        ${state.messageTag === "possible_fake" ? '<div class="msg-tag fake">POSSIBLE FAKE</div>' : ""}
        <div class="sms-card"><div class="sms-sender">${escapeHtml(current.sender || "UNKNOWN")} · ${escapeHtml(current.time || "NOW")}</div>
        <div>${escapeHtml(state.message)}</div></div>
        ${state.messageWarning ? `<div class="sms-warning">${escapeHtml(state.messageWarning)}</div>` : ""}
        <div class="screen-source">source: simulated</div>`;
    }
    case "pin":
      return `<h2 class="screen-heading">DEMO PIN SCREEN</h2><p class="screen-small">Digits are not saved.</p>
        <div class="pin-dots" aria-label="${state.pinLength} digits entered">${"•".repeat(state.pinLength)}</div>
        <p class="screen-small">OK when finished.<br>Clear removes one dot.</p><div class="screen-source">digits are discarded</div>`;
    case "demoComplete":
      return centered("✓", "Demo complete", "PIN digits discarded. Nothing was stored.", "End: return to idle");
    case "error":
      return centered("!", "Please try again", state.message, "OK: go back", "warning");
    default:
      return centered("!", "Please try again", "This screen is not available.", "End: return to idle", "warning");
  }
}

function scrollSelectedIntoView() {
  const list = screenContent.querySelector(".inbox-list");
  const item = list?.querySelector(".inbox-message.is-selected");
  if (!list || !item) return;
  const listRect = list.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
  else if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
}

function render() {
  screenContent.innerHTML = screenTemplate();
  scrollSelectedIntoView();
  phone.classList.toggle("is-locked", flow.state.locked);
  phone.dataset.screen = flow.state.screen;
  for (const button of document.querySelectorAll(".key")) {
    const locked = flow.state.locked && button.dataset.key !== "end";
    button.setAttribute("aria-disabled", String(locked));
  }
}

function updateTime() {
  timeLabel.textContent = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function queueAdvance(callback, delay) {
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(async () => {
    pendingTimer = null;
    await callback();
    render();
    scheduleCurrentScreen();
  }, delay);
}

async function finishReverseLookup() {
  if (CONFIG.MODE === "controller") {
    const result = await controller.reverseLookup(flow.state.reverseLookupNumber);
    if (flow.state.screen !== "loading") return;
    if (result.ok) flow.applyReverseLookupResult(result.data);
    else flow.applyReverseLookupError();
  } else {
    flow.finishReverseLookup();
  }
}

async function finishReportSuspiciousNumber() {
  if (CONFIG.MODE === "controller") {
    const payload = flow.buildSuspiciousReportPayload(flow.sender);
    const result = await controller.reportSuspiciousNumber(payload);
    if (flow.state.screen !== "loading") return;
    if (result.ok) flow.applyReportSuspiciousResult(result.data);
    else flow.applyReportSuspiciousError();
  } else {
    flow.finishReportSuspiciousNumber();
  }
}

function scheduleCurrentScreen() {
  if (flow.state.screen === "loading") {
    queueAdvance(async () => {
      if (flow.state.loadingKind === "reverseLookup") await finishReverseLookup();
      else if (flow.state.loadingKind === "reportSuspicious") await finishReportSuspiciousNumber();
      else flow.finishPayment();
    }, CONFIG.SIMULATED_DELAY_MS);
  } else if (flow.state.screen === "paused") {
    queueAdvance(() => flow.press("call"), CONFIG.INCOMING_CALL_DELAY_MS);
  } else if (flow.state.screen === "voiceAudio") {
    queueAdvance(() => flow.finishAudio(), CONFIG.VOICE_AUDIO_MS);
  }
}

function flashKey(key) {
  const button = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (!button) return;
  button.classList.add("is-pressed");
  setTimeout(() => button.classList.remove("is-pressed"), 140);
}

function dispatch(key) {
  flashKey(key);
  if (flow.state.locked && key !== "end") return;
  clearTimeout(pendingTimer);
  pendingTimer = null;
  const previousScreen = flow.state.screen;
  flow.press(key);
  if (previousScreen === "language" && ["1", "2"].includes(key)) {
  setPhoneLocale(key === "2" ? "tw" : "en");
  }
  if (CONFIG.MODE === "controller" && ["end", "back"].includes(key)
      && ["server", "serverLoading", "serverError"].includes(previousScreen)) {
    controller.ussd(flow.sessionId, "end", flow.sender);
  }
  render();
  if (flow.state.screen === "serverLoading") {
    if (flow.state.loadingKind === "autoCall") runSimulatedCallFlow();
    else runServerRequest();
  }
  if (CONFIG.MODE === "controller" && flow.state.screen === "sms" && previousScreen !== "sms") checkSmsForCurrentMessage();
  scheduleCurrentScreen();
}

async function runServerRequest() {
  const key = flow.state.serverPendingKey ?? "";
  const result = await controller.ussd(flow.sessionId, key, flow.sender);
  if (flow.state.screen !== "serverLoading") return;
  if (result.ok) flow.applyServerScreen(result.data);
  else flow.applyServerError(result.error === "timeout"
    ? "MoMoGuard took too long to answer. Nothing was sent."
    : "Could not reach MoMoGuard. Nothing was sent.");
  render();
}

async function runSimulatedCallFlow() {
  const contact = flow.state.autoCallContact;
  if (!contact) return;
  // Drives the SAME /ussd session a real key press would: start the menu,
  // choose Send Money, type the recipient, then the amount. Each step is a
  // real controller round trip; only the final screen (the controller's own
  // decision) is shown, exactly like answering a call and being talked
  // through a payment would feel on a real phone.
  const steps = ["", "1", contact.number, String(contact.amount)];
  let result = null;
  for (const key of steps) {
    result = await controller.ussd(flow.sessionId, key, flow.sender);
    if (flow.state.screen !== "serverLoading" || flow.state.loadingKind !== "autoCall") return;
    if (!result.ok) break;
  }
  flow.state.autoCallContact = null;
  if (!result || !result.ok) {
    flow.applyServerError(result?.error === "timeout"
      ? "MoMoGuard took too long to answer. Nothing was sent."
      : "Could not reach MoMoGuard. Nothing was sent.");
  } else {
    flow.applyServerScreen(result.data);
  }
  render();
  scheduleCurrentScreen();
}

async function checkSmsForCurrentMessage() {
  const message = flow.messages[flow.state.selectedMessage];
  if (!message?.senderNumber) return;
  const result = await controller.checkSms({
    sender: message.senderNumber,
    recipient: flow.sender,
    text: message.text,
    ts: new Date().toISOString().slice(0, 19),
  });
  if (!result.ok || flow.state.screen !== "sms") return;
  if (result.data.recommended_action === "warn" && result.data.warning) {
    message.warning = result.data.warning;
    flow.state.messageWarning = result.data.warning;
    if (!message.tag) message.tag = "possible_fake";
    flow.state.messageTag = flow.state.messageTag || message.tag;
    render();
  }
}

for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("click", () => dispatch(button.dataset.key));
}

document.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const keyMap = { Enter: "ok", Backspace: "clear", Escape: "end", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  const key = keyMap[event.key] || (/^[\d*#]$/.test(event.key) ? event.key : null);
  if (!key) return;
  event.preventDefault();
  dispatch(key);
});

loadLocale("en")
  .then(catalog => { translations = { ...catalog }; render(); })
  .catch(() => {});

const resetButton = document.querySelector("#reset_demo");
const resetStatus = document.querySelector("#reset_status");
if (CONFIG.MODE === "controller") {
  document.querySelector("#preview_status").innerHTML =
    '<span class="status-dot"></span> Controller mode <span class="status-divider">/</span> Simulated money';
  document.querySelector("#footer_note").textContent =
    `Controller: ${CONFIG.CONTROLLER_URL} · No real money movement`;
  document.querySelector("#controller_guide").hidden = false;
  resetButton.hidden = false;
  resetButton.addEventListener("click", async () => {
    resetButton.disabled = true;
    resetStatus.textContent = "Resetting…";
    const result = await controller.resetDemo();
    resetButton.disabled = false;
    resetStatus.textContent = result.ok ? result.data.message : "Reset failed. Controller unreachable.";
    flow.press("end");
    render();
  });
}

// --- Demo-control bridge --------------------------------------------
// Listens for scenarios triggered from the separate demo-control page
// (same browser, same origin, different tab). See services/demoBridge.js
// for the message contract. Every event here still goes through the real
// phone flow and the real controller endpoints — nothing is faked locally.
const demoToast = document.querySelector("#demo_toast");
let toastTimer = null;

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
    render();
    showToast(`New message from ${message.sender} (simulated)`);
    demoBridge.postMessage({ type: "ack", requestId: event.requestId, status: "delivered" });
    return;
  }
  if (event.type === "incoming-call") {
    if (CONFIG.MODE !== "controller") {
      showToast("Simulated calls need controller mode. See phone-page/config.js.");
      demoBridge.postMessage({ type: "ack", requestId: event.requestId, status: "rejected", reason: "mock_mode" });
      return;
    }
    const accepted = flow.receiveSimulatedCall(event);
    if (!accepted) {
      showToast("Phone is busy. Press End on the phone, then try again.");
      demoBridge.postMessage({ type: "ack", requestId: event.requestId, status: "busy" });
      return;
    }
    render();
    demoBridge.postMessage({ type: "ack", requestId: event.requestId, status: "ringing" });
  }
});

updateTime();
setInterval(updateTime, 30000);
render();
