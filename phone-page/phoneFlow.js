import { T9 } from "./t9.js";
import { APPS, STK_MENU, REPORT_TYPES, CONTACTS, CALL_LOG, SEND_DEMO_PAYERS } from "./menuData.js";
import { CONFIG } from "./config.js";
import { INBOX, checkNumber as mockCheckNumber } from "./mock.js";
import { softKeysFor } from "./softKeys.js";
import { t, getLocale } from "./i18n/i18n.js";

const MAX_REPORT_TYPES = REPORT_TYPES.length;

export class PhoneFlow {
  constructor({ tapMs = CONFIG.T9_TAP_MS } = {}) {
    this.t9 = new T9({ tapMs });
    this.state = this.initialState();
  }

  initialState() {
    return {
      screen: "boot",
      history: [],
      menuIndex: 0,
      inbox: INBOX.map(message => ({ ...message, unread: message.tag === "scam" })),
      inboxIndex: 0,
      currentSms: null,
      contactIndex: 0,
      calllogIndex: 0,
      settingsIndex: 0,
      dialNumber: "",
      call: null,
      callEnded: false,
      scenarios: [],
      scenarioIndex: 0,
      scenario: null,
      quiz: { questions: [], index: 0, optionIndex: 0, answers: [] },
      score: null,
      scoreLocal: false,
      results: null,
      checkResult: null,
      report: this.emptyReport(),
      warnings: [],
      warningsIndex: 0,
      stkIndex: 0,
      error: null,
      errorReturn: "stkMomo",
      popup: null,
      queuedPopup: null,
      pending: null,
      notice: "",
      sendDemo: { pickIndex: 0, amount: "", result: null },
      withdrawResult: null,
      calc: { entry: "", acc: null, op: null },
    };
  }

  emptyReport() {
    return { number: "", typeIndex: 0, type: null, description: "" };
  }

  get localeKeys() {
    const keys = softKeysFor(this.state);
    return {
      left: keys.left ? t(keys.left) : "",
      right: keys.right ? t(keys.right) : "",
    };
  }

  inputValue() {
    this.t9.commit();
    return this.t9.text;
  }

  entryDisplay() {
    return this.t9.display();
  }

  set(screen) {
    this.state.screen = screen;
    this.state.notice = "";
    return "full";
  }

  push(screen) {
    this.state.history.push(this.state.screen);
    return this.set(screen);
  }

  pop(fallback = "idle") {
    const previous = this.state.history.pop() || fallback;
    this.set(previous);
    return "full";
  }

  skipBoot() {
    if (this.state.screen !== "boot") return "none";
    return this.set("lock");
  }

  unlock() {
    if (this.state.screen !== "lock") return "none";
    this.state.lockedHint = false;
    this.set("idle");
    if (this.state.queuedPopup) {
      const payload = this.state.queuedPopup;
      this.state.queuedPopup = null;
      return this.showPopup(payload);
    }
    return "full";
  }

  // ---------------------------------------------------------------- keys --

  primary() {
    const s = this.state;
    switch (s.screen) {
      case "boot": return this.skipBoot();
      case "lock": s.lockedHint = true; return "full";
      case "idle": s.menuIndex = 0; return this.push("menu");
      case "menu": return this.openApp();
      case "inbox": return this.openSms();
      case "sms":
        if (s.currentSms?.tag === "scam") return this.startReport(s.currentSms.number);
        return this.pop("inbox");
      case "contacts": return this.startCall(CONTACTS[s.contactIndex].name, CONTACTS[s.contactIndex].number);
      case "calllog": return this.startCall(CALL_LOG[s.calllogIndex].name, CALL_LOG[s.calllogIndex].number);
      case "dialer": return this.startCall("", this.inputValue());
      case "calling": return "none";
      case "settings": return this.selectLanguage();
      case "tools": return this.push("calculator");
      case "calculator": return this.calculate();
      case "clockApp": return this.pop("menu");
      case "help": return this.pop("menu");
      case "stkCarrier": return this.push("stkMomo");
      case "stkMomo": return this.openStkItem();
      case "stkScenarios": s.scenario = s.scenarios[s.scenarioIndex] || null; return this.push("stkScenarioDetail");
      case "stkScenarioDetail": return this.set("stkMomo");
      case "stkQuestion": return this.answerQuestion();
      case "stkScore": return this.set("stkMomo");
      case "stkResults": return this.set("stkMomo");
      case "stkCheckInput": return this.submitCheck();
      case "stkCheckResult": return this.set("stkMomo");
      case "stkReportNumber": return this.submitReportNumber();
      case "stkReportType": return this.submitReportType();
      case "stkReportDesc": return this.submitReportDesc();
      case "stkSendPick":
        this.t9.setMode("num");
        this.t9.clear();
        return this.push("stkSendAmount");
      case "stkSendAmount": return this.submitSendDemo();
      case "stkSendDone":
      case "stkWithdrawResult": return this.set("stkMomo");
      case "stkReportDone": return this.set("stkMomo");
      case "stkWarnings": return this.set("stkMomo");
      case "stkTips": return this.set("stkMomo");
      case "stkHelp": return this.set("stkMomo");
      case "stkLoading": return "none";
      case "stkError": return this.set(this.state.errorReturn || "stkMomo");
      case "stkPopup": return this.popupPrimary();
      default: return "none";
    }
  }

