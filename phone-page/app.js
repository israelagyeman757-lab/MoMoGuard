import { CONFIG } from "./config.js";
import { PhoneFlow, APP_ORDER, INPUT_SCREENS, STK_MENU_SCREENS } from "./phoneFlow.js";
import * as controller from "./services/controllerAdapter.js";
import { softKeyLabels } from "./softKeys.js";
import { mapKeyboardEvent } from "./keyboardMap.js";
import { SELECT_PHONE_KEY, isSelectControl } from "./selectAction.js";
import { CARRIER_MENU, MOMO_MENU, REPORT_TYPES } from "./menuData.js";
import { iconSim, menuItemIcon } from "./phone-icons.js";

const flow = new PhoneFlow({ mode: CONFIG.MODE });
const screenContent = document.querySelector("#screen_content");
const screenSoftLeft = document.querySelector("#screen_soft_left");
const screenSoftRight = document.querySelector("#screen_soft_right");
const phone = document.querySelector("#phone");
const timeLabel = document.querySelector("#screen_time");
let stkPollTimer = null;
let bootTimer = null;
let bootDone = false;

let lastRenderedScreen = "";
let lastInteractionSig = "";

const MENU_PATCH_SCREENS = new Set([
  "stkCarrier", "stkMomo", "stkReportType", "stkTrainingQ", "messages", "apps",
]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[c]);
}

function formatHomeDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(d);
}

function homeScreenTemplate() {
  const s = flow.state;
  const time = timeLabel?.textContent || "00:00";
  const isLock = s.screen === "lock";
  const hint = isLock
    ? `<p class="screen-small home-hint">${s.lockAwaitStar ? "Press *" : "Unlock to continue"}</p>`
    : "";
  return `<div class="home-screen">
    <p class="home-carrier">MTN Ghana</p>
    <p class="home-clock">${escapeHtml(time)}</p>
    <p class="home-date">${escapeHtml(formatHomeDate())}</p>
    ${hint}
  </div>`;
}

function menuListHtml(items, index) {
  return `<ul class="stk-list" role="listbox">${items.map((item, i) => {
    const label = typeof item === "string" ? item : item.label;
    return `<li class="stk-list-item ${i === index ? "is-active" : ""}" role="option" aria-selected="${i === index}">${menuItemIcon(item)}<span class="stk-list-label">${escapeHtml(label)}</span></li>`;
  }).join("")}</ul>`;
}

function stkTitle(label) {
  return `<p class="stk-hd"><span class="stk-hd-icon" aria-hidden="true">${iconSim()}</span><span>${escapeHtml(label)}</span></p>`;
}

function inputScreen(title, hint) {
  return `<p class="stk-hd">${escapeHtml(title)}</p>
    <p class="input-mode">Input: ${escapeHtml(flow.inputMode)}</p>
    <div class="entry-display">${escapeHtml(flow.entryDisplay)}</div>
    ${hint ? `<p class="screen-small">${escapeHtml(hint)}</p>` : ""}`;
}

