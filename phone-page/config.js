import { resolveControllerUrl } from "../shared/controllerUrl.js";

export const CONFIG = {
  MODE: "controller",
  CONTROLLER_URL: resolveControllerUrl(),
  CONTROLLER_TIMEOUT_MS: 5000,
  SIMULATED_DELAY_MS: 0,
  BOOT_MS: 1500,
  STK_POLL_MS: 10000,
  KEY_FLASH_MS: 45,
  T9_TAP_MS: 800,
  INCOMING_CALL_DELAY_MS: 1200,
  VOICE_AUDIO_MS: 4500,
};
