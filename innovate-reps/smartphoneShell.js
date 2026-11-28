/** Home screen + full-screen app navigation for the Innovate Reps smartphone simulator. */

export const DOCK_APPS = [
  { id: "phone", label: "Phone", icon: "phone" },
  { id: "messages", label: "Messages", icon: "messages" },
  { id: "walo", label: "Walo", icon: "walo" },
];

export class SmartphoneShell {
  constructor() {
    this.activeApp = null;
  }

  openApp(appId) {
    if (!DOCK_APPS.some(app => app.id === appId)) return false;
    this.activeApp = appId;
    return true;
  }

  goHome() {
    this.activeApp = null;
  }

  isHome() {
    return this.activeApp === null;
  }
}