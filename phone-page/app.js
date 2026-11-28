import { CONFIG } from "./config.js";
import { initI18n, t, getLocale, setLocale } from "./i18n/i18n.js";
import { PhoneFlow } from "./phoneFlow.js";
import { APPS, STK_MENU, REPORT_TYPES, CONTACTS, CALL_LOG, TIPS } from "./menuData.js";
import { hardwareIdFor, KEYMAP, isTypingTarget } from "./keyboardMap.js";
import * as api from "./api.js";
import * as mock from "./mock.js";

const STK_TEXT = "High-risk reversal scam active in your area. Do not send money to unknown callers.";
const data = CONFIG.MODE === "controller" ? api : mock;

const lcd = document.querySelector("#lcd");
const body = document.querySelector("#lcd_body");
const statusBar = document.querySelector("#lcd_status");
const softLeft = document.querySelector("#soft_left");
const softRight = document.querySelector("#soft_right");
const phone = document.querySelector("#phone");
const slot = document.querySelector("#phone_slot");

let flow;
let t9Timer = null;
let zeroTimer = null;
let zeroFired = false;
let bootTimer = null;
let callTimers = [];
let pendingBusy = false;
let pollTimer = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function timeNow() {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

function dateNow() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(now);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(now);
  return `${weekday}, ${day}`;
}

const ICONS = {
  message: '<path d="M2 3h12v9H6l-4 3V3Z"/>',
  contacts: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c1-3 2.8-4.5 5-4.5s4 1.5 5 4.5"/>',
  calllog: '<path d="M3.5 2.5 6 5 5 6.5c.7 1.5 1.8 2.6 3.3 3.3L10 8.5l2.5 2.5-.5 1.5c-.2.5-.7.8-1.2.7C7 12.5 4.3 9.8 3.3 5.7c-.1-.5.2-1 .7-1.2l-.5-2Z"/>',
  sim: '<rect x="4" y="1.8" width="8" height="12.4" rx="1.6"/><path d="M6 6.5h4v4H6zM6 4.2h3.5"/>',
  meda: '<path d="M8 13.6S2.2 9.9 2.2 5.9A3.1 3.1 0 0 1 8 4.2a3.1 3.1 0 0 1 5.8 1.7c0 4-5.8 7.7-5.8 7.7Z"/>',
  gear: '<circle cx="8" cy="8" r="2.1"/><path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3"/>',
  clock: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.6V8l2.3 1.5"/>',
  tools: '<path d="M9.6 4.3a3 3 0 0 0-3.9 3.9L2.1 11.8l2.1 2.1 3.6-3.6a3 3 0 0 0 3.9-3.9l-1.9 1.9-2.1-2.1 1.9-1.9Z"/>',
  help: '<circle cx="8" cy="8" r="5.8"/><path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.7-.8 1.2v.3"/><circle cx="8" cy="11.4" r=".7" fill="currentColor" stroke="none"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function signalSvg() {
  return '<svg width="12" height="9" viewBox="0 0 12 9" aria-hidden="true"><rect x="0" y="6" width="2" height="3"/><rect x="3.3" y="4" width="2" height="5"/><rect x="6.6" y="2" width="2" height="7"/><rect x="9.9" y="0" width="2" height="9"/></svg>';
}

function batterySvg() {
  return '<svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true"><rect x="0.5" y="0.5" width="11" height="7" rx="1" fill="none" stroke="#141414"/><rect x="2" y="2" width="7" height="4"/><rect x="12" y="2.5" width="1.5" height="3"/></svg>';
}

function envelopeSvg() {
  return '<svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="7" rx="1" fill="none" stroke="#141414"/><path d="M1 1.5 5 4.5 9 1.5" fill="none" stroke="#141414"/></svg>';
}

function rowMarkup({ name, meta, right, selected, extra = "", option = false }) {
  const aria = option ? ` role="option" aria-selected="${selected ? "true" : "false"}"` : "";
  return `<div class="row ${selected ? "is-sel" : ""}"${aria} data-row>
    <div class="main"><div class="name">${esc(name)}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ""}${extra}</div>
    ${right ? `<div class="time">${esc(right)}</div>` : ""}
  </div>`;
}

function listBox(labelKey, inner) {
  return `<div class="listbox" role="listbox" aria-label="${esc(t(labelKey))}">${inner}</div>`;
}

