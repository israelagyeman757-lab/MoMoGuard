import { getNumberPreview, getPaymentPreview, INITIAL_MESSAGES, makeTransactionMessage } from "./mockResponses.js";

const ENTRY_SCREENS = new Set(["ussd", "recipient", "amount", "reportNumber", "checkNumber"]);
const APP_ORDER = ["phone", "messages", "contacts", "calculator", "calendar", "camera", "settings", "tools", "games"];
const ACTIVE_APPS = new Set(["phone", "messages"]);

export class PhoneFlow {
  constructor() {
    this.messages = INITIAL_MESSAGES.map(message => ({ ...message }));
    this.reset();
  }

  reset() {
    this.state = {
      screen: "idle",
      selectedApp: "phone",
      selectedMessage: 0,
      messageWarning: "",
      messageTag: "",
      history: [],
      entry: "",
      recipient: "",
      amount: "",
      confirm: null,
      message: "",
      notice: "",
      source: "simulated",
      language: "en",
      locked: false,
      voiceStep: 0,
      voiceAnswers: [],
      pinLength: 0,
      numberStatus: "",
      bigConfirmed: false,
      loadingKind: "",
    };
  }

  _go(screen) {
    this.state.history.push(this.state.screen);
    this.state.screen = screen;
    this.state.notice = "";
  }

  _replace(screen) {
    const previous = this.state.screen;
    this.state.screen = screen;
    this.state.notice = "";
    if (screen === "sent" && previous !== "sent") {
      this.messages.unshift(makeTransactionMessage(this.state.recipient, this.state.amount));
    }
  }

  _back() {
    this.state.screen = this.state.history.pop() || "idle";
    this.state.entry = "";
    this.state.locked = false;
    this.state.notice = "";
  }

  _submitEntry() {
    const { screen, entry } = this.state;
    if (screen === "ussd") {
      if (entry === "*000#") {
        this.state.entry = "";
        this._go("main");
      } else {
        this.fail("Please try again. Use the demo code *000#.");
      }
      return;
    }
    if (!entry) {
      this.state.notice = "Please enter a value.";
      return;
    }
    if (screen === "recipient") {
      this.state.recipient = entry;
      this.state.entry = "";
      this._go("amount");
    } else if (screen === "amount") {
      if (Number(entry) <= 0) {
        this.state.notice = "Enter an amount above zero.";
        return;
      }
      this.state.amount = entry;
      this.state.entry = "";
      this._go("confirm");
    } else if (screen === "reportNumber") {
      this.state.entry = "";
      this._go("reportType");
    } else if (screen === "checkNumber") {
      this.state.checkingNumber = entry;
      this.state.entry = "";
      this.state.loadingKind = "number";
      this._replace("loading");
    }
  }

