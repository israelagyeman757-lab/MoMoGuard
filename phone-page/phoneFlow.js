import { T9Input } from "./t9.js";
import {
  CARRIER_MENU,
  MOMO_MENU,
  REPORT_TYPES,
} from "./menuData.js";
import {
  DEMO_SCAM_NUMBER,
  INITIAL_MESSAGES,
  mockCheckNumber,
  mockTrainingQuestions,
  mockWarnings,
} from "./mockResponses.js";

export const APP_ORDER = ["phone", "messages", "contacts", "calculator", "calendar", "camera", "settings", "tools", "simToolkit"];
const ACTIVE_APPS = new Set(["messages", "simToolkit"]);
const APP_ENTRY = { messages: "messages", simToolkit: "stkCarrier" };

const INPUT_SCREENS = new Set(["stkCheckInput", "stkReportNumber", "stkReportDesc"]);

export class PhoneFlow {
  constructor({ mode = "mock", userId = "phone-user-1" } = {}) {
    this.mode = mode;
    this.userId = userId;
    this.reporterId = userId;
    this.messages = INITIAL_MESSAGES.map(m => ({ ...m }));
    this.t9 = new T9Input({ mode: "number" });
    this.reset(true);
  }

  reset(hard = false) {
    this.state = {
      screen: hard ? "boot" : "idle",
      selectedApp: "messages",
      selectedMessage: 0,
      selectedMenu: 0,
      stkMenuIndex: 0,
      quizOptionIndex: 0,
      message: "",
      messageTag: "",
      notice: "",
      history: [],
      locked: hard ? false : false,
      lockAwaitStar: false,
      loadingKind: "",
      lookup: null,
      report: { phone_number: "", scam_type: "", description: "" },
      warnings: [],
      training: { questions: [], index: 0, answers: [], score: null, scenarios: [] },
      smsReportNumber: "",
      stkPopup: null,
    };
    this.t9.reset();
    this.t9.setMode("number");
  }

  _go(screen) {
    this.state.history.push(this.state.screen);
    this.state.screen = screen;
    this.state.notice = "";
  if (["stkCarrier", "stkMomo", "stkReportType", "stkTrainingQ"].includes(screen)) {
      this.state.selectedMenu = 0;
    }
    if (screen === "stkMomo") this.state.stkMenuIndex = 0;
    if (INPUT_SCREENS.has(screen)) {
      this.t9.reset();
      this.t9.setMode(screen === "stkReportDesc" ? "text" : "number");
    }
  }

  _back() {
    const prev = this.state.history.pop() || "idle";
    this.state.screen = prev;
    this.state.notice = "";
    if (!INPUT_SCREENS.has(prev)) this.t9.reset();
  }

  finishBoot() {
    if (this.state.screen === "boot") this.state.screen = "lock";
  }

  menuCountForScreen(screen) {
    if (screen === "stkMomo") return MOMO_MENU.length;
    if (screen === "stkReportType") return REPORT_TYPES.length;
    if (screen === "stkCarrier") return CARRIER_MENU.length;
    if (screen === "apps") return APP_ORDER.length;
    if (screen === "messages") return this.messages.length;
    return 0;
  }

  _listIndexForScreen(screen) {
    if (screen === "stkMomo") return this.state.stkMenuIndex;
    return this.state.selectedMenu;
  }

  _setListIndex(screen, index) {
    if (screen === "stkMomo") this.state.stkMenuIndex = index;
    else this.state.selectedMenu = index;
  }

  _moveListMenu(screen, delta) {
    const count = this.menuCountForScreen(screen);
    if (!count) return;
    const next = Math.min(count - 1, Math.max(0, this._listIndexForScreen(screen) + delta));
    this._setListIndex(screen, next);
  }

  _activateListMenu(screen) {
    if (screen === "stkCarrier") {
      this.state.stkMenuIndex = 0;
      this._go("stkMomo");
      return;
    }
    if (screen === "stkMomo") {
      const item = MOMO_MENU[this.state.stkMenuIndex];
      if (!item) return;
      if (item.id === "exit") {
        this.reset();
        this.state.screen = "idle";
        return;
      }
      if (item.id.startsWith("loading:")) {
        this.state.loadingKind = item.id.split(":")[1];
        this._replace("loading");
        return;
      }
      if (item.id === "stkTrainingScenarios") {
        this.state.training.scenarios = [
          { title: "Fake reversal", summary: "Caller asks you to send money back you never received." },
          { title: "PIN trap", summary: "Urgent SMS asks for your MoMo PIN to verify your wallet." },
        ];
      }
      this._go(item.id);
      return;
    }
    if (screen === "stkReportType") {
      const entry = REPORT_TYPES[this.state.selectedMenu];
      if (!entry) return;
      this.state.report.scam_type = entry.scam_type;
      this._go("stkReportDesc");
      return;
    }
    if (screen === "stkTrainingQ") {
      const q = this.state.training.questions[this.state.training.index];
      const selected = q?.answer_options?.[this.state.quizOptionIndex];
      if (!selected) return;
      this.state.training.answers.push({ question_id: q.id, selected });
      this.state.training.index += 1;
      this.state.quizOptionIndex = 0;
      if (this.state.training.index >= this.state.training.questions.length) {
        this.finishTrainingQuiz();
      }
    }
  }