function renderStatus() {
  const s = flow.state;
  const showEnvelope = Boolean(s.popup) || s.inbox.some(message => message.unread);
  return `${signalSvg()}<span>MTN</span>${showEnvelope ? envelopeSvg() : ""}<span class="spacer"></span><span id="status_clock">${timeNow()}</span>${batterySvg()}`;
}

function header(key) {
  return `<div class="scr-head">${esc(t(key))}</div>`;
}

function entryBlock({ hint = "", notice = "" } = {}) {
  const mode = flow.t9.mode === "abc" ? "Abc" : "123";
  return `<div class="t9-entry">${esc(flow.entryDisplay())}<span class="cursor"></span></div>
    <div class="t9-mode">${mode}</div>
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ""}
    ${notice ? `<div class="notice">${esc(notice)}</div>` : ""}`;
}

function idleMarkup() {
  const s = flow.state;
  return `<div class="idle">
    <div class="carrier">${esc(t("idle.network"))}</div>
    <div class="clock" id="idle_clock">${timeNow()}</div>
    <div class="date">${esc(dateNow())}</div>
    ${s.lockedHint ? `<div class="hint">${esc(t("lock.hint"))}</div>` : ""}
  </div>`;
}

function menuMarkup() {
  const s = flow.state;
  return `<div class="menu-grid">${APPS.map((app, index) => `
    <div class="cell ${index === s.menuIndex ? "is-sel" : ""}" data-cell>
      ${icon(app.icon)}<span>${esc(t(app.labelKey))}</span>
    </div>`).join("")}</div>`;
}

function listMarkup(pairs) {
  return pairs.map((pair, index) => rowMarkup({ ...pair, selected: index === pair.selected })).join("");
}

