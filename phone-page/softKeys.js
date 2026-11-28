/** Context labels for the on-screen soft keys (left = back, right = ok). */
export function softKeyLabels(screen) {
  switch (screen) {
    case "idle":
      return { left: "—", right: "Menu" };
    case "apps":
      return { left: "Back", right: "Open" };
    case "ussd":
    case "recipient":
    case "amount":
    case "reportNumber":
    case "simToolkitLookup":
    case "simToolkitReport":
    case "simToolkitReportIdentity":
    case "server":
      return { left: "Back", right: "OK" };
    case "messages":
      return { left: "Back", right: "Read" };
    case "sms":
      return { left: "Back", right: "—" };
    case "main":
    case "simToolkit":
    case "language":
    case "reportType":
    case "simToolkitReportType":
    case "simToolkitReportLost":
      return { left: "Back", right: "—" };
    case "confirm":
    case "bigConfirm":
    case "simToolkitCommunityFraud":
      return { left: "Back", right: "—" };
    case "incomingCall":
    case "demoCall":
      return { left: "Back", right: "Answer" };
    case "pin":
    case "simToolkitCommunityFraudPin":
      return { left: "Back", right: "OK" };
    case "voiceAudio":
      return { left: "—", right: "—" };
  }
  return { left: "Back", right: "OK" };
}