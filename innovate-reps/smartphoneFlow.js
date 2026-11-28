/** Phone + Messages state inside the Innovate Reps smartphone (no SMS fraud scanning). */

export class SmartphoneFlow {
  constructor({ sender = "0240000099" } = {}) {
    this.sender = sender;
    this.sessionId = `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.messages = [];
    this.recents = [];
    this.phoneTab = "dialer";
    this.dialEntry = "";
    this.selectedMessage = 0;
    this.messageScreen = "inbox";
    this.incomingCallContact = null;
    this.autoCallContact = null;
    this.callUi = null;
    this.serverPendingKey = null;
    this.serverText = "";
    this.serverState = "";
    this.loadingKind = "";
    this.language = "en";
  }

  dialDigit(digit) {
    if (this.dialEntry.length >= 15) return;
    this.dialEntry += digit;
  }

  clearDial() {
    this.dialEntry = this.dialEntry.slice(0, -1);
  }

  placeCall() {
    const number = this.dialEntry.trim();
    if (!number) return false;
    this.recents.unshift({
      number,
      name: number,
      time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
      direction: "outgoing",
    });
    this.dialEntry = "";
    return true;
  }

  receiveSimulatedSms({ sender = "UNKNOWN", text = "", trust = "unknown" } = {}) {
    const message = {
      id: `sms-${Date.now().toString(36)}`,
      sender,
      time: "Now",
      preview: text.slice(0, 48) || "(no text)",
      text: text || "(empty)",
      source: "simulated",
      trust,
    };
    this.messages.unshift(message);
    return message;
  }

  canRingIncoming() {
    return this.callUi === null;
  }

  receiveSimulatedCall({ name = "Unknown caller", number = "", trust = "unknown", note = "", amount = 100 } = {}) {
    if (!this.canRingIncoming()) return false;
    this.incomingCallContact = { name, number, trust, note, amount };
    this.callUi = "ringing";
    return true;
  }

  answerSimulatedCall() {
    if (this.callUi !== "ringing" || !this.incomingCallContact) return false;
    this.autoCallContact = { ...this.incomingCallContact };
    this.incomingCallContact = null;
    this.callUi = "active";
    this.loadingKind = "autoCall";
    return true;
  }

  declineCall() {
    this.incomingCallContact = null;
    this.autoCallContact = null;
    this.callUi = null;
    this.loadingKind = "";
  }

  applyServerScreen(result) {
    this.serverPendingKey = null;
    this.loadingKind = "";
    if (result.done) {
      this.callUi = null;
      this.serverText = "";
      return;
    }
    this.serverText = result.text || "";
    this.serverState = result.state || "";
    this.callUi = "server";
  }

  applyServerError(message = "Could not reach MoMoGuard.") {
    this.serverPendingKey = null;
    this.loadingKind = "";
    this.serverText = message;
    this.callUi = "error";
  }

  openMessage(index) {
    if (index < 0 || index >= this.messages.length) return;
    this.selectedMessage = index;
    this.messageScreen = "thread";
  }

  closeMessageThread() {
    this.messageScreen = "inbox";
  }
}