function bodyMarkup() {
  const s = flow.state;
  switch (s.screen) {
    case "boot":
      return `<div class="boot-screen"><div class="boot-logo">MTN</div><small>${esc(t("boot.starting"))}</small></div>`;
    case "lock":
    case "idle":
      return idleMarkup();
    case "menu":
      return menuMarkup();
    case "inbox":
      if (!s.inbox.length) return `${header("header.inbox")}<div class="hint">${esc(t("inbox.empty"))}</div>`;
      return `${header("header.inbox")}${s.inbox.map((message, index) => rowMarkup({
        name: message.from,
        meta: message.number || "",
        right: "",
        selected: index === s.inboxIndex,
        extra: `<div class="preview">${esc(message.text)}</div>`,
      })).join("")}`;
    case "sms":
      return `${header("header.sms")}
        <div class="sms-meta">${esc(s.currentSms.from)}${s.currentSms.number ? ` · ${esc(s.currentSms.number)}` : ""}</div>
        <div class="sms-text">${esc(s.currentSms.text)}</div>`;
    case "contacts":
      return `${header("header.contacts")}${CONTACTS.map((contact, index) => rowMarkup({
        name: contact.name === "MUM" ? t("contact.mum") : t("contact.unknown"),
        meta: contact.number || "",
        selected: index === s.contactIndex,
      })).join("")}`;
    case "calllog":
      return `${header("header.calllog")}${CALL_LOG.map((entry, index) => rowMarkup({
        name: entry.name === "MUM" ? t("contact.mum") : t("contact.unknown"),
        meta: `${t(entry.typeKey)}${entry.number ? ` · ${entry.number}` : ""}`,
        right: entry.time,
        selected: index === s.calllogIndex,
      })).join("")}`;
    case "dialer":
      return `${header("header.dialer")}${entryBlock({ hint: t("call.calling").replace("…", "") })}`;
    case "calling":
      return `<div class="calling-name">${esc(s.call.name || s.call.number || "")}</div>
        <div class="calling-number">${esc(s.call.number || "")}</div>
        <div class="calling-state">${esc(t(s.callEnded ? "call.ended" : "call.calling"))}</div>`;
    case "settings":
      return `${header("header.settings")}
        <div class="lang-row ${s.settingsIndex === 0 ? "is-sel" : ""}" data-lang>
          <span>${esc(t("settings.english"))}</span><span class="check">${getLocale() === "en" ? "✓" : ""}</span>
        </div>
        <div class="lang-row ${s.settingsIndex === 1 ? "is-sel" : ""}" data-lang>
          <span>${esc(t("settings.twi"))}</span><span class="check">${getLocale() === "tw" ? "✓" : ""}</span>
        </div>
        <div class="hint">${esc(t("settings.language"))}</div>`;
    case "tools":
      return `${header("header.tools")}${rowMarkup({ name: t("tools.calculator"), meta: t("tools.one"), selected: true })}`;
    case "calculator": {
      const calc = s.calc;
      const display = calc.entry !== "" ? calc.entry : calc.acc !== null ? String(calc.acc) : "0";
      return `${header("header.calculator")}
        <div class="calc-display">${esc(display)}</div>
        <div class="calc-op">${esc(calc.op || "")}</div>
        <div class="hint">${esc(t("calc.hint"))}</div>`;
    }
    case "clockApp":
      return `${header("header.clock")}
        <div class="idle" style="padding-top:6px">
          <div class="clock" id="idle_clock">${timeNow()}</div>
          <div class="date">${esc(dateNow())}</div>
          <div class="hint">${esc(t("clock.today"))}</div>
        </div>`;
    case "help":
      return `${header("header.help")}
        <div class="copy">${esc(t("help.sim"))}</div>
        <div class="hint">${esc(t("help.keys"))}</div>`;
    case "stkCarrier":
      return `${header("header.stk")}
        <div class="hint" style="margin:0 0 3px">${esc(t("stk.carrierSub"))}</div>
        ${listBox("stk.carrierItem", rowMarkup({ name: t("stk.carrierItem"), selected: true, option: true }))}`;
    case "stkMomo":
      return `${header("header.momo")}${listBox("header.momo", STK_MENU.map((item, index) => rowMarkup({
        name: t(item.labelKey),
        selected: index === s.stkIndex,
        option: true,
      })).join(""))}`;
    case "stkScenarios":
      return `${header("header.training")}${s.scenarios.length ? listBox("header.training", s.scenarios.map((scenario, index) => rowMarkup({
        name: scenario.title,
        meta: scenario.description,
        selected: index === s.scenarioIndex,
        option: true,
      })).join("")) : `<div class="hint">${esc(t("training.loading"))}</div>`}`;
    case "stkScenarioDetail":
      return `${header("header.training")}
        <div class="name" style="font-weight:700">${esc(s.scenario?.title || "")}</div>
        <div class="copy">${esc(s.scenario?.description || "")}</div>
        <div class="hint">${esc(s.scenario?.explanation || "")}</div>`;
    case "stkQuestion": {
      const quiz = s.quiz;
      const question = quiz.questions[quiz.index];
      if (!question) return `${header("header.quiz")}<div class="hint">${esc(t("training.loading"))}</div>`;
      return `${header("header.quiz")}
        <div class="hint" style="margin:0 0 3px">${esc(t("quiz.progress", { n: quiz.index + 1, total: quiz.questions.length }))}</div>
        <div class="copy">${esc(question.question)}</div>
        ${listBox("header.quiz", question.answer_options.map((option, index) => `<div class="row ${index === quiz.optionIndex ? "is-sel" : ""}" role="option" aria-selected="${index === quiz.optionIndex ? "true" : "false"}" data-opt>
          <div class="main"><div class="name" style="font-weight:500">${esc(option)}</div></div></div>`).join(""))}`;
    }
    case "stkScore":
      return `${header("header.score")}
        <div class="big-score">${esc(t("score.percent", { score: s.score }))}</div>
        <div class="center hint">${esc(t("score.correct", { correct: s.quiz.answers.filter(answer => {
          const question = s.quiz.questions.find(item => item.id === answer.question_id);
          return question && question.correct_answer === answer.selected_answer;
        }).length, total: s.quiz.answers.length }))}</div>
        ${s.scoreLocal ? `<div class="notice center">${esc(t("score.unsaved"))}</div>` : ""}`;
    case "stkResults": {
      const latest = s.results?.history?.[0];
      if (!latest) return `${header("header.results")}<div class="hint">${esc(t("results.none"))}</div>`;
      return `${header("header.results")}
        <div class="copy">${esc(t("results.last", { score: latest.score }))}</div>
        <div class="hint">${esc(t("results.detail", { type: latest.assessment_type, count: latest.total_questions }))}</div>
        ${latest.completed_at ? `<div class="hint">${esc(String(latest.completed_at).slice(0, 10))}</div>` : ""}`;
    }
    case "stkCheckInput":
      return `${header("header.check")}${entryBlock({ hint: t("check.hint"), notice: s.notice })}`;
    case "stkCheckResult": {
      const result = s.checkResult || {};
      return `${header("header.check")}
        <div class="name" style="font-weight:700">${esc(result.result || "")}</div>
        <div class="copy">${esc(result.message || "")}</div>
        ${typeof result.reports_count === "number" ? `<div class="hint">${esc(String(result.reports_count))}</div>` : ""}
        <div class="notice">${esc(result.disclaimer || t("check.disclaimer"))}</div>
        `;
    }
    case "stkReportNumber":
      return `${header("header.report")}${entryBlock({ hint: t("report.numberHint"), notice: s.notice })}`;
    case "stkReportType":
      return `${header("header.reportType")}${listBox("header.reportType", REPORT_TYPES.map((type, index) => rowMarkup({
        name: t(type.labelKey),
        selected: index === s.report.typeIndex,
        option: true,
      })).join(""))}`;
    case "stkReportDesc":
      return `${header("header.reportDesc")}${entryBlock()}`;
    case "stkReportDone":
      return `${header("header.reportDone")}
        <div class="copy">${esc(t("report.sent", { status: s.report.status || "UNVERIFIED" }))}</div>`;
    case "stkWarnings":
      return `${header("header.warnings")}${s.warnings.length ? listBox("header.warnings", s.warnings.slice(0, 5).map((warning, index) => rowMarkup({
        name: warning.title,
        meta: warning.description,
        selected: index === s.warningsIndex,
        option: true,
      })).join("")) : `<div class="hint">${esc(t("warnings.none"))}</div>`}`;
    case "stkTips":
      return `${header("header.tips")}<div class="copy">${TIPS.map(key => `• ${esc(t(key))}`).join("\n")}</div>`;
    case "stkHelp":
      return `${header("header.help")}<div class="copy">${esc(t("help.sim"))}</div>`;
    case "stkLoading":
      return `<div class="loading"><span class="spinner"></span><span>${esc(t("loading"))}</span></div>`;
    case "stkError":
      return `${header("error.title")}<div class="copy">${esc(t(s.error?.messageKey || "error.network"))}</div>`;
    case "stkPopup":
      return `<div class="popup" role="dialog" aria-label="${esc(t("header.momo"))}">
        <div class="popup-head">${esc(t("header.momo"))}</div>
        <div class="popup-text">${esc(s.popup?.text || "")}</div>
      </div>`;
    default:
      return idleMarkup();
  }
}