  back() {
    const s = this.state;
    switch (s.screen) {
      case "boot":
      case "idle":
      case "lock":
      case "calling":
        if (s.screen === "calling") return this.endCall();
        return "none";
      case "menu": return this.pop("idle");
      case "inbox": return this.pop("menu");
      case "sms": return this.pop("inbox");
      case "contacts":
      case "calllog":
      case "settings":
      case "clockApp":
      case "help":
        return this.pop("menu");
      case "tools": return this.pop("menu");
      case "calculator": return this.pop("tools");
      case "dialer": return this.set("idle");
      case "stkCarrier": return this.pop("menu");
      case "stkMomo": return this.pop("stkCarrier");
      case "stkScenarios":
      case "stkScenarioDetail":
      case "stkQuestion":
      case "stkScore":
      case "stkResults":
      case "stkCheckResult":
      case "stkReportDone":
      case "stkWarnings":
      case "stkTips":
      case "stkHelp":
        return this.set("stkMomo");
      case "stkCheckInput":
      case "stkReportNumber":
        return this.set("stkMomo");
      case "stkReportType": return this.set("stkReportNumber");
      case "stkReportDesc": return this.set("stkReportType");
      case "stkLoading": return "none";
      case "stkError": return this.set(s.errorReturn || "stkMomo");
      case "stkPopup": return this.dismissPopup();
      default: return "none";
    }
  }

  clear() {
    const s = this.state;
    if (this.isInputScreen()) {
      if (!this.t9.text && !this.t9.pendingKey) {
        s.notice = "";
        return this.back();
      }
      this.t9.backspace();
      s.notice = "";
      return "entry";
    }
    if (s.screen === "calculator") {
      s.calc.entry = "";
      return "full";
    }
    return this.back();
  }

  call() {
    const s = this.state;
    switch (s.screen) {
      case "dialer": return this.startCall("", this.inputValue());
      case "contacts": return this.startCall(CONTACTS[s.contactIndex].name, CONTACTS[s.contactIndex].number);
      case "calllog": return this.startCall(CALL_LOG[s.calllogIndex].name, CALL_LOG[s.calllogIndex].number);
      case "stkCheckInput": return this.submitCheck();
      case "stkReportNumber": return this.submitReportNumber();
      case "stkReportDesc": return this.submitReportDesc();
      case "stkPopup":
        if (s.popup?.report) return this.startReport("", t("stkAlert.desc"));
        return "none";
      default: return "none";
    }
  }

  end() {
    if (this.state.screen === "lock" || this.state.screen === "boot") return "none";
    this.state.pending = null;
    this.state.popup = null;
    this.state.queuedPopup = null;
    this.state.quiz = { questions: [], index: 0, optionIndex: 0, answers: [] };
    this.state.report = this.emptyReport();
    this.state.error = null;
    this.state.call = null;
    this.state.callEnded = false;
    this.state.history = [];
    this.state.notice = "";
    this.t9.clear();
    this.state.screen = "idle";
    return "full";
  }

