/** Map laptop keys to feature-phone actions and on-screen highlight selectors. */

import { SELECT_PHONE_KEY } from "./selectAction.js";

const NO_MOD = { ctrlKey: false, metaKey: false, altKey: false };

function starHashId(key) {
  if (key === "*") return "key_star";
  if (key === "#") return "key_hash";
  return `key_${key}`;
}

/**
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} event
 * @returns {{ phoneKey: string, highlight: string } | null}
 */
export function mapKeyboardEvent(event) {
  const key = event.key;
  const ctrlKey = event.ctrlKey ?? NO_MOD.ctrlKey;
  const metaKey = event.metaKey ?? NO_MOD.metaKey;
  const altKey = event.altKey ?? NO_MOD.altKey;
  if (ctrlKey || metaKey || altKey) return null;

  if (key === "F1" || key === "[") {
    return { phoneKey: SELECT_PHONE_KEY, highlight: "#soft_left" };
  }
  if (key === "F2" || key === "]") {
    return { phoneKey: "softRight", highlight: "#soft_right" };
  }
  if (key === "F3" || key === "Home") {
    return { phoneKey: "call", highlight: "#key_call" };
  }
  if (key === "F4" || key === "End") {
    return { phoneKey: "end", highlight: "#key_end" };
  }
  if (key === "Enter") {
    return { phoneKey: SELECT_PHONE_KEY, highlight: "#soft_left" };
  }
  if (key === "Backspace") {
    return { phoneKey: "clear", highlight: null };
  }
  if (key === "Escape") {
    return { phoneKey: "back", highlight: null };
  }
  if (key === "ArrowUp") return { phoneKey: "up", highlight: "#key_up" };
  if (key === "ArrowDown") return { phoneKey: "down", highlight: "#key_down" };
  if (key === "ArrowLeft") return { phoneKey: "left", highlight: "#key_left" };
  if (key === "ArrowRight") return { phoneKey: "right", highlight: "#key_right" };
  if (/^[\d*#]$/.test(key)) {
    return { phoneKey: key, highlight: `#${starHashId(key)}` };
  }
  return null;
}

export const KEYBOARD_LEGEND = [
  { keys: "0–9, *, #", action: "Keypad (T9 uses same timing as taps)" },
  { keys: "Arrows", action: "D-pad" },
  { keys: "Enter", action: "Select (same as left soft / centre OK)" },
  { keys: "F1 or [", action: "Left soft key (Select)" },
  { keys: "F2 or ]", action: "Right soft key (Menu / Back)" },
  { keys: "Backspace", action: "Clear (C)" },
  { keys: "Esc", action: "Back" },
  { keys: "F3 or Home", action: "Green call / send" },
  { keys: "F4 or End", action: "Red end / home" },
];