function render() {
  const s = flow.state;
  if (s.screen === "settings") {
    const wanted = s.settingsIndex === 1 ? "tw" : "en";
    if (getLocale() !== wanted) {
      setLocale(wanted);
    }
  }
  lcd.classList.toggle("is-boot", s.screen === "boot");
  statusBar.innerHTML = renderStatus();
  body.innerHTML = bodyMarkup();
  const keys = flow.localeKeys;
  softLeft.textContent = keys.left;
  softRight.textContent = keys.right;
  lcd.dataset.screen = s.screen;
  scrollSelected();
  if (s.screen === "stkLoading") runPending();
  if (s.screen === "calling") scheduleCall();
}

function selectedIndex() {
  const s = flow.state;
  switch (s.screen) {
    case "menu": return s.menuIndex;
    case "inbox": return s.inboxIndex;
    case "contacts": return s.contactIndex;
    case "calllog": return s.calllogIndex;
    case "settings": return s.settingsIndex;
    case "stkMomo": return s.stkIndex;
    case "stkScenarios": return s.scenarioIndex;
    case "stkReportType": return s.report.typeIndex;
    case "stkQuestion": return s.quiz.optionIndex;
    case "stkWarnings": return s.warningsIndex;
    default: return 0;
  }
}

function patchHighlight() {
  const s = flow.state;
  const selector = {
    menu: ".cell",
    inbox: ".row",
    contacts: ".row",
    calllog: ".row",
    settings: ".lang-row",
    stkMomo: ".row",
    stkScenarios: ".row",
    stkReportType: ".row",
    stkQuestion: ".row",
    stkWarnings: ".row",
  }[s.screen];
  if (!selector) return render();
  const items = [...body.querySelectorAll(selector)];
  const index = selectedIndex();
  items.forEach((item, itemIndex) => item.classList.toggle("is-sel", itemIndex === index));
  scrollSelected();
}