  digit(key) {
    const s = this.state;
    if (s.screen === "boot") return this.skipBoot();
    if (s.screen === "lock") {
      if (key === "*") return this.unlock();
      return "none";
    }
    if (s.screen === "idle") {
      if (/^\d$/.test(key)) {
        this.t9.setMode("num");
        this.t9.clear();
        this.t9.tap(key);
        s.dialNumber = this.t9.text;
        return this.push("dialer");
      }
      return "none";
    }
    if (this.isInputScreen()) {
      const changed = this.t9.tap(key);
      s.notice = "";
      return changed ? "entry" : "none";
    }
    if (s.screen === "calculator") {
      if (key === "*") return this.calcOperator();
      if (key === "#") return this.calculate();
      if (/^\d$/.test(key)) {
        s.calc.entry = (s.calc.entry + key).slice(0, 12);
        return "full";
      }
      return "none";
    }
    return "none";
  }

  nav(direction) {
    const s = this.state;
    const moves = { up: -1, down: 1, left: -1, right: 1 };
    if (s.screen === "menu") {
      const delta = direction === "up" ? -3 : direction === "down" ? 3 : direction === "left" ? -1 : 1;
      s.menuIndex = Math.min(APPS.length - 1, Math.max(0, s.menuIndex + delta));
      return "highlight";
    }
    if (s.screen === "inbox") {
      const next = Math.min(s.inbox.length - 1, Math.max(0, s.inboxIndex + moves[direction]));
      if (next === s.inboxIndex) return "none";
      s.inboxIndex = next;
      return "highlight";
    }
    if (
      s.screen === "contacts" ||
      s.screen === "calllog" ||
      s.screen === "settings" ||
      s.screen === "stkMomo" ||
      s.screen === "stkScenarios" ||
      s.screen === "stkReportType" ||
      s.screen === "stkSendPick"
    ) {
      const length = this.listLength();
      const next = Math.min(length - 1, Math.max(0, this.listIndex() + moves[direction]));
      this.setListIndex(next);
      return "highlight";
    }
    if (s.screen === "stkQuestion") {
      const options = s.quiz.questions[s.quiz.index]?.answer_options || [];
      const next = Math.min(options.length - 1, Math.max(0, s.quiz.optionIndex + moves[direction]));
      if (next === s.quiz.optionIndex) return "none";
      s.quiz.optionIndex = next;
      return "highlight";
    }
    if (s.screen === "stkWarnings") {
      const next = Math.min(Math.max(0, s.warnings.length - 1), Math.max(0, s.warningsIndex + moves[direction]));
      if (next === s.warningsIndex) return "none";
      s.warningsIndex = next;
      return "highlight";
    }
    return "none";
  }

  longZero() {
    if (!this.isNumberInput()) return "none";
    const changed = this.t9.insert("+");
    return changed ? "entry" : "none";
  }

  commitText() {
    if (this.t9.commit()) return "entry";
    return "none";
  }

  // ------------------------------------------------------------- screens --

  isInputScreen() {
    return ["dialer", "stkCheckInput", "stkReportNumber", "stkReportDesc"].includes(this.state.screen);
  }

  isNumberInput() {
    return ["dialer", "stkCheckInput", "stkReportNumber"].includes(this.state.screen) && this.t9.mode === "num";
  }

  openApp() {
    const app = APPS[this.state.menuIndex];
    this.state.history = [];
    switch (app.id) {
      case "messages": this.state.inboxIndex = 0; return this.push("inbox");
      case "contacts": this.state.contactIndex = 0; return this.push("contacts");
      case "calllog": this.state.calllogIndex = 0; return this.push("calllog");
      case "stk": this.state.stkIndex = 0; return this.push("stkCarrier");
      case "meda": return "none";
      case "settings": return this.push("settings");
      case "clock": return this.push("clockApp");
      case "tools": return this.push("tools");
      case "help": return this.push("help");
      default: return "none";
    }
  }

  openSms() {
    const message = this.state.inbox[this.state.inboxIndex];
    if (!message) return "none";
    message.unread = false;
    this.state.currentSms = message;
    this.state.history = ["inbox"];
    return this.set("sms");
  }

