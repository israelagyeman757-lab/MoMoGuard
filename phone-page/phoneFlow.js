import { getReverseLookupPreview, getPaymentPreview, INITIAL_MESSAGES, makeTransactionMessage, makeControllerReceiptMessage } from "./mockResponses.js";

const ENTRY_SCREENS = new Set(["ussd", "recipient", "amount", "reportNumber",
  "simToolkitLookup", "server"]);

export const COMMUNITY_FRAUD_SERVICE_FEE_GHS = 5;

const APP_ORDER = ["phone", "messages", "contacts", "calculator", "calendar", "camera", "settings", "tools", "simToolkit"];
const ACTIVE_APPS = new Set(["phone", "messages", "simToolkit"]);
const APP_ENTRY_SCREEN = { phone: "ussd", messages: "messages", simToolkit: "simToolkit" };

export class PhoneFlow {
  constructor({ mode = "mock" } = {}) {
    this.mode = mode;
    this.sender = "0240000001";
    this.sessionId = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.messages = INITIAL_MESSAGES.map(message => ({ ...message }));
    this.reset();
  }

  reset() {
    this.state = {
      screen: "idle",
      selectedApp: "phone",
      selectedMessage: 0,
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
      reverseLookupNumber: "",
      reverseLookupStatus: "",
      reverseLookupMessage: "",
      communityFraudReference: "",
      bigConfirmed: false,
      loadingKind: "",
      serverText: "",
      serverState: "",
      serverPendingKey: null,
      incomingCallContact: null,
      autoCallContact: null,
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
    this.state.incomingCallContact = null;
  }

  _makeSimulatedCommunityFraudReference() {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `CFG-SIM-${suffix}`;
  }

  _submitEntry() {
    const { screen, entry } = this.state;
    if (screen === "ussd") {
      if (entry === "*000#") {
        this.state.entry = "";
        if (this.mode === "controller") {
          this.state.serverPendingKey = "";
          this.state.loadingKind = "server";
          this._go("serverLoading");
        } else {
          this._go("main");
        }
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
    } else if (screen === "simToolkitLookup") {
      this.state.reverseLookupNumber = entry;
      this.state.entry = "";
      this.state.loadingKind = "reverseLookup";
      this._replace("loading");
    } else if (screen === "server") {
      this.state.serverPendingKey = entry;
      this.state.entry = "";
      this.state.loadingKind = "server";
      this._go("serverLoading");
    }
  }

  press(key) {
    if (key === "end") {
      this.reset();
      return;
    }
    if (this.state.locked) return;
    if (key === "back") {
      if (this.state.screen === "server" || this.state.screen === "serverError") {
        this.reset();
        return;
      }
      this._back();
      return;
    }

    const { screen } = this.state;
    if (screen === "pin" || screen === "simToolkitCommunityFraudPin") {
      if (/^\d$/.test(key)) this.state.pinLength = Math.min(4, this.state.pinLength + 1);
      if (key === "clear") this.state.pinLength = Math.max(0, this.state.pinLength - 1);
      if (key === "ok" && this.state.pinLength > 0) {
        if (screen === "simToolkitCommunityFraudPin") {
          this.state.communityFraudReference = this._makeSimulatedCommunityFraudReference();
          this.state.pinLength = 0;
          this._replace("simToolkitCommunityFraudSuccess");
        } else {
          this._replace("demoComplete");
        }
      }
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
    } else if (screen === "demoCall") {
      if (key === "call" || key === "ok") this.answerSimulatedCall();
    } else if (screen === "apps") {
      const index = APP_ORDER.indexOf(this.state.selectedApp);
      const moves = { left: -1, right: 1, up: -3, down: 3 };
      if (moves[key] !== undefined) {
        const next = Math.min(APP_ORDER.length - 1, Math.max(0, index + moves[key]));
        this.state.selectedApp = APP_ORDER[next];
      }
      if (key === "ok" && ACTIVE_APPS.has(this.state.selectedApp)) {
        this._go(APP_ENTRY_SCREEN[this.state.selectedApp]);
      }
    } else if (screen === "messages") {
      if (key === "down") this.state.selectedMessage = Math.min(this.messages.length - 1, this.state.selectedMessage + 1);
      if (key === "up") this.state.selectedMessage = Math.max(0, this.state.selectedMessage - 1);
      if (key === "ok") {
        const message = this.messages[this.state.selectedMessage];
        this.state.message = message.text;
        this.state.messageTag = message.tag || "";
        this._go("sms");
      }
    } else if (screen === "main") {
      const destinations = { "1": "recipient", "2": "reportNumber", "3": "alerts", "5": "language" };
      if (destinations[key]) this._go(destinations[key]);
    } else if (screen === "simToolkit") {
      const destinations = { "1": "simToolkitLearn", "2": "simToolkitLookup", "3": "simToolkitCommunityFraud" };
      if (destinations[key]) this._go(destinations[key]);
    } else if (screen === "simToolkitCommunityFraud") {
      if (key === "1") {
        this.state.pinLength = 0;
        this.state.entry = "";
        this._go("simToolkitCommunityFraudPin");
      }
      if (key === "2") this.reset();
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
      if (key === "1") {
        this.state.language = "en";
        this.state.notice = "English is active.";
      }
      if (key === "2") {
        this.state.language = "tw";
        this.state.notice = "Twi selected — some security warnings still need native review.";
      }
    } else if (screen === "sent") {
      if (key === "ok") {
        this.state.pinLength = 0;
        this.state.entry = "";
        this._go("pin");
      }
    } else if (screen === "error") {
      if (key === "ok") this._back();
    } else if (screen === "serverError") {
      if (key === "ok") this.reset();
    }
  }

  applyServerScreen(result) {
    if (this.state.screen !== "serverLoading") return;
    this.state.serverPendingKey = null;
    if (result.done) {
      this.reset();
      return;
    }
    this.state.serverText = result.text;
    this.state.serverState = result.state;
    if (result.state === "result" && /^Sent\b/i.test(result.text)) {
      this.messages.unshift(makeControllerReceiptMessage(result.text));
    }
    this._replace("server");
  }

  applyServerError(message = "Could not reach MoMoGuard. Nothing was sent.") {
    if (this.state.screen !== "serverLoading") return;
    this.state.serverPendingKey = null;
    this.state.message = message;
    this._replace("serverError");
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

  // --- SIM Toolkit: Reverse Number Lookup + Community Fraud (simulated fee) ---
  // Default (mock-mode) behavior lives here, pure and synchronous, so it's
  // testable without a controller. app.js overrides reverse lookup with a real
  // controller-backed call when CONFIG.MODE === "controller".

  finishReverseLookup() {
    if (this.state.screen !== "loading" || !this.state.reverseLookupNumber) return;
    this.applyReverseLookupResult(getReverseLookupPreview(this.state.reverseLookupNumber));
  }

  applyReverseLookupResult(result) {
    this.state.reverseLookupStatus = result.status || "no_results";
    this.state.reverseLookupMessage = (
      result.short_message || result.message || ""
    );
    this._replace("simToolkitLookupResult");
  }

  applyReverseLookupError() {
    this.applyReverseLookupResult({
      status: "error",
      message: "Could not reach Glance. That is not proof this number is safe or unsafe.",
    });
  }

  // --- Demo-control bridge -------------------------------------------
  // These are triggered remotely from the separate demo-control page
  // (see services/demoBridge.js), never by a key press. They feed the
  // SAME inbox and the SAME controller session a real incoming SMS or
  // call would use — nothing here is drawn or scored locally.

  /** A simulated SMS just "arrived". Always accepted, like a real text. */
  receiveSimulatedSms({ sender = "UNKNOWN NUMBER", senderNumber = "", text = "", trust = "unknown" } = {}) {
    const message = {
      id: `demo-sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      sender,
      senderNumber: senderNumber || sender,
      time: "NOW",
      preview: text,
      text,
      tag: "",
      source: "simulated",
      trust,
    };
    this.messages.unshift(message);
    return message;
  }

  /**
   * A simulated call is ringing. Like a real phone, this only rings when
   * the phone is idle; returns false (busy) otherwise so the caller can
   * tell the operator to clear the screen first.
   */
  receiveSimulatedCall({ name = "Unknown caller", number = "", trust = "unknown", note = "", amount = 100 } = {}) {
    if (this.state.screen !== "idle") return false;
    this.state.incomingCallContact = { name, number, trust, note, amount };
    this._go("demoCall");
    return true;
  }

  /** Operator answered the simulated call: hand off to the real controller. */
  answerSimulatedCall() {
    if (this.state.screen !== "demoCall" || !this.state.incomingCallContact) return;
    this.state.autoCallContact = { ...this.state.incomingCallContact };
    this.state.incomingCallContact = null;
    this.state.loadingKind = "autoCall";
    this._go("serverLoading");
  }

  fail(message = "Please try again") {
    this.state.message = message;
    this.state.locked = false;
    this._replace("error");
  }
}