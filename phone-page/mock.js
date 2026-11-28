const DISCLAIMER = "No reports found does not mean safe.";

export const INBOX = [
  {
    id: "scam-mtn",
    from: "MTN Support",
    number: "0244123456",
    tag: "scam",
    text: "Dear customer, your MoMo wallet needs verification. Reply with your PIN now or your account closes today.",
  },
  {
    id: "mum",
    from: "MUM",
    number: "",
    tag: "plain",
    text: "Please call me when you are free.",
  },
];

const SCENARIOS = [
  {
    id: 1,
    title: "Fake MTN agent call",
    description: "Caller claims to be MTN and requests your PIN.",
    scam_category: "impersonation",
    explanation: "MTN staff never ask for your PIN or OTP.",
  },
  {
    id: 2,
    title: "Wrong transfer pressure",
    description: "Stranger insists you reverse money you never received.",
    scam_category: "reversal_scams",
    explanation: "Verify your balance; do not rush transfers.",
  },
  {
    id: 3,
    title: "Fake job fee",
    description: "WhatsApp recruiter demands registration fee via MoMo.",
    scam_category: "fake_jobs",
    explanation: "Legitimate jobs do not charge upfront registration via MoMo.",
  },
];

const QUESTIONS = [
  {
    id: 1,
    scenario_id: null,
    question: "A caller says they are from MTN and asks for your MoMo PIN to fix your account. What should you do?",
    answer_options: [
      "Give your PIN",
      "Follow their steps",
      "End the call and use official MTN channels",
      "Send a small test amount",
    ],
    correct_answer: "End the call and use official MTN channels",
    explanation: "Review lessons on fake agents.",
    scam_category: "fake_agents",
    assessment_tag: "pre",
  },
  {
    id: 2,
    scenario_id: null,
    question: "A text says you won a prize but must pay a fee first. What should you do?",
    answer_options: [
      "Pay the fee quickly",
      "Reply with your details",
      "Ignore it and never share codes",
      "Send a small amount to test",
    ],
    correct_answer: "Ignore it and never share codes",
    explanation: "Prizes that ask for money first are a common trick.",
    scam_category: "fake_jobs",
    assessment_tag: "pre",
  },
];

const WARNINGS = [
  {
    id: 1,
    title: "Fake MTN agents",
    description: "Do not share your PIN.",
    scam_type: "fake_mtn_rep",
    status: "published",
    created_at: "2026-11-28T08:00:00",
    published_at: "2026-11-28T08:05:00",
  },
  {
    id: 2,
    title: "Wrong transfer rush",
    description: "Check your balance before sending anything back.",
    scam_type: "reversal_scam",
    status: "published",
    created_at: "2026-11-27T17:10:00",
    published_at: "2026-11-27T17:20:00",
  },
];

const PUSH_TEXT = "High-risk reversal scam active in your area. Do not send money to unknown callers.";

let attemptSequence = 0;
const mockHolds = new Map();

function mockHoldEvaluate(body) {
  const payer = body.payer || "";
  const payee = body.payee || "";
  const amount = Number(body.amount || 0);
  const paymentsBefore = body.payments_from_payer_before;
  const newPair =
    paymentsBefore === 0 || paymentsBefore === "0" || payee === "0245000111";
  const flagged = payee === "0244123456";
  let minutes = 0;
  let risk = "LOW";
  const reasons = [];
  if (flagged) {
    minutes = 1440;
    risk = "HIGH";
    reasons.push("flagged_high");
  } else if (newPair) {
    minutes = amount > 500 ? 120 : 30;
    risk = "MEDIUM";
    reasons.push("new_number_pair");
    if (amount > 500) reasons.push("amount_above_500_ghs");
  }
  const hold = minutes > 0;
  const releaseAt = hold
    ? new Date(Date.now() + minutes * 60_000).toISOString().slice(0, 19)
    : null;
  if (hold) {
    mockHolds.set(payee || "0244111222", {
      release_at: releaseAt,
      reasons,
      amount,
    });
  }
  const reason_labels = {
    en: reasons
      .map(code => ({
        new_number_pair: "First payment from this number to you",
        flagged_high: "Number reported to Walɔ",
        amount_above_500_ghs: "Large amount (over GHS 500)",
      })[code])
      .filter(Boolean)
      .join("; ") || "Funds temporarily held by Walɔ",
    tw: reasons
      .map(code => ({
        new_number_pair: "Ɛnyɛ daa sika a wɔde aba wo nɔma yi so",
        flagged_high: "Wɔde nɔma no amanneɛ ama Walɔ",
        amount_above_500_ghs: "Sika dodow (GHS 500 so)",
      })[code])
      .filter(Boolean)
      .join("; ") || "Walɔ agye sika no daa kakra",
  };
  return {
    ok: true,
    data: {
      hold,
      minutes,
      risk_level: risk,
      reason_labels,
      hold_id: hold ? 1 : null,
    },
  };
}