function screenTemplate() {
  const s = flow.state;
  switch (s.screen) {
    case "boot":
      return `<div class="boot-screen"><div class="boot-logo">MTN</div><p class="screen-small">Starting…</p></div>`;
    case "lock":
    case "idle":
      return homeScreenTemplate();
    case "stkPopup": {
      const popup = s.stkPopup || {};
      return `<div class="stk-popup" role="dialog"><p class="stk-hd">MoMoGuard</p><p class="screen-copy">${escapeHtml(popup.text)}</p>
        ${popup.report ? '<p class="screen-small">Call: report · Right soft: OK</p>' : ""}
        ${popup.more ? '<p class="screen-small">Left soft: More</p>' : ""}</div>`;
    }
    case "apps": {
      const labels = { messages: "Messages", simToolkit: "SIM services", phone: "Phone", contacts: "Contacts", calculator: "Calculator", calendar: "Calendar", camera: "Camera", settings: "Settings", tools: "Tools" };
      const active = new Set(["messages", "simToolkit"]);
      return `<p class="stk-hd">Menu</p><div class="app-menu">${APP_ORDER.map(id => `<div class="app-item ${s.selectedApp === id ? "is-selected" : ""} ${active.has(id) ? "" : "is-inactive"}"><span class="app-icon" aria-hidden="true"></span><strong>${labels[id] || id}</strong></div>`).join("")}</div>`;
    }
    case "messages":
      return `<p class="stk-hd">Messages</p><div class="inbox-list">${flow.messages.map((m, i) => `<div class="inbox-message ${i === s.selectedMessage ? "is-selected" : ""}"><div class="inbox-top"><span class="inbox-sender">${escapeHtml(m.sender)}</span><span class="inbox-time">${escapeHtml(m.time)}</span></div><p class="inbox-preview">${escapeHtml(m.preview)}</p>${m.tag === "scam" ? '<span class="msg-tag fake">SCAM</span>' : ""}</div>`).join("")}</div>`;
    case "sms":
      return `<p class="stk-hd">Message</p><div class="sms-card"><p>${escapeHtml(s.message)}</p></div>${s.messageTag === "scam" ? '<p class="screen-small">Select: report this number</p>' : ""}`;
    case "stkCarrier":
      return `${stkTitle("SIM Toolkit")}<p class="stk-sub">MTN Ghana</p>${menuListHtml(CARRIER_MENU, 0)}`;
    case "stkMomo":
      return `${stkTitle("MoMoGuard")}${menuListHtml(MOMO_MENU, s.stkMenuIndex)}`;
    case "stkCheckInput":
      return inputScreen("Check number", "No reports ≠ safe.");
    case "stkCheckResult": {
      const lk = s.lookup || {};
      return `<p class="stk-hd">${escapeHtml(lk.result || "Result")}</p><p class="screen-copy">${escapeHtml(lk.message || "")}</p><p class="screen-small">${escapeHtml(lk.disclaimer || "")}</p>`;
    }
    case "stkReportNumber":
      return inputScreen("Number", "0 skip");
    case "stkReportType":
      return `<p class="stk-hd">Scam type</p>${menuListHtml(REPORT_TYPES.map(r => r.label), s.selectedMenu)}`;
    case "stkReportDesc":
      return inputScreen("Description (Abc)", "");
    case "stkReportDone":
      return `<p class="stk-hd">Report sent</p><p class="screen-copy">Thank you. Status: UNVERIFIED.</p>`;
    case "stkWarnings":
      return `<p class="stk-hd">Warnings</p><ul class="alert-list">${(s.warnings.length ? s.warnings : [{ title: "None published" }]).slice(0, 5).map(w => `<li>${escapeHtml(w.title)}</li>`).join("")}</ul>`;
    case "stkTrainingScenarios":
      return `<p class="stk-hd">Training</p><ul class="alert-list">${(s.training.scenarios || []).map(x => `<li><strong>${escapeHtml(x.title)}</strong> — ${escapeHtml(x.summary)}</li>`).join("")}</ul>`;
    case "stkTrainingQ": {
      const q = s.training.questions[s.training.index];
      return q ? `<p class="stk-hd">Quiz ${s.training.index + 1}/${s.training.questions.length}</p><p class="screen-copy">${escapeHtml(q.question)}</p>
        ${menuListHtml(q.answer_options, s.quizOptionIndex)}` : "";
    }
    case "stkTrainingDone":
      return `<p class="stk-hd">Score</p><p class="payment-amount">${s.training.score ?? 0}%</p>`;
    case "stkTrainingResults":
      return `<p class="stk-hd">My results</p><p class="screen-copy">Last quiz: ${s.training.score ?? "—"}%</p><p class="screen-small">Full history in controller mode.</p>`;
    case "stkTips":
      return `<p class="stk-hd">Tips</p><ul class="alert-list"><li>Never share PIN or OTP.</li><li>MTN will not ask for your code on a call.</li><li>No reports does not mean a number is safe.</li></ul>`;
    case "stkHelp":
      return `<p class="stk-hd">Help</p><p class="screen-copy">SIM Toolkit · MoMoGuard only. Data may be simulated in preview.</p>`;
    case "loading":
      return `<div class="screen-center"><span class="loading-spinner" aria-hidden="true"></span><p class="stk-hd">Please wait…</p></div>`;
    case "error":
      return `<p class="stk-hd">Error</p><p class="screen-copy">${escapeHtml(s.message)}</p>`;
    default:
      return `<p class="screen-copy">—</p>`;
  }
}

function interactionSignature() {
  const s = flow.state;
  return [
    s.screen,
    s.selectedMenu,
    s.stkMenuIndex,
    s.quizOptionIndex,
    s.selectedMessage,
    s.selectedApp,
    s.lockAwaitStar,
    s.message,
    s.messageTag,
  ].join("|");
}

function listIndexForScreen(screen) {
  const s = flow.state;
  if (screen === "stkMomo") return s.stkMenuIndex;
  if (screen === "stkTrainingQ") return s.quizOptionIndex;
  if (screen === "stkReportType") return s.selectedMenu;
  if (screen === "stkCarrier") return 0;
  if (screen === "messages") return s.selectedMessage;
  return s.selectedMenu;
}