function scrollSelected() {
  const selected = body.querySelector(".is-sel");
  if (!selected) return;
  const bodyRect = body.getBoundingClientRect();
  const rect = selected.getBoundingClientRect();
  if (rect.bottom > bodyRect.bottom) body.scrollTop += rect.bottom - bodyRect.bottom;
  else if (rect.top < bodyRect.top) body.scrollTop -= bodyRect.top - rect.top;
}

function patchEntry() {
  const entry = body.querySelector(".t9-entry");
  if (!entry) return render();
  entry.innerHTML = `${esc(flow.entryDisplay())}<span class="cursor"></span>`;
  const mode = body.querySelector(".t9-mode");
  if (mode) mode.textContent = flow.t9.mode === "abc" ? "Abc" : "123";
}

function tickClock() {
  const statusClock = document.querySelector("#status_clock");
  if (statusClock) statusClock.textContent = timeNow();
  const idleClock = document.querySelector("#idle_clock");
  if (idleClock) idleClock.textContent = timeNow();
}


// ---------------------------------------------------------------- timers --

function clearT9Timer() {
  if (t9Timer) clearTimeout(t9Timer);
  t9Timer = null;
}

function scheduleCommit() {
  clearT9Timer();
  if (flow.t9.mode !== "abc") return;
  t9Timer = setTimeout(() => {
    t9Timer = null;
    if (flow.state.screen !== "stkReportDesc") return;
    if (flow.commitText() === "entry") patchEntry();
  }, CONFIG.T9_TAP_MS);
}

function scheduleCall() {
  for (const timer of callTimers) clearTimeout(timer);
  callTimers = [];
  callTimers.push(setTimeout(() => {
    if (flow.state.screen !== "calling") return;
    flow.markCallEnded();
    render();
  }, 4000));
  callTimers.push(setTimeout(() => {
    if (flow.state.screen !== "calling") return;
    flow.endCall();
    render();
  }, 6600));
}

async function runPending() {
  const pending = flow.state.pending;
  if (!pending || pendingBusy) return;
  pendingBusy = true;
  try {
    const result = await callFor(pending);
    if (flow.state.pending !== pending) return;
    flow.resolve(pending, result);
    render();
  } finally {
    pendingBusy = false;
  }
}

function callFor(pending) {
  switch (pending.kind) {
    case "scenarios": return data.getTrainingScenarios();
    case "questions": return data.getTrainingQuestions("pre");
    case "attempt": return data.submitTrainingAttempt(pending.body);
    case "results": return data.getTrainingResults(CONFIG.USER_ID);
    case "warnings": return data.getWarnings();
    case "check": return data.checkNumber(pending.number);
    case "report": return data.submitReport(pending.body);
    default: return Promise.resolve({ ok: false, error: "unknown" });
  }
}

async function pollStk() {
  if (!["idle", "lock"].includes(flow.state.screen)) return;
  const result = await data.pollStkPush(CONFIG.USER_ID);
  if (!result.ok || !result.data?.pending) return;
  if (flow.receivePopup(result.data) === "full") render();
}

async function pushTip() {
  if (CONFIG.MODE === "controller") {
    const queued = await data.enqueueStkPush({ text: STK_TEXT, more: true, report: true });
    if (!queued.ok) return;
    const poll = await data.pollStkPush(CONFIG.USER_ID);
    if (poll.ok && poll.data?.pending && flow.receivePopup(poll.data) === "full") render();
    return;
  }
  if (flow.receivePopup(mock.stkPushPayload()) === "full") render();
}

// ------------------------------------------------------------- dispatch --

function flash(action) {
  const id = hardwareIdFor(action);
  if (!id) return;
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.add("is-pressed");
  setTimeout(() => element.classList.remove("is-pressed"), CONFIG.KEY_FLASH_MS);
}

function applyResult(result) {
  if (result === "full") render();
  else if (result === "highlight") patchHighlight();
  else if (result === "entry") patchEntry();
}

