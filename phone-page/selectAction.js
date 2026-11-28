/** Centre OK and left soft (Select) share one phone action. */

export const SELECT_PHONE_KEY = "ok";

export const SELECT_CONTROL_IDS = new Set(["soft_left", "key_ok"]);

export function isSelectControl(elementId) {
  return SELECT_CONTROL_IDS.has(elementId);
}