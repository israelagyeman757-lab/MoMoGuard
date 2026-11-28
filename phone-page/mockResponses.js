export const DEMO_SCAM_NUMBER = "0244123456";

const SCAM_TYPES = {
  "1": "fake_mtn_rep",
  "2": "pin_otp_request",
  "3": "fake_payment_confirmation",
  "4": "reversal_scam",
  "5": "suspicious_call_message",
  "6": "job_offer",
  "7": "other",
};

export function mockCheckNumber(number) {
  if (!number || number.length < 9) {
    return { result: "INVALID", message: "Invalid number.", disclaimer: "No reports found does not mean safe." };
  }
  if (number === DEMO_SCAM_NUMBER) {
    return {
      result: "WARNING_AVAILABLE",
      message: "Community reports exist. Do not share PIN or OTP.",
      reports_count: 2,
      disclaimer: "No reports found does not mean safe.",
    };
  }
  return {
    result: "NO_REPORTS_FOUND",
    message: "No reports found for this number.",
    reports_count: 0,
    disclaimer: "No reports found does not mean safe.",
  };
}

export function mockWarnings() {
  return {
    warnings: [
      { title: "Fake MTN agents", description: "Do not share your PIN." },
      { title: "Wrong transfer rush", description: "Verify balance first." },
    ],
  };
}

export function mockTrainingQuestions() {
  return {
    questions: [
      {
        id: 1,
        question: "Caller claims MTN and asks PIN. You should?",
        answer_options: ["Give PIN", "End call; use official MTN", "Share code"],
        correct_answer: "End call; use official MTN",
      },
      {
        id: 2,
        question: "Unexpected OTP link. Best action?",
        answer_options: ["Enter code", "Never share OTP", "Forward SMS"],
        correct_answer: "Never share OTP",
      },
    ],
  };
}

export const INITIAL_MESSAGES = [
  {
    id: "scam-1",
    sender: "MTN Support",
    senderNumber: DEMO_SCAM_NUMBER,
    time: "NOW",
    preview: "Confirm wallet: send PIN to verify",
    text: "Dear customer, your MoMo wallet needs verification. Reply with your PIN now or your account closes today.",
    tag: "scam",
    source: "simulated",
  },
  {
    id: "seed-1",
    sender: "MUM",
    time: "08:55",
    preview: "Call me when free",
    text: "Please call me when you are free.",
    tag: "",
    source: "simulated",
  },
];

export const REPORT_TYPE_KEYS = SCAM_TYPES;