  startCall(name, number) {
    this.state.call = { name: name || "", number: number || "" };
    this.state.callEnded = false;
    this.state.history = [];
    return this.set("calling");
  }

  markCallEnded() {
    if (this.state.screen !== "calling") return "none";
    this.state.callEnded = true;
    return "full";
  }

  endCall() {
    if (this.state.screen !== "calling") return "none";
    this.state.call = null;
    this.state.callEnded = false;
    return this.set("idle");
  }

  selectLanguage() {
    return "full";
  }

  calcOperator() {
    const calc = this.state.calc;
    const operators = ["+", "-", "*", "/"];
    if (calc.entry !== "" && calc.acc === null) {
      calc.acc = Number(calc.entry);
      calc.entry = "";
      calc.op = "+";
      return "full";
    }
    if (calc.acc !== null && calc.op) {
      const index = operators.indexOf(calc.op);
      calc.op = operators[(index + 1) % operators.length];
      return "full";
    }
    return "none";
  }

  calculate() {
    const calc = this.state.calc;
    if (calc.entry === "" && calc.acc === null) return "none";
    if (calc.acc === null) {
      calc.acc = Number(calc.entry);
      calc.entry = "";
      calc.op = null;
      return "full";
    }
    const value = Number(calc.entry || calc.acc);
    let result = calc.acc;
    if (calc.op === "+") result += value;
    if (calc.op === "-") result -= value;
    if (calc.op === "*") result *= value;
    if (calc.op === "/") result = value === 0 ? NaN : result / value;
    calc.acc = null;
    calc.op = null;
    calc.entry = Number.isFinite(result) ? String(Math.round(result * 1000) / 1000) : "0";
    return "full";
  }

  // ------------------------------------------------------------- STK menu --

  openStkItem() {
    const item = STK_MENU[this.state.stkIndex];
    switch (item.id) {
      case "training": return this.fetch("scenarios");
      case "quiz": return this.fetch("questions");
      case "results": return this.fetch("results");
      case "check":
        this.t9.setMode("num");
        this.t9.clear();
        return this.push("stkCheckInput");
      case "report":
        this.state.report = this.emptyReport();
        this.t9.setMode("num");
        this.t9.clear();
        return this.push("stkReportNumber");
      case "warnings": return this.fetch("warnings");
      case "sendMoney":
        this.state.sendDemo = { pickIndex: 0, amount: "", result: null };
        return this.push("stkSendPick");
      case "withdraw":
        return this.fetch("withdraw", { phone: CONFIG.WALLET_MSISDN });
      case "tips": return this.push("stkTips");
      case "help": return this.push("stkHelp");
      case "exit": return this.end();
      default: return "none";
    }
  }

  fetch(kind, args = {}) {
    this.state.pending = { kind, ...args };
    return this.set("stkLoading");
  }

  resolve(pending, result) {
    if (!this.state.pending) return "none";
    this.state.pending = null;
    switch (pending.kind) {
      case "scenarios": {
        if (!result.ok) return this.showError("error.network", "stkMomo");
        this.state.scenarios = result.data.scenarios || [];
        this.state.scenarioIndex = 0;
        return this.set("stkScenarios");
      }
      case "questions": {
        if (!result.ok) return this.showError("error.network", "stkMomo");
        const questions = (result.data.questions || []).slice(0, 2);
        if (!questions.length) return this.showError("error.network", "stkMomo");
        this.state.quiz = { questions, index: 0, optionIndex: 0, answers: [] };
        return this.set("stkQuestion");
      }
      case "attempt": {
        this.finishAttempt(result);
        return "full";
      }
      case "results": {
        if (!result.ok) return this.showError("error.network", "stkMomo");
        this.state.results = result.data;
        return this.set("stkResults");
      }
      case "warnings": {
        this.state.warnings = result.ok ? result.data.warnings || [] : [];
        this.state.warningsIndex = 0;
        return this.set("stkWarnings");
      }
      case "check": {
        if (result.ok) {
          this.state.checkResult = result.data;
        } else {
          this.state.checkResult = {
            result: "ERROR",
            reports_count: 0,
          };
        }
        return this.set("stkCheckResult");
      }
      case "report": {
        if (!result.ok) {
          this.state.errorReturn = "stkReportDesc";
          return this.showError("report.failed", "stkReportDesc");
        }
        this.state.report.status = result.data.status;
        return this.set("stkReportDone");
      }
      case "sendHold": {
        if (!result.ok) return this.showError("error.network", "stkSendAmount");
        this.state.sendDemo.result = result.data;
        const demo = SEND_DEMO_PAYERS[this.state.sendDemo.pickIndex];
        const minutes = result.data.minutes || 0;
        const amount = this.state.sendDemo.amount || "100";
        const loc = getLocale() === "tw" ? "tw" : "en";
        const reasonLine = (result.data.reason_labels || {})[loc] || "";
        const smsKey =
          demo?.id === "flagged" ? "send.smsHeldFlagged" : "send.smsHeld";
        this.state.inbox.unshift({
          from: "Walɔ",
          text: t(smsKey, {
            amount,
            minutes: demo?.id === "flagged" ? 1440 : minutes,
            reasonLine,
          }),
          time: "now",
          unread: true,
          tag: "hold",
        });
        return this.set("stkSendDone");
      }
      case "withdraw": {
        if (!result.ok) return this.showError("error.network", "stkMomo");
        this.state.withdrawResult = result.data;
        return this.set("stkWithdrawResult");
      }
      default: return "none";
    }
  }

