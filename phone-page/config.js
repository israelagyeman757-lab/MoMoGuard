import { resolveControllerUrl } from "../shared/controllerUrl.js";

export const CONFIG = {
  MODE: "controller",
  CONTROLLER_URL: resolveControllerUrl(),
  CONTROLLER_TIMEOUT_MS: 5000,
  SIMULATED_DELAY_MS: 700,
  INCOMING_CALL_DELAY_MS: 1200,
  VOICE_AUDIO_MS: 4500,
};