function dispatch(action, { fromHold = false } = {}) {
  if (!flow) return;
  if (flow.state.screen === "boot") {
    flash(action);
    flow.skipBoot();
    render();
    return;
  }
  flash(action);

  if (action === "stk-push") {
    pushTip();
    return;
  }

  let result = "none";
  if (/^[\d*#]$/.test(action)) {
    result = flow.digit(action);
    if (result === "entry" && flow.t9.mode === "abc") scheduleCommit();
    if (result === "entry" && flow.t9.mode === "num") flow.t9.commit();
  } else if (["up", "down", "left", "right"].includes(action)) {
    result = flow.nav(action);
  } else if (action === "ok" || action === "soft-left") {
    clearT9Timer();
    result = flow.primary();
  } else if (action === "back" || action === "soft-right") {
    clearT9Timer();
    result = flow.back();
  } else if (action === "clear") {
    result = flow.clear();
  } else if (action === "call") {
    clearT9Timer();
    result = flow.call();
  } else if (action === "end") {
    clearT9Timer();
    for (const timer of callTimers) clearTimeout(timer);
    callTimers = [];
    result = flow.end();
  }
  if (fromHold) result = result === "none" ? "entry" : result;
  applyResult(result);
}

// -------------------------------------------------------------- hardware --

function tapHoldZone(button) {
  const action = button.dataset.key;
  if (action !== "0") {
    button.addEventListener("click", () => dispatch(action));
    return;
  }
  zeroFired = false;
  button.addEventListener("pointerdown", () => {
    if (!flow.isNumberInput()) return;
    zeroFired = false;
    zeroTimer = setTimeout(() => {
      zeroFired = true;
      zeroTimer = null;
      dispatch("__zero_hold__");
    }, CONFIG.LONG_ZERO_MS);
  });
  const finish = () => {
    if (zeroTimer) {
      clearTimeout(zeroTimer);
      zeroTimer = null;
    }
    if (zeroFired) {
      zeroFired = false;
      return;
    }
    dispatch("0");
  };
  button.addEventListener("pointerup", finish);
  button.addEventListener("pointerleave", () => {
    if (zeroTimer) {
      clearTimeout(zeroTimer);
      zeroTimer = null;
    }
  });
}

for (const button of document.querySelectorAll("[data-key]")) {
  tapHoldZone(button);
}

window.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isTypingTarget(event)) return;
  const action = KEYMAP[event.key];
  if (!action) return;
  event.preventDefault();

  if (action === "0" && flow?.isNumberInput()) {
    if (event.repeat) return;
    zeroFired = false;
    zeroTimer = setTimeout(() => {
      zeroFired = true;
      zeroTimer = null;
      flow.longZero();
      patchEntry();
    }, CONFIG.LONG_ZERO_MS);
    return;
  }

  if (event.repeat && !["up", "down", "left", "right"].includes(action)) return;
  dispatch(action);
}, true);

window.addEventListener("keyup", event => {
  if (event.key !== "0") return;
  if (isTypingTarget(event)) return;
  if (!flow?.isNumberInput()) return;
  if (zeroTimer) {
    clearTimeout(zeroTimer);
    zeroTimer = null;
    dispatch("0");
    return;
  }
  if (zeroFired) {
    zeroFired = false;
    flash("0");
  }
}, true);

// ------------------------------------------------------------------ boot --

function fit() {
  const scale = Math.min(1.35, (window.innerHeight - 36) / 520, (window.innerWidth - 48) / 236);
  phone.style.transform = `scale(${scale})`;
  slot.style.width = `${236 * scale}px`;
  slot.style.height = `${520 * scale}px`;
}

async function start() {
  await initI18n();
  flow = new PhoneFlow();
  flow.state.settingsIndex = getLocale() === "tw" ? 1 : 0;
  fit();
  render();
  bootTimer = setTimeout(() => {
    if (flow.state.screen === "boot") {
      flow.skipBoot();
      render();
    }
  }, CONFIG.BOOT_MS);
  setInterval(tickClock, 30000);
  pollTimer = setInterval(pollStk, CONFIG.STK_POLL_MS);
}

window.addEventListener("resize", fit);
start();

// expose for verification/debugging only
window.__phone = {
  get flow() { return flow; },
  get config() { return CONFIG; },
  dispatch,
};