  showError(messageKey, returnScreen) {
    this.state.error = { messageKey };
    this.state.errorReturn = returnScreen;
    return this.set("stkError");
  }

  // ---------------------------------------------------------------- quiz --

  answerQuestion() {
    const quiz = this.state.quiz;
    const question = quiz.questions[quiz.index];
    if (!question) return "none";
    const selected = question.answer_options[quiz.optionIndex];
    quiz.answers.push({ question_id: question.id, selected_answer: selected });
    if (quiz.index + 1 < quiz.questions.length) {
      quiz.index += 1;
      quiz.optionIndex = 0;
      return "full";
    }
    const body = {
      user_id: CONFIG.USER_ID,
      display_name: CONFIG.USER_ID,
      assessment_type: "pre",
      answers: quiz.answers,
    };
    return this.fetch("attempt", { body });
  }

  finishAttempt(result) {
    const quiz = this.state.quiz;
    if (result.ok) {
      this.state.score = result.data.score;
      this.state.scoreLocal = false;
    } else {
      let correct = 0;
      for (const answer of quiz.answers) {
        const question = quiz.questions.find(item => item.id === answer.question_id);
        if (question && question.correct_answer === answer.selected_answer) correct += 1;
      }
      this.state.score = quiz.answers.length ? Math.round((correct / quiz.answers.length) * 1000) / 10 : 0;
      this.state.scoreLocal = true;
    }
    this.set("stkScore");
  }

  // --------------------------------------------------------------- check --

  submitSendDemo() {
    const amount = Number(this.inputValue() || "100");
    if (!Number.isFinite(amount) || amount <= 0) {
      this.state.notice = t("check.enterValue");
      return "full";
    }
    this.state.sendDemo.amount = String(amount);
    const demo = SEND_DEMO_PAYERS[this.state.sendDemo.pickIndex] || SEND_DEMO_PAYERS[0];
    const body = {
      payer: demo.payer,
      payee: CONFIG.WALLET_MSISDN,
      amount,
      payments_from_payer_before: demo.paymentsBefore,
    };
    return this.fetch("sendHold", { body });
  }

  formatReleaseShort(iso) {
    if (!iso) return "--:--";
    const dt = new Date(iso.includes("Z") ? iso : `${iso}Z`);
    if (Number.isNaN(dt.getTime())) return String(iso).slice(11, 16);
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(dt);
  }

  submitCheck() {
    const number = this.inputValue();
    if (!number) {
      this.state.notice = t("check.enterValue");
      return "full";
    }
    if (!/^0\d{9}$/.test(number)) {
      this.state.notice = t("check.invalid");
      return "full";
    }
    return this.fetch("check", { number });
  }

  // -------------------------------------------------------------- report --

  submitReportNumber() {
    const value = this.inputValue();
    this.state.report.number = value === "0" ? "" : value;
    this.state.report.typeIndex = 0;
    this.t9.setMode("num");
    this.t9.clear();
    return this.set("stkReportType");
  }

