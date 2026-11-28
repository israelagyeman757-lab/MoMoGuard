export const APPS = [
  { id: "messages", labelKey: "app.messages", icon: "message" },
  { id: "contacts", labelKey: "app.contacts", icon: "contacts" },
  { id: "calllog", labelKey: "app.calllog", icon: "calllog" },
  { id: "stk", labelKey: "app.stk", icon: "sim" },
  { id: "meda", labelKey: "app.meda", icon: "meda" },
  { id: "settings", labelKey: "app.settings", icon: "gear" },
  { id: "clock", labelKey: "app.clock", icon: "clock" },
  { id: "tools", labelKey: "app.tools", icon: "tools" },
  { id: "help", labelKey: "app.help", icon: "help" },
];

export const STK_MENU = [
  { id: "training", labelKey: "stk.training" },
  { id: "quiz", labelKey: "stk.quiz" },
  { id: "results", labelKey: "stk.results" },
  { id: "check", labelKey: "stk.check" },
  { id: "report", labelKey: "stk.report" },
  { id: "warnings", labelKey: "stk.warnings" },
  { id: "tips", labelKey: "stk.tips" },
  { id: "help", labelKey: "stk.help" },
  { id: "exit", labelKey: "stk.exit" },
];

export const REPORT_TYPES = [
  { value: "fake_mtn_rep", labelKey: "reportType.fakeMtnRep" },
  { value: "pin_otp_request", labelKey: "reportType.pinOtp" },
  { value: "fake_payment_confirmation", labelKey: "reportType.fakePayment" },
  { value: "reversal_scam", labelKey: "reportType.reversal" },
  { value: "suspicious_call_message", labelKey: "reportType.suspicious" },
  { value: "job_offer", labelKey: "reportType.jobOffer" },
  { value: "other", labelKey: "reportType.other" },
];

export const CONTACTS = [
  { name: "MUM", number: "" },
  { name: "Unknown", number: "0244123456" },
];

export const CALL_LOG = [
  { name: "MUM", number: "", typeKey: "calllog.received", time: "08:12" },
  { name: "Unknown", number: "0244123456", typeKey: "calllog.missed", time: "Yesterday" },
  { name: "Unknown", number: "0244123456", typeKey: "calllog.dialled", time: "Yesterday" },
];

export const TIPS = ["tips.one", "tips.two", "tips.three"];