import { resolveControllerUrl } from "../shared/controllerUrl.js";

export const CONFIG = {
  MODE: "controller",
  CONTROLLER_URL: resolveControllerUrl(),
  CONTROLLER_TIMEOUT_MS: 8000,
  SIMULATED_DELAY_MS: 700,
};
