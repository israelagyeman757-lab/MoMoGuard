/** Inline SVG glyphs (Nokia-style, small crisp strokes). */

const S = { fill: "none", stroke: "currentColor", sw: "1.6", cap: "round", join: "round" };

export function iconSignal() {
  return `<svg class="icon icon-signal" viewBox="0 0 16 10" width="16" height="10" aria-hidden="true"><path stroke="${S.stroke}" stroke-width="${S.sw}" stroke-linecap="${S.cap}" d="M1 9V7M4.5 9V5M8 9V3M11.5 9V1"/></svg>`;
}

export function iconBattery() {
  return `<svg class="icon icon-battery" viewBox="0 0 18 9" width="18" height="9" aria-hidden="true"><rect x="1" y="1" width="14" height="7" rx="1" stroke="${S.stroke}" stroke-width="${S.sw}" fill="none"/><path d="M16 3v3h1.5V3H16z" fill="currentColor"/><rect x="2.5" y="2.5" width="10" height="4" fill="currentColor"/></svg>`;
}

export function iconEnvelope() {
  return `<svg class="icon icon-envelope" viewBox="0 0 12 10" width="12" height="10" aria-hidden="true"><path stroke="${S.stroke}" stroke-width="${S.sw}" stroke-linecap="${S.cap}" stroke-linejoin="${S.join}" d="M1 2h10v6H1V2zm0 0 5 4 5-4"/></svg>`;
}

export function iconSim() {
  return `<svg class="icon icon-sim" viewBox="0 0 10 12" width="10" height="12" aria-hidden="true"><path stroke="${S.stroke}" stroke-width="${S.sw}" d="M2 1h5l1 2v8H2V1z"/><path stroke="${S.stroke}" stroke-width="1.2" d="M3 4h4M3 6h4"/></svg>`;
}

export function iconHandset() {
  return `<svg class="icon icon-handset" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6.2 2.8 8.5 5.9l-2.8 2.5c1.4 2.6 3.5 4.7 6.1 6.1l2.5-2.8 3.1 2.3-.9 3.2c-.3.9-1.2 1.4-2.1 1.2-7.2-1.4-12.8-7-14.2-14.2-.1-.9.4-1.8 1.2-2.1l3.2-.9Z"/></svg>`;
}

export function iconHangup() {
  return `<svg class="icon icon-hangup" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" style="transform:rotate(135deg)"><path fill="currentColor" d="M6.2 2.8 8.5 5.9l-2.8 2.5c1.4 2.6 3.5 4.7 6.1 6.1l2.5-2.8 3.1 2.3-.9 3.2c-.3.9-1.2 1.4-2.1 1.2-7.2-1.4-12.8-7-14.2-14.2-.1-.9.4-1.8 1.2-2.1l3.2-.9Z"/></svg>`;
}

export function iconChevron(dir) {
  const paths = { up: "M7 10 10 7 13 10", down: "M7 7 10 10 13 7", left: "M10 7 7 10 10 13", right: "M7 7 10 10 7 13" };
  return `<svg class="icon icon-chev-${dir}" viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${paths[dir]}"/></svg>`;
}

export function iconPlus() {
  return `<svg class="icon icon-plus" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path stroke="currentColor" stroke-width="1.8" d="M6 2v8M2 6h8"/></svg>`;
}

export function iconSpace() {
  return `<svg class="icon icon-space" viewBox="0 0 14 6" width="12" height="6" aria-hidden="true"><rect x="1" y="2" width="12" height="2" rx=".5" fill="currentColor"/></svg>`;
}

export function iconShift() {
  return `<svg class="icon icon-shift" viewBox="0 0 12 10" width="10" height="10" aria-hidden="true"><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M6 1 1 9h10L6 1zm0 3v3"/></svg>`;
}

const MENU_ICONS = {
  stkTrainingScenarios: `<svg viewBox="0 0 12 12" width="12" height="12"><path stroke="currentColor" stroke-width="1.4" d="M2 2h8v8H2zM4 5h4M4 7h4"/></svg>`,
  "loading:training": `<svg viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.4" fill="none"/><path stroke="currentColor" stroke-width="1.4" d="M6 4v2l2 2"/></svg>`,
  stkTrainingResults: `<svg viewBox="0 0 12 12" width="12" height="12"><path stroke="currentColor" stroke-width="1.4" d="M2 9V5M5 9V3M8 9V6"/></svg>`,
  stkCheckInput: `<svg viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="5" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><path stroke="currentColor" stroke-width="1.4" d="M3 10c0-2 1.4-3 3-3s3 1 3 3"/></svg>`,
  stkReportNumber: `<svg viewBox="0 0 12 12" width="12" height="12"><path stroke="currentColor" stroke-width="1.4" d="M6 2v6M4 6h4"/><path stroke="currentColor" stroke-width="1.2" d="M2 10h8"/></svg>`,
  "loading:warnings": `<svg viewBox="0 0 12 12" width="12" height="12"><path stroke="currentColor" stroke-width="1.4" d="M6 2 11 10H1z"/><path stroke="currentColor" stroke-width="1.4" d="M6 5v3"/></svg>`,
  stkTips: `<svg viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.4" fill="none"/><path stroke="currentColor" stroke-width="1.4" d="M6 4.5v3"/></svg>`,
  stkHelp: `<svg viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.4" fill="none"/><path stroke="currentColor" stroke-width="1.3" d="M5 5a1.5 1.5 0 1 1 2.6 1c-.8.5-1 1-1 1.5v.5"/></svg>`,
  exit: `<svg viewBox="0 0 12 12" width="12" height="12"><path stroke="currentColor" stroke-width="1.4" d="M3 6h6M7 4l2 2-2 2"/></svg>`,
  stkMomo: iconSim(),
};

export function menuItemIcon(item) {
  if (typeof item === "object" && item?.id && MENU_ICONS[item.id]) {
    return `<span class="stk-list-icon" aria-hidden="true">${MENU_ICONS[item.id]}</span>`;
  }
  return `<span class="stk-list-icon stk-list-icon--dot" aria-hidden="true"></span>`;
}