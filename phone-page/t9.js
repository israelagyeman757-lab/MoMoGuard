/** Multi-tap T9 input with cursor (feature-phone style). */

const KEY_MAP = {
  2: "abc",
  3: "def",
  4: "ghi",
  5: "jkl",
  6: "mno",
  7: "pqrs",
  8: "tuv",
  9: "wxyz",
  0: " 0+",
};

const DEFAULT_TAP_MS = 800;

export class T9Input {
  constructor({ mode = "number", tapMs = DEFAULT_TAP_MS } = {}) {
    this.mode = mode;
    this.tapMs = tapMs;
    this.cells = [];
    this.tapBuffer = "";
    this.tapIndex = 0;
    this.lastDigit = "";
    this.lastTapAt = 0;
    this.cursor = 0;
  }

  setMode(mode) {
    this.mode = mode;
    this.reset();
  }

  reset() {
    this.cells = [];
    this.tapBuffer = "";
    this.tapIndex = 0;
    this.lastDigit = "";
    this.lastTapAt = 0;
    this.cursor = 0;
  }

  get value() {
    return this.cells.join("");
  }

  commitTap() {
    if (!this.tapBuffer) return;
    if (this.cursor < this.cells.length) {
      this.cells[this.cursor] = this.tapBuffer;
    } else {
      this.cells.push(this.tapBuffer);
    }
    this.cursor += 1;
    this.tapBuffer = "";
    this.tapIndex = 0;
    this.lastDigit = "";
  }

  pressDigit(digit, now = Date.now()) {
    if (!/^[\d*#+]$/.test(digit)) return;
    if (this.mode === "number") {
      if (digit === "+") {
        if (this.cursor < this.cells.length) this.cells[this.cursor] = "+";
        else this.cells.push("+");
        this.cursor += 1;
        return;
      }
      if (this.cursor < this.cells.length) this.cells[this.cursor] = digit;
      else this.cells.push(digit);
      this.cursor += 1;
      return;
    }
    if (digit === "0") {
      this.commitTap();
      const ch = this.tapBuffer === "+" ? "+" : " ";
      if (now - this.lastTapAt <= this.tapMs && this.lastDigit === "0" && this.tapBuffer === " ") {
        this.tapBuffer = "+";
      } else if (!this.tapBuffer) {
        this.tapBuffer = ch;
      } else {
        this.commitTap();
        this.tapBuffer = " ";
      }
      this.lastDigit = "0";
      this.lastTapAt = now;
      return;
    }
    const letters = KEY_MAP[digit];
    if (!letters) return;
    const sameBurst = digit === this.lastDigit && now - this.lastTapAt <= this.tapMs;
    if (sameBurst && this.tapBuffer) {
      this.tapIndex = (this.tapIndex + 1) % letters.length;
      this.tapBuffer = letters[this.tapIndex];
    } else {
      this.commitTap();
      this.tapIndex = 0;
      this.tapBuffer = letters[0];
      this.lastDigit = digit;
    }
    this.lastTapAt = now;
  }

  clear() {
    if (this.tapBuffer) {
      this.tapBuffer = "";
      this.tapIndex = 0;
      this.lastDigit = "";
      return;
    }
    if (this.cursor > 0) {
      this.cursor -= 1;
      this.cells.pop();
    }
  }

  /** Display with active letter cycle at cursor. */
  display() {
    const committed = this.cells.join("");
    const tail = this.tapBuffer || "";
    const cursorChar = tail || (this.cursor < this.cells.length ? this.cells[this.cursor] : "_");
    if (this.mode === "number") {
      return committed.slice(0, this.cursor) + cursorChar + committed.slice(this.cursor + 1);
    }
    return committed + tail + (this.tapBuffer ? "" : "");
  }

  inputModeLabel() {
    return this.mode === "number" ? "123" : "Abc";
  }
}