  submitReportType() {
    const type = REPORT_TYPES[this.state.report.typeIndex];
    this.state.report.type = type.value;
    this.t9.setMode("abc");
    this.t9.clear();
    return this.set("stkReportDesc");
  }

  submitReportDesc() {
    const description = this.inputValue() || "Reported via SIM Toolkit";
    this.state.report.description = description;
    const body = {
      reporter_id: CONFIG.USER_ID,
      scam_type: this.state.report.type,
      description,
    };
    if (this.state.report.number) body.phone_number = this.state.report.number;
    return this.fetch("report", { body });
  }

  startReport(number, description = "") {
    this.state.report = this.emptyReport();
    this.state.report.number = number || "";
    this.state.report.description = description;
    this.state.report.typeIndex = 0;
    this.t9.setMode("num");
    this.t9.clear();
    if (number) {
      this.state.history = this.state.history.length ? this.state.history : [];
      return this.push("stkReportType");
    }
    return this.push("stkReportNumber");
  }

  // --------------------------------------------------------------- popup --

  showPopup(payload) {
    this.state.popup = payload;
    this.state.history = [];
    return this.set("stkPopup");
  }

  receivePopup(payload) {
    const screen = this.state.screen;
    if (screen === "lock" || screen === "boot") {
      this.state.queuedPopup = payload;
      return "none";
    }
    return this.showPopup(payload);
  }

  popupPrimary() {
    if (this.state.popup?.more) {
      this.state.popup = null;
      return this.fetch("warnings");
    }
    return this.dismissPopup();
  }

  dismissPopup() {
    this.state.popup = null;
    return this.set("idle");
  }

  // --------------------------------------------------------------- lists --

  listLength() {
    const s = this.state;
    switch (s.screen) {
      case "contacts": return CONTACTS.length;
      case "calllog": return CALL_LOG.length;
      case "settings": return 2;
      case "stkMomo": return STK_MENU.length;
      case "stkScenarios": return s.scenarios.length;
      case "stkReportType": return MAX_REPORT_TYPES;
      case "stkSendPick": return SEND_DEMO_PAYERS.length;
      default: return 0;
    }
  }

  listIndex() {
    const s = this.state;
    switch (s.screen) {
      case "contacts": return s.contactIndex;
      case "calllog": return s.calllogIndex;
      case "settings": return s.settingsIndex;
      case "stkMomo": return s.stkIndex;
      case "stkScenarios": return s.scenarioIndex;
      case "stkReportType": return s.report.typeIndex;
      case "stkSendPick": return s.sendDemo.pickIndex;
      default: return 0;
    }
  }

  setListIndex(index) {
    const s = this.state;
    switch (s.screen) {
      case "contacts": s.contactIndex = index; break;
      case "calllog": s.calllogIndex = index; break;
      case "settings": s.settingsIndex = index; break;
      case "stkMomo": s.stkIndex = index; break;
      case "stkScenarios": s.scenarioIndex = index; break;
      case "stkReportType": s.report.typeIndex = index; break;
      case "stkSendPick": s.sendDemo.pickIndex = index; break;
      default: break;
    }
  }

  /** Test and debug helper: same routes as hardware dispatch (OK == soft-left). */
  press(action) {
    if (action === "ok" || action === "soft-left") return this.primary();
    if (action === "soft-right" || action === "softRight") return this.back();
    if (action === "end") return this.end();
    if (action === "clear") return this.clear();
    if (action === "call") return this.call();
    if (["up", "down", "left", "right"].includes(action)) return this.nav(action);
    if (/^[\d*#]$/.test(action)) return this.digit(action);
    return "none";
  }

  finishBoot() {
    return this.skipBoot();
  }

  showStkPopup(payload) {
    return this.showPopup(payload);
  }

  dismissStkPopup() {
    return this.dismissPopup();
  }

  applyCheckMock() {
    const number = this.state.pending?.number || this.inputValue() || "0244123456";
    const pending = { kind: "check", number };
    this.state.pending = pending;
    return this.resolve(pending, mockCheckNumber(number));
  }
}