/** LCD corner labels (left = Select/OK, right = Back / Menu). */

export function softKeyLabels(screen, context = {}) {
  switch (screen) {
    case "idle":
      return { left: "Select", right: "Menu" };
    case "lock":
      return { left: "", right: "Unlock" };
    case "apps":
      return { left: "Select", right: "Back" };
    case "messages":
      return { left: "Select", right: "Back" };
    case "sms":
      if (context.scam) return { left: "Report", right: "Back" };
      return { left: "", right: "Back" };
    case "stkCarrier":
    case "stkMomo":
    case "stkReportType":
    case "stkWarnings":
    case "stkTips":
    case "stkHelp":
    case "stkTrainingScenarios":
    case "stkTrainingResults":
      return { left: "Select", right: "Back" };
    case "stkCheckInput":
    case "stkReportNumber":
    case "stkReportDesc":
      return { left: "", right: "Back" };
    case "stkCheckResult":
    case "stkReportDone":
    case "stkTrainingDone":
      return { left: "OK", right: "Back" };
    case "stkTrainingQ":
      return { left: "Select", right: "Back" };
    case "stkPopup":
      return {
        left: context.more ? "More" : "",
        right: "OK",
      };
    case "loading":
      return { left: "", right: "" };
    case "error":
      return { left: "OK", right: "" };
  }
  return { left: "Select", right: "Back" };
}