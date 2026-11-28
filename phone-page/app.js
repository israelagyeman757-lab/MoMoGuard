import { CONFIG } from "./config.js";
import { PhoneFlow, APP_ORDER } from "./phoneFlow.js";
import * as controller from "./services/controllerAdapter.js";
import { softKeyLabels } from "./softKeys.js";
import { mapKeyboardEvent } from "./keyboardMap.js";
import { CARRIER_MENU, MOMO_MENU, REPORT_TYPES } from "./menuData.js";

const flow = new PhoneFlow({ mode: CONFIG.MODE });
const screenContent = document.querySelector("#screen_content");
const screenSoftLeft = document.querySelector("#screen_soft_left");
const screenSoftRight = document.querySelector("#screen_soft_right");
const phone = document.querySelector("#phone");
const timeLabel = document.querySelector("#screen_time");
let pendingTimer = null;
let bootDone = false;
let stkPollTimer = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[c]);
}

function menuListHtml(items, index) {
  return `<ul class="stk-list" role="listbox">${items.map((item, i) => {
    const label = typeof item === "string" ? item : item.label;
    return `<li class="stk-list-item ${i === index ? "is-active" : ""}" role="option" aria-selected="${i === index}">${escapeHtml(label)}</li>`;
  }).join("")}</ul>`;
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
      return `<div class="lock-screen"><p class="stk-hd">Locked</p><p class="screen-small">${s.lockAwaitStar ? "Press *" : "Unlock to continue"}</p></div>`;
    case "idle":
      return `<div class="idle-date">${escapeHtml(timeLabel.textContent)}</div>`;
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
      return `<p class="stk-hd">SIM Toolkit</p><p class="stk-sub">MTN Ghana</p>${menuListHtml(CARRIER_MENU, 0)}`;
    case "stkMomo":
      return `<p class="stk-hd">MoMoGuard</p>${menuListHtml(MOMO_MENU, s.stkMenuIndex)}`;
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

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 90);
  } catch {
    phone.classList.add("haptic-shake");
    setTimeout(() => phone.classList.remove("haptic-shake"), 120);
  }
}

function renderSoftLabels() {
  const labels = softKeyLabels(flow.state.screen, {
    scam: flow.state.messageTag === "scam",
    more: flow.state.stkPopup?.more,
    report: flow.state.stkPopup?.report,
  });
  if (screenSoftLeft) screenSoftLeft.textContent = labels.left;
  if (screenSoftRight) screenSoftRight.textContent = labels.right;
}

function render() {
  screenContent.innerHTML = screenTemplate();
  phone.dataset.screen = flow.state.screen;
  phone.classList.toggle("is-locked", flow.state.screen === "lock");
  renderSoftLabels();
}

function updateTime() {
  timeLabel.textContent = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function flashHighlight(selector) {
  const button = selector ? document.querySelector(selector) : null;
  if (!button) return;
  button.classList.add("is-pressed");
  setTimeout(() => button.classList.remove("is-pressed"), 140);
}

function dispatch(key, highlightSelector = null) {
  if (highlightSelector) flashHighlight(highlightSelector);
  const prev = flow.state.screen;
  flow.press(key);
  render();
  if (flow.state.screen === "loading") runLoading();
  if (prev !== "messages" && flow.state.screen === "messages") playBeep();
  scheduleStkPoll();
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
  } else {
    await new Promise(r => setTimeout(r, CONFIG.SIMULATED_DELAY_MS || 500));
    if (flow.state.screen !== "loading") return;
    if (kind === "check") flow.applyCheckMock();
    else if (kind === "report") flow.applyReportMock();
    else if (kind === "warnings") flow.applyWarningsMock();
    else if (kind === "training") flow.applyTrainingMock();
  }
  render();
}

async function pollStkPush() {
  if (flow.state.screen !== "idle") return;
  if (CONFIG.MODE === "controller") {
    const res = await controller.pollStkPush(flow.userId);
    if (res.ok && res.data?.pending) flow.showStkPopup(res.data);
  }
  render();
}

function scheduleStkPoll() {
  clearInterval(stkPollTimer);
  stkPollTimer = setInterval(pollStkPush, 5000);
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
    render();
    playBeep();
  }
}

let longZeroTimer = null;
for (const button of document.querySelectorAll(".phone [data-key]")) {
  const highlight = button.id ? `#${button.id}` : null;
  button.addEventListener("click", () => dispatch(button.dataset.key, highlight));
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

document.addEventListener("keydown", event => {
  const mapped = mapKeyboardEvent(event);
  if (!mapped) return;
  event.preventDefault();
  dispatch(mapped.phoneKey, mapped.highlight);
});

const demoStkButton = document.querySelector("#demo_stk_push");
if (demoStkButton) {
  demoStkButton.addEventListener("click", () => demoStkPush());
}

if (!bootDone) {
  bootDone = true;
  render();
  setTimeout(() => { flow.finishBoot(); render(); scheduleStkPoll(); }, 1200);
}

updateTime();
setInterval(updateTime, 30000);

setTimeout(() => {
  if (flow.state.screen === "idle" || flow.state.screen === "lock") {
    const msg = flow.receiveSimulatedSms({
      sender: "MTN Alert",
      text: "Urgent: share PIN to keep wallet active. Reply now.",
    });
    if (msg) {
      playBeep();
      render();
    }
  }
}, 8000);