  _handleInputKey(key, now) {
    if (key === "clear") {
      this.t9.clear();
      return;
    }
    if (key === "ok" || key === "call") {
      const value = this.t9.value;
      if (!value.trim()) {
        this.state.notice = "Enter a value.";
        return;
      }
      this._submitInput(value.trim());
      return;
    }
    if (/^[\d*#]$/.test(key)) this.t9.pressDigit(key, now);
  }

  _submitInput(value) {
    const { screen } = this.state;
    if (screen === "stkCheckInput") {
      this.state.lookup = { phone: value };
      this.state.loadingKind = "check";
      this._replace("loading");
      return;
    }
    if (screen === "stkReportNumber") {
      this.state.report.phone_number = value === "0" ? "" : value;
      this._go("stkReportType");
      this.state.selectedMenu = 0;
      return;
    }
    if (screen === "stkReportDesc") {
      this.state.report.description = value;
      this.state.loadingKind = "report";
      this._replace("loading");
    }
  }

  _replace(screen) {
    this.state.screen = screen;
    this.state.notice = "";
  }

  applyLookupResult(data) {
    this.state.lookup = { phone: this.state.lookup?.phone, ...data };
    this._replace("stkCheckResult");
  }

  applyLookupError() {
    this.state.lookup = {
      phone: this.state.lookup?.phone,
      result: "ERROR",
      message: "Could not reach server. Not proof the number is safe.",
      disclaimer: "No reports found does not mean safe.",
    };
    this._replace("stkCheckResult");
  }

  applyReportResult(data) {
    this.state.notice = data?.status || "UNVERIFIED";
    this._replace("stkReportDone");
  }

  applyReportError() {
    this.state.message = "Report could not be sent.";
    this._replace("error");
  }

  applyWarnings(data) {
    this.state.warnings = data?.warnings || [];
    this._replace("stkWarnings");
  }

  applyTrainingQuestions(data) {
    const qs = data?.questions || [];
    this.state.training = {
      ...this.state.training,
      questions: qs.slice(0, 2),
      index: 0,
      answers: [],
      score: null,
    };
    this.state.quizOptionIndex = 0;
    if (!this.state.training.questions.length) {
      this.state.message = "No training questions.";
      this._replace("error");
      return;
    }
    this._go("stkTrainingQ");
  }

  finishTrainingQuiz() {
    const { questions, answers } = this.state.training;
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i]?.selected === q.correct_answer) correct += 1;
    });
    this.state.training.score = questions.length
      ? Math.round((correct / questions.length) * 100)
      : 0;
    this._replace("stkTrainingDone");
  }

  applyCheckMock() {
    const phone = this.state.lookup?.phone || "";
    this.applyLookupResult(mockCheckNumber(phone));
  }

  applyWarningsMock() {
    this.applyWarnings(mockWarnings());
  }

  applyTrainingMock() {
    this.applyTrainingQuestions(mockTrainingQuestions());
  }

  applyReportMock() {
    this.applyReportResult({ status: "UNVERIFIED", id: 1 });
  }

  showStkPopup(payload) {
    this.state.stkPopup = {
      text: payload?.text || "Walɔ alert",
      more: payload?.more ?? false,
      report: payload?.report ?? false,
    };
    if (this.state.screen === "idle") {
      this.state.screen = "stkPopup";
    }
  }

  dismissStkPopup() {
    this.state.stkPopup = null;
    if (this.state.screen === "stkPopup") this.state.screen = "idle";
  }

  receiveSimulatedSms({ sender = "UNKNOWN", senderNumber = DEMO_SCAM_NUMBER, text = "" } = {}) {
    const message = {
      id: `sms-${Date.now()}`,
      sender,
      senderNumber: senderNumber || sender,
      time: "NOW",
      preview: text.slice(0, 40),
      text,
      tag: "scam",
      source: "simulated",
    };
    this.messages.unshift(message);
    return message;
  }

  press(key, now = Date.now()) {
    if (key === "softRight") {
      if (this.state.screen === "idle") {
        this._go("apps");
        return;
      }
      if (this.state.screen === "lock") {
        this.state.lockAwaitStar = true;
        return;
      }
      key = "back";
    }

    if (key === "end") {
      this.reset();
      this.state.screen = "idle";
      return;
    }

    const { screen } = this.state;

    if (screen === "stkPopup") {
      const popup = this.state.stkPopup;
      if (key === "back") {
        this.dismissStkPopup();
        return;
      }
      if (key === "ok" && popup?.more) {
        this.state.loadingKind = "warnings";
        this.state.stkPopup = null;
        this._replace("loading");
        return;
      }
      if (key === "call" && popup?.report) {
        this.state.report = { phone_number: "", scam_type: "", description: "From STK alert" };
        this.state.stkPopup = null;
        this._go("stkReportNumber");
        return;
      }
      if (key === "ok") {
        this.dismissStkPopup();
      }
      return;
    }

    if (screen === "lock") {
      if (key === "ok") this.state.lockAwaitStar = true;
      if (key === "*" && this.state.lockAwaitStar) {
        this.state.lockAwaitStar = false;
        this._replace("idle");
      }
      return;
    }

    if (INPUT_SCREENS.has(screen)) {
      if (key === "back") {
        this._back();
        return;
      }
      this._handleInputKey(key, now);
      return;
    }

    if (key === "back") {
      if (screen === "idle" || screen === "boot") return;
      if (screen === "stkMomo") {
        this._go("stkCarrier");
        return;
      }
      this._back();
      return;
    }

    if (screen === "boot") return;

    const menuScreens = new Set(["stkCarrier", "stkMomo", "stkReportType"]);
    if (menuScreens.has(screen)) {
      if (key === "up") this._moveListMenu(screen, -1);
      if (key === "down") this._moveListMenu(screen, 1);
      if (key === "ok") this._activateListMenu(screen);
      return;
    }

    if (screen === "stkTrainingQ") {
      const q = this.state.training.questions[this.state.training.index];
      const opts = q?.answer_options || [];
      if (key === "up") {
        this.state.quizOptionIndex = Math.max(0, this.state.quizOptionIndex - 1);
      }
      if (key === "down") {
        this.state.quizOptionIndex = Math.min(opts.length - 1, this.state.quizOptionIndex + 1);
      }
      if (key === "ok") this._activateListMenu("stkTrainingQ");
      return;
    }

    if (screen === "idle") {
      if (key === "ok") this._go("apps");
      return;
    }

    if (screen === "apps") {
      const idx = APP_ORDER.indexOf(this.state.selectedApp);
      const mv = { left: -1, right: 1, up: -3, down: 3 };
      if (mv[key] !== undefined) {
        const next = Math.min(APP_ORDER.length - 1, Math.max(0, idx + mv[key]));
        this.state.selectedApp = APP_ORDER[next];
      }
      if (key === "ok" && ACTIVE_APPS.has(this.state.selectedApp)) {
        this._go(APP_ENTRY[this.state.selectedApp]);
      }
      return;
    }

    if (screen === "messages") {
      if (key === "down") this.state.selectedMessage = Math.min(this.messages.length - 1, this.state.selectedMessage + 1);
      if (key === "up") this.state.selectedMessage = Math.max(0, this.state.selectedMessage - 1);
      if (key === "ok") {
        const msg = this.messages[this.state.selectedMessage];
        this.state.message = msg.text;
        this.state.messageTag = msg.tag || "";
        this.state.smsReportNumber = msg.senderNumber || DEMO_SCAM_NUMBER;
        this._go("sms");
      }
      return;
    }

    if (screen === "sms") {
      if (key === "ok" && this.state.messageTag === "scam") {
        this.state.report = { phone_number: this.state.smsReportNumber, scam_type: "", description: "" };
        this._go("stkReportType");
        this.state.selectedMenu = 0;
      }
      return;
    }

    if (screen === "stkCheckResult" || screen === "stkReportDone" || screen === "stkWarnings"
        || screen === "stkTrainingDone" || screen === "stkHelp" || screen === "stkTips"
        || screen === "stkTrainingScenarios" || screen === "stkTrainingResults") {
      if (key === "back" || key === "ok") {
        this.state.screen = "stkMomo";
      }
    }

    if (screen === "error" && key === "ok") this._back();
  }

  get entryDisplay() {
    return this.t9.display();
  }

  get inputMode() {
    return this.t9.inputModeLabel();
  }
}