function mockWithdrawCheck(phone) {
  const row = mockHolds.get(phone);
  if (!row) return { ok: true, data: { allow: true } };
  const codes = row.reasons || [];
  return {
    ok: true,
    data: {
      allow: false,
      release_at: row.release_at,
      reason_labels: {
        en: codes
          .map(c => ({
            new_number_pair: "First payment from this number to you",
            flagged_high: "Number reported to Walɔ",
          })[c])
          .filter(Boolean)
          .join("; ") || "Funds temporarily held by Walɔ",
        tw: "Walɔ agye sika no daa kakra",
      },
      amount: row.amount,
    },
  };
}

function validNumber(number) {
  return /^0\d{9}$/.test(number || "");
}

export function checkNumber(phone) {
  if (!validNumber(phone)) {
    return {
      ok: true,
      data: {
        result: "INVALID",
        message: "Enter a valid number, for example 0244123456.",
        reports_count: 0,
        warnings: [],
        phone_number: phone || "",
        number_status: "unknown",
        source: "walo_db",
        disclaimer: DISCLAIMER,
      },
    };
  }
  if (phone === "0244123456") {
    return {
      ok: true,
      data: {
        result: "WARNING_AVAILABLE",
        message: "A community warning is available for this type of scam. Do not share your PIN or OTP. Contact MTN through official channels only.",
        reports_count: 2,
        warnings: [],
        phone_number: phone,
        number_status: "unknown",
        source: "walo_db",
        disclaimer: DISCLAIMER,
      },
    };
  }
  return {
    ok: true,
    data: {
      result: "NO_REPORTS_FOUND",
      message: "No community reports were found for this number.",
      reports_count: 0,
      warnings: [],
      phone_number: phone,
      number_status: "unknown",
      source: "walo_db",
      disclaimer: DISCLAIMER,
    },
  };
}

export function submitReport(body) {
  return {
    ok: true,
    data: {
      id: 3,
      reporter_id: "[hidden]",
      phone_number: body.phone_number || "",
      scam_type: body.scam_type,
      description: body.description || "Reported via SIM Toolkit",
      loss_reported: null,
      status: "UNVERIFIED",
      created_at: "2026-11-28T09:20:00",
    },
  };
}

export function getWarnings() {
  return { ok: true, data: { warnings: WARNINGS, source: "walo_db" } };
}

export function getTrainingScenarios() {
  return { ok: true, data: { scenarios: SCENARIOS } };
}

export function getTrainingScenario(id) {
  const scenario = SCENARIOS.find(item => String(item.id) === String(id));
  return scenario ? { ok: true, data: scenario } : { ok: false, error: "http_404" };
}

export function getTrainingQuestions() {
  return { ok: true, data: { questions: QUESTIONS } };
}

export function submitTrainingAttempt(body) {
  const answers = body.answers || [];
  let correct = 0;
  for (const answer of answers) {
    const question = QUESTIONS.find(item => item.id === answer.question_id);
    if (question && answer.selected_answer === question.correct_answer) correct += 1;
  }
  const total = answers.length;
  attemptSequence += 1;
  return {
    ok: true,
    data: {
      attempt_id: attemptSequence,
      user_id: body.user_id,
      assessment_type: body.assessment_type,
      score: total ? Math.round((correct / total) * 1000) / 10 : 0,
      total_questions: total,
      correct,
      completed_at: "2026-11-28T09:15:00",
    },
  };
}

export function getTrainingResults(userId) {
  return {
    ok: true,
    data: {
      user_id: userId,
      history: [
        {
          id: 1,
          user_id: userId,
          assessment_type: "pre",
          score: 100.0,
          total_questions: 2,
          completed_at: "2026-11-28T09:15:00",
        },
      ],
      stats: {
        by_assessment_type: { pre: { avg_score: 100.0, count: 1 } },
        users_completed_both: 0,
        average_improvement_pp: 0.0,
        most_missed_categories: [],
      },
    },
  };
}

export function getTrainingRecommendations(userId) {
  return {
    ok: true,
    data: { user_id: userId, recommendations: [] },
  };
}

export function pollStkPush() {
  return { ok: true, data: { pending: false } };
}

export function enqueueStkPush() {
  return { ok: true, data: { id: "mock-tip", text: PUSH_TEXT, more: true, report: true } };
}

export function stkPushPayload() {
  return { id: "mock-tip", text: PUSH_TEXT, more: true, report: true, pending: true };
}

export function resetDemo() {
  mockHolds.clear();
  return { ok: true, data: { status: "ok", message: "Demo reset to starting state." } };
}

export function evaluateHold(body) {
  return Promise.resolve(mockHoldEvaluate(body));
}

export function withdrawCheck(phone) {
  return Promise.resolve(mockWithdrawCheck(phone));
}

export const QUIZ_CORRECT = QUESTIONS.map(question => question.correct_answer);