function scrollListItem(selector, index) {
  const items = screenContent.querySelectorAll(selector);
  const item = items[index];
  const list = item?.closest(".inbox-list") || item?.parentElement;
  if (!list || !item) return;
  item.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function patchMenuSelection(screen) {
  if (screen === "apps") {
    screenContent.querySelectorAll(".app-item").forEach((el, i) => {
      const id = APP_ORDER[i];
      el.classList.toggle("is-selected", id === flow.state.selectedApp);
    });
    return;
  }
  if (screen === "messages") {
    const idx = flow.state.selectedMessage;
    screenContent.querySelectorAll(".inbox-message").forEach((el, i) => {
      el.classList.toggle("is-selected", i === idx);
    });
    scrollListItem(".inbox-message", idx);
    return;
  }
  const idx = listIndexForScreen(screen);
  screenContent.querySelectorAll(".stk-list-item").forEach((el, i) => {
    const on = i === idx;
    el.classList.toggle("is-active", on);
    el.setAttribute("aria-selected", String(on));
  });
  scrollListItem(".stk-list-item", idx);
}

function patchInputFields() {
  const entry = screenContent.querySelector(".entry-display");
  if (entry) entry.textContent = flow.entryDisplay;
  const mode = screenContent.querySelector(".input-mode");
  if (mode) mode.textContent = `Input: ${flow.inputMode}`;
}

function patchLockCopy() {
  const hint = screenContent.querySelector(".home-hint");
  if (hint) {
    hint.textContent = flow.state.lockAwaitStar ? "Press *" : "Unlock to continue";
  }
}

function patchHomeClock() {
  const clock = screenContent.querySelector(".home-clock");
  if (clock) clock.textContent = timeLabel.textContent;
  const date = screenContent.querySelector(".home-date");
  if (date) date.textContent = formatHomeDate();
}

function renderSoftLabels() {
  const labels = softKeyLabels(flow.state.screen, {
    scam: flow.state.messageTag === "scam",
    more: flow.state.stkPopup?.more,
    report: flow.state.stkPopup?.report,
  });
  if (screenSoftLeft) screenSoftLeft.textContent = labels.left;
  if (screenSoftRight) screenSoftRight.textContent = labels.right;
  const stkBadge = document.querySelector("#status_stk");
  if (stkBadge) {
    const unread = flow.messages.some(m => m.tag === "scam" && (m.time === "NOW" || m.preview));
    stkBadge.hidden = !(unread || flow.state.screen === "stkPopup");
  }
}

function fullRender() {
  screenContent.innerHTML = screenTemplate();
  lastRenderedScreen = flow.state.screen;
  lastInteractionSig = interactionSignature();
  phone.dataset.screen = flow.state.screen;
  phone.classList.toggle("is-locked", flow.state.screen === "lock");
  renderSoftLabels();
}

function render({ force = false } = {}) {
  const screen = flow.state.screen;
  const sig = interactionSignature();

  if (!force && screen === lastRenderedScreen) {
    if (INPUT_SCREENS.has(screen)) {
      patchInputFields();
      renderSoftLabels();
      return;
    }
    if (screen === "idle" || screen === "lock") {
      patchHomeClock();
      if (screen === "lock") patchLockCopy();
      renderSoftLabels();
      return;
    }
    if (MENU_PATCH_SCREENS.has(screen) && sig !== lastInteractionSig) {
      patchMenuSelection(screen);
      lastInteractionSig = sig;
      renderSoftLabels();
      return;
    }
  }

  fullRender();
}

function updateTime() {
  timeLabel.textContent = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  if (flow.state.screen === "idle" || flow.state.screen === "lock") patchHomeClock();
}

function flashHighlight(selector) {
  if (!selector) return;
  const button = document.querySelector(selector);
  if (!button) return;
  button.classList.add("is-pressed");
  const ms = CONFIG.KEY_FLASH_MS || 45;
  window.setTimeout(() => button.classList.remove("is-pressed"), ms);
}

function stkPollActive() {
  return flow.state.screen === "idle" || flow.state.screen === "lock";
}

async function pollStkPush() {
  if (!stkPollActive()) return;
  if (CONFIG.MODE === "controller") {
    const res = await controller.pollStkPush(flow.userId);
    if (res.ok && res.data?.pending) flow.showStkPopup(res.data);
  }
  if (flow.state.screen === "stkPopup") render({ force: true });
}

function scheduleStkPoll() {
  clearInterval(stkPollTimer);
  stkPollTimer = null;
  if (!stkPollActive()) return;
  const ms = CONFIG.STK_POLL_MS || 10000;
  stkPollTimer = window.setInterval(pollStkPush, ms);
}

function pauseStkPollIfNeeded() {
  if (!stkPollActive()) {
    clearInterval(stkPollTimer);
    stkPollTimer = null;
  } else if (!stkPollTimer) {
    scheduleStkPoll();
  }
}

function pressSelect(highlightSelector = null) {
  dispatch(SELECT_PHONE_KEY, highlightSelector);
}

function dispatch(key, highlightSelector = null) {
  if (highlightSelector) flashHighlight(highlightSelector);
  const prev = flow.state.screen;
  flow.press(key);
  render();
  pauseStkPollIfNeeded();
  if (flow.state.screen === "loading") runLoading();
  if (prev !== flow.state.screen && STK_MENU_SCREENS.has(flow.state.screen)) {
    scheduleStkPoll();
  }
}

async function runLoading() {
  const kind = flow.state.loadingKind;
  if (CONFIG.MODE === "controller") {
    if (kind === "check") {
      const res = await controller.checkNumber(flow.state.lookup.phone);
      if (flow.state.screen !== "loading") return;
      if (res.ok) flow.applyLookupResult(res.data);
      else flow.applyLookupError();
    } else if (kind === "report") {
      const body = {
        reporter_id: flow.reporterId,
        phone_number: flow.state.report.phone_number || undefined,
        scam_type: flow.state.report.scam_type,
        description: flow.state.report.description || "Reported via SIM Toolkit",
      };
      const res = await controller.submitReport(body);
      if (flow.state.screen !== "loading") return;
      if (res.ok) flow.applyReportResult(res.data);
      else flow.applyReportError();
    } else if (kind === "warnings") {
      const res = await controller.getWarnings();
      if (flow.state.screen !== "loading") return;
      if (res.ok) flow.applyWarnings(res.data);
      else flow.applyWarnings({ warnings: [] });
    } else if (kind === "training") {
      const res = await controller.trainingQuestions("pre");
      if (flow.state.screen !== "loading") return;
      if (res.ok) flow.applyTrainingQuestions(res.data);
      else flow.applyTrainingMock();
    }
  } else if (CONFIG.SIMULATED_DELAY_MS > 0) {
    await new Promise(r => setTimeout(r, CONFIG.SIMULATED_DELAY_MS));
    if (flow.state.screen !== "loading") return;
    if (kind === "check") flow.applyCheckMock();
    else if (kind === "report") flow.applyReportMock();
    else if (kind === "warnings") flow.applyWarningsMock();
    else if (kind === "training") flow.applyTrainingMock();
  } else {
    if (flow.state.screen !== "loading") return;
    if (kind === "check") flow.applyCheckMock();
    else if (kind === "report") flow.applyReportMock();
    else if (kind === "warnings") flow.applyWarningsMock();
    else if (kind === "training") flow.applyTrainingMock();
  }
  render({ force: true });
  pauseStkPollIfNeeded();
}

async function demoStkPush(extra = {}) {
  const payload = {
    text: "High-risk reversal scam active in your area. Do not send money to unknown callers.",
    more: true,
    report: true,
    ...extra,
  };
  if (CONFIG.MODE === "controller") {
    await controller.enqueueStkPush({ ...payload, consumer: flow.userId });
    await pollStkPush();
  } else {
    flow.showStkPopup(payload);
    render({ force: true });
  }
}

function finishBootSequence() {
  if (bootDone) return;
  bootDone = true;
  clearTimeout(bootTimer);
  bootTimer = null;
  if (flow.state.screen === "boot") {
    flow.finishBoot();
    render({ force: true });
  }
  scheduleStkPoll();
}

function isTypingElsewhere(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".phone")) return false;
  if (target.closest(".keyboard-legend")) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

let longZeroTimer = null;
for (const button of document.querySelectorAll(".phone [data-key]")) {
  const highlight = button.id ? `#${button.id}` : null;
  button.addEventListener("click", () => {
    if (isSelectControl(button.id)) {
      pressSelect(highlight);
      return;
    }
    dispatch(button.dataset.key, highlight);
  });
  if (button.dataset.key === "0") {
    button.addEventListener("mousedown", () => {
      longZeroTimer = setTimeout(() => {
        flow.t9.pressDigit("+");
        render();
      }, 600);
    });
    const clearLong = () => { clearTimeout(longZeroTimer); longZeroTimer = null; };
    button.addEventListener("mouseup", clearLong);
    button.addEventListener("mouseleave", clearLong);
  }
}

function onPhoneKeyDown(event) {
  if (isTypingElsewhere(event)) return;
  if (flow.state.screen === "boot") finishBootSequence();
  const mapped = mapKeyboardEvent(event);
  if (!mapped) return;
  event.preventDefault();
  if (mapped.phoneKey === SELECT_PHONE_KEY) {
    pressSelect(mapped.highlight);
  } else {
    dispatch(mapped.phoneKey, mapped.highlight);
  }
}

window.addEventListener("keydown", onPhoneKeyDown, true);

if (phone) {
  phone.setAttribute("tabindex", "-1");
  phone.focus({ preventScroll: true });
}

const demoStkButton = document.querySelector("#demo_stk_push");
if (demoStkButton) {
  demoStkButton.addEventListener("click", () => demoStkPush());
}

fullRender();
bootTimer = window.setTimeout(finishBootSequence, CONFIG.BOOT_MS || 1500);

updateTime();
setInterval(updateTime, 30000);