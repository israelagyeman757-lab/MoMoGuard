/** Context labels for the on-screen soft keys (left = back, right = ok). */
export function softKeyLabels(screen) {
  switch (screen) {
    case "idle":
      return { left: "—", right: "Menu" };
    case "lock":
      return { left: "—", right: "Unlock" };
    case "apps":
      return { left: "Back", right: "Open" };
    case "messages":
      return { left: "Back", right: "Read" };
    case "sms":
      return { left: "Back", right: "—" };
    case "stkCarrier":
    case "stkMomo":
    case "stkReportType":
    case "stkWarnings":
    case "stkHelp":
      return { left: "Back", right: "—" };
    case "stkCheckInput":
    case "stkReportNumber":
    case "stkReportDesc":
      return { left: "Back", right: "OK" };
    case "stkCheckResult":
    case "stkReportDone":
    case "stkTrainingDone":
    case "stkTrainingQ":
      return { left: "Back", right: "OK" };
    case "loading":
      return { left: "—", right: "—" };
    case "error":
      return { left: "—", right: "OK" };
  }
  return { left: "Back", right: "OK" };
}