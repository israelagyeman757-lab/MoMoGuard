export function softKeysFor(state) {
  const screen = state.screen;
  const scamSelected = state.inbox?.[state.inboxIndex]?.tag === "scam";

  switch (screen) {
    case "boot": return { left: null, right: null };
    case "lock": return { left: "soft.unlock", right: null };
    case "idle": return { left: "soft.menu", right: "soft.names" };
    case "menu": return { left: "soft.open", right: "soft.back" };
    case "inbox": return { left: null, right: "soft.back" };
    case "sms": return { left: state.currentSms?.tag === "scam" ? "soft.report" : null, right: "soft.back" };
    case "contacts":
    case "calllog": return { left: "soft.call", right: "soft.back" };
    case "dialer": return { left: null, right: "soft.back" };
    case "calling": return { left: null, right: "soft.end" };
    case "settings": return { left: "soft.select", right: "soft.back" };
    case "tools": return { left: "soft.select", right: "soft.back" };
    case "calculator": return { left: null, right: "soft.back" };
    case "help":
    case "clockApp": return { left: "soft.ok", right: "soft.back" };
    case "stkCarrier":
    case "stkMomo":
    case "stkScenarios":
    case "stkReportType": return { left: "soft.select", right: "soft.back" };
    case "stkQuestion": return { left: "soft.select", right: "soft.back" };
    case "stkResults":
    case "stkWarnings":
    case "stkTips":
    case "stkHelp": return { left: "soft.select", right: "soft.back" };
    case "stkScenarioDetail":
    case "stkScore":
    case "stkCheckResult":
    case "stkReportDone":
    case "stkError": return { left: "soft.ok", right: "soft.back" };
    case "stkCheckInput":
    case "stkReportNumber":
    case "stkReportDesc":
    case "stkSendAmount": return { left: null, right: "soft.back" };
    case "stkSendPick": return { left: "soft.select", right: "soft.back" };
    case "stkSendDone":
    case "stkWithdrawResult": return { left: "soft.ok", right: "soft.back" };
    case "stkLoading": return { left: null, right: null };
    case "stkPopup": return { left: state.popup?.more ? "soft.more" : null, right: "soft.ok" };
    default: return { left: null, right: "soft.back" };
  }
}