/** STK list menus (no digit prefixes — navigation is highlight + OK). */

export const CARRIER_MENU = [
  { id: "stkMomo", label: "MoMoGuard" },
];

export const MOMO_MENU = [
  { id: "stkTrainingScenarios", label: "Training scenarios" },
  { id: "loading:training", label: "Quick quiz" },
  { id: "stkTrainingResults", label: "My results" },
  { id: "stkCheckInput", label: "Check number" },
  { id: "stkReportNumber", label: "Report scam" },
  { id: "loading:warnings", label: "Latest warnings" },
  { id: "stkTips", label: "Safety tips" },
  { id: "stkHelp", label: "Help" },
  { id: "exit", label: "Exit" },
];

export const REPORT_TYPES = [
  { label: "Fake MTN rep", scam_type: "fake_mtn_rep" },
  { label: "PIN / OTP request", scam_type: "pin_otp_request" },
  { label: "Fake payment", scam_type: "fake_payment_confirmation" },
  { label: "Reversal scam", scam_type: "reversal_scam" },
  { label: "Suspicious call/SMS", scam_type: "suspicious_call_message" },
  { label: "Job offer", scam_type: "job_offer" },
  { label: "Other", scam_type: "other" },
];