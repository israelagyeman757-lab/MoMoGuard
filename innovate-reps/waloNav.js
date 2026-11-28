/** Walo app navigation: launch animation phase + in-app views (menu, report, lookup, profile). */

export const WALO_VIEWS = ["menu", "report", "lookup", "profile"];
export const WALO_LAUNCH_MS = 380;

export class WaloNav {
  constructor() {
    this.phase = "closed";
    this.view = "menu";
    this._launchToken = 0;
  }

  openFromDock() {
    this.phase = "launching";
    this.view = "menu";
    this._launchToken += 1;
    return this._launchToken;
  }

  finishLaunch(token) {
    if (token !== this._launchToken || this.phase !== "launching") return false;
    this.phase = "open";
    return true;
  }

  openView(view) {
    if (this.phase !== "open" || !WALO_VIEWS.includes(view)) return false;
    this.view = view;
    return true;
  }

  backToMenu() {
    if (this.phase !== "open") return false;
    this.view = "menu";
    return true;
  }

  close() {
    this.phase = "closed";
    this.view = "menu";
  }

  isLaunching() {
    return this.phase === "launching";
  }

  isOpen() {
    return this.phase === "open";
  }
}