  press(key) {
    if (key === "end") {
      this.reset();
      return;
    }
    if (this.state.locked) return;
    if (key === "back") {
      this._back();
      return;
    }

    const { screen } = this.state;
    if (screen === "pin") {
      if (/^\d$/.test(key)) this.state.pinLength = Math.min(4, this.state.pinLength + 1);
      if (key === "clear") this.state.pinLength = Math.max(0, this.state.pinLength - 1);
      if (key === "ok" && this.state.pinLength > 0) this._replace("demoComplete");
      return;
    }
    if (key === "clear") {
      if (ENTRY_SCREENS.has(screen)) this.state.entry = this.state.entry.slice(0, -1);
      return;
    }
    if (ENTRY_SCREENS.has(screen)) {
      if (/^[\d*#]$/.test(key) && this.state.entry.length < 20) this.state.entry += key;
      if (key === "ok" || key === "call") this._submitEntry();
      return;
    }

    if (screen === "idle") {
      if (key === "call") this._go("ussd");
      if (key === "ok") this._go("apps");
    } else if (screen === "apps") {
      const index = APP_ORDER.indexOf(this.state.selectedApp);
      const moves = { left: -1, right: 1, up: -3, down: 3 };
      if (moves[key] !== undefined) {
        const next = Math.min(APP_ORDER.length - 1, Math.max(0, index + moves[key]));
        this.state.selectedApp = APP_ORDER[next];
      }
      if (key === "ok" && ACTIVE_APPS.has(this.state.selectedApp)) {
        this._go(this.state.selectedApp === "phone" ? "ussd" : "messages");
      }
    } else if (screen === "messages") {
      if (key === "down") this.state.selectedMessage = Math.min(this.messages.length - 1, this.state.selectedMessage + 1);
      if (key === "up") this.state.selectedMessage = Math.max(0, this.state.selectedMessage - 1);
      if (key === "ok") {
        const message = this.messages[this.state.selectedMessage];
        this.state.message = message.text;
        this.state.messageWarning = message.warning || "";
        this.state.messageTag = message.tag || "";
        this._go("sms");
      }
    } else if (screen === "main") {
      const destinations = { "1": "recipient", "2": "reportNumber", "3": "alerts", "4": "checkNumber", "5": "language" };
      if (destinations[key]) this._go(destinations[key]);
    } else if (screen === "confirm") {
      if (key === "1") {
        this.state.loadingKind = "payment";
        this._replace("loading");
      }
      if (key === "2") this._replace("cancelled");
    } else if (screen === "bigConfirm") {
      if (key === "1") {
        this.state.bigConfirmed = true;
        this.state.loadingKind = "payment";
        this._replace("loading");
      }
      if (key === "2") this._replace("cancelled");
    } else if (screen === "caution") {
      if (key === "ok" || key === "1") this._replace("sent");
    } else if (screen === "paused") {
      if (key === "call" || key === "ok") this._replace("incomingCall");
    } else if (screen === "incomingCall") {
      if (key === "call" || key === "ok") {
        this.state.locked = true;
        this._replace("voiceAudio");
      }
      if (key === "back") this._replace("cancelled");
    } else if (screen === "voiceQuestion") {
      const validKeys = [["1", "2", "3"], ["1", "2", "3", "4"], ["1", "2"], ["1", "2"], ["1", "2"]][this.state.voiceStep];
      if (!validKeys.includes(key)) return;
      this.state.voiceAnswers.push(key);
      this.state.voiceStep += 1;
      if (this.state.voiceStep === 5) {
        const a = this.state.voiceAnswers;
        const innocent = a[0] === "3" && ["3", "4"].includes(a[1]) && a[2] === "2" && a[3] === "2" && a[4] === "1";
        this._replace(innocent ? "sent" : "cancelled");
      }
    } else if (screen === "reportType") {
      if (["1", "2", "3"].includes(key)) this._replace("reportSent");
    } else if (screen === "language") {
      if (key === "1") this.state.notice = "English is active.";
      if (key === "2") this.state.notice = "Twi translation is coming soon. English is active.";
    } else if (screen === "sent") {
      if (key === "ok") {
        this.state.pinLength = 0;
        this.state.entry = "";
        this._go("pin");
      }
    } else if (screen === "error") {
      if (key === "ok") this._back();
    }
  }

  finishPayment() {
    if (this.state.screen !== "loading") return;
    const result = getPaymentPreview(this.state.recipient, this.state.amount, this.state.bigConfirmed);
    this.state.confirm = result.confirm || null;
    this.state.message = result.message || "";
    this._replace(result.screen);
  }

  finishAudio() {
    if (this.state.screen !== "voiceAudio") return;
    this.state.locked = false;
    this._replace("voiceQuestion");
  }

  finishNumberCheck() {
    if (this.state.screen !== "loading" || !this.state.checkingNumber) return;
    const result = getNumberPreview(this.state.checkingNumber);
    this.state.numberStatus = result.numberStatus;
    this.state.message = result.message;
    this._replace("numberResult");
  }

  fail(message = "Please try again") {
    this.state.message = message;
    this.state.locked = false;
    this._replace("error");
  }
}
