const LETTERS = {
  "2": "abc",
  "3": "def",
  "4": "ghi",
  "5": "jkl",
  "6": "mno",
  "7": "pqrs",
  "8": "tuv",
  "9": "wxyz",
};

export class T9 {
  constructor({ tapMs = 800, now = () => Date.now(), maxLength = 40 } = {}) {
    this.tapMs = tapMs;
    this.now = now;
    this.maxLength = maxLength;
    this.mode = "num";
    this.text = "";
    this.pendingKey = null;
    this.pendingIndex = 0;
    this.pendingAt = 0;
    this.lastZeroAt = 0;
  }

  setMode(mode) {
    this.commit();
    this.mode = mode === "abc" ? "abc" : "num";
  }

  setText(text) {
    this.commit();
    this.text = String(text ?? "").slice(0, this.maxLength);
  }

  pendingLetter() {
    if (this.mode !== "abc" || !this.pendingKey) return "";
    const letters = LETTERS[this.pendingKey] || "";
    return letters[this.pendingIndex] || "";
  }

  display() {
    return this.text + this.pendingLetter();
  }

  tap(key) {
    return this.mode === "num" ? this.tapNumber(key) : this.tapText(key);
  }

  tapNumber(key) {
    this.commit();
    if (!/^[\d*#]$/.test(key)) return false;
    if (this.text.length >= this.maxLength) return false;
    this.text += key;
    return true;
  }

  insert(char) {
    this.commit();
    if (this.text.length >= this.maxLength) return false;
    this.text += char;
    return true;
  }

  tapText(key) {
    if (!/^[\d*#]$/.test(key)) return false;

    if (key === "0") {
      const withinWindow = this.now() - this.lastZeroAt <= this.tapMs;
      this.commit();
      if (withinWindow && this.text.endsWith(" ")) {
        this.text = `${this.text.slice(0, -1)}+`;
      } else if (this.text.length < this.maxLength) {
        this.text += " ";
      }
      this.lastZeroAt = this.now();
      return true;
    }

    if (!LETTERS[key]) return false;

    if (this.pendingKey === key && this.now() - this.pendingAt <= this.tapMs) {
      const letters = LETTERS[key];
      this.pendingIndex = (this.pendingIndex + 1) % letters.length;
      this.pendingAt = this.now();
      return true;
    }

    this.commit();
    this.pendingKey = key;
    this.pendingIndex = 0;
    this.pendingAt = this.now();
    return true;
  }

  commit() {
    if (!this.pendingKey) return false;
    const letter = this.pendingLetter();
    if (letter && this.text.length < this.maxLength) this.text += letter;
    this.pendingKey = null;
    this.pendingIndex = 0;
    this.pendingAt = 0;
    return true;
  }

  backspace() {
    if (this.pendingKey) {
      if (this.pendingIndex > 0) {
        this.pendingIndex -= 1;
      } else {
        this.pendingKey = null;
      }
      this.pendingAt = this.now();
      return true;
    }
    if (!this.text) return false;
    this.text = this.text.slice(0, -1);
    return true;
  }

  clear() {
    this.text = "";
    this.pendingKey = null;
    this.pendingIndex = 0;
  }
}