export const KEYMAP = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  "*": "*", "#": "#",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "ok",
  F1: "soft-left",
  "[": "soft-left",
  F2: "soft-right",
  "]": "soft-right",
  Backspace: "clear",
  Escape: "back",
  F3: "call",
  Home: "call",
  End: "end",
  F4: "end",
  p: "stk-push",
  P: "stk-push",
};

const HARDWARE_BY_ACTION = {
  ok: "key_ok",
  "soft-left": "key_soft_left",
  "soft-right": "key_soft_right",
  up: "key_up",
  down: "key_down",
  left: "key_left",
  right: "key_right",
  call: "key_call",
  end: "key_end",
  clear: "key_clear",
};

export function hardwareIdFor(action) {
  if (/^[\d*#]$/.test(action)) return `key_${action === "*" ? "star" : action === "#" ? "hash" : action}`;
  return HARDWARE_BY_ACTION[action] || null;
}

export function isTypingTarget(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("#phone")) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}