export function getPaymentPreview(recipient, amount, bigConfirmed = false) {
  const value = Number(amount);
  if (bigConfirmed) {
    return { screen: "sent", message: `Sent GH₵${value.toLocaleString()} to Kofi.` };
  }
  if (recipient === "0240000002" && value >= 5000) {
    return {
      screen: "bigConfirm",
      confirm: { usual: 100, new: value, in_words: "seven thousand cedis" },
    };
  }
  if (recipient === "0240000005") {
    return {
      screen: "blocked",
      message: "This payment was stopped. It may be a trick. Nothing was sent.",
    };
  }
  if (recipient === "0240000007") {
    return {
      screen: "paused",
      message: "Payment paused before sending. A safety call is coming.",
    };
  }
  if (recipient === "0240000006" && value >= 250) {
    return {
      screen: "caution",
      message: "This may be a new number. Please be sure you know who you are paying.",
    };
  }
  return {
    screen: "sent",
    message: `Sent GH₵${value.toLocaleString()} to ${recipient}.`,
  };
}

export function getNumberPreview(number) {
  if (number === "0240000009") {
    return {
      numberStatus: "reports",
      message: "3 reports found. This may be a warning sign, not proof it is unsafe.",
    };
  }
  if (number === "0240000004") {
    return {
      numberStatus: "unavailable",
      message: "Could not check this number. This is not proof it is safe or unsafe.",
    };
  }
  return {
    numberStatus: "unreported",
    message: "No reports found. This is not proof it is safe.",
  };
}

export const INITIAL_MESSAGES = [
  {
    id: "fake-deposit",
    sender: "UNKNOWN NUMBER",
    senderNumber: "0240000005",
    time: "NOW",
    preview: "I sent you GH₵300. Return GH₵200 now.",
    text: "I sent you GH₵300. Return GH₵200 now.",
    warning: "This may be a fake deposit. Check your balance first. A warning, not proof.",
    tag: "possible_fake",
    source: "simulated",
  },
  {
    id: "seed-receipt",
    sender: "MoMo",
    time: "09:20",
    preview: "Payment of GH₵50 to 0240000002 was successful.",
    text: "Payment of GH₵50 to 0240000002 was successful. This is a simulated receipt.",
    tag: "transaction",
    source: "simulated",
  },
  {
    id: "kofi-thanks",
    sender: "KOFI",
    time: "08:55",
    preview: "I received the money. Thank you.",
    text: "I received the money. Thank you.",
    source: "simulated",
  },
  {
    id: "mum-call",
    sender: "MUM",
    time: "YESTERDAY",
    preview: "Please call me when you are free.",
    text: "Please call me when you are free.",
    source: "simulated",
  },
  {
    id: "safety-reminder",
    sender: "MOMOGUARD",
    time: "MON",
    preview: "Check the number before you send money.",
    text: "Safety reminder: check the number before you send money. No reports is not proof it is safe.",
    source: "simulated",
  },
];

let receiptSequence = 0;

export function makeTransactionMessage(recipient, amount) {
  const value = Number(amount).toLocaleString();
  receiptSequence += 1;
  return {
    id: `txn-${receiptSequence}`,
    sender: "MoMo",
    time: "NOW",
    preview: `Payment of GH₵${value} to ${recipient} was successful.`,
    text: `Payment of GH₵${value} to ${recipient} was successful. This is a simulated receipt.`,
    tag: "transaction",
    source: "simulated",
  };
}

export function makeControllerReceiptMessage(text) {
  receiptSequence += 1;
  return {
    id: `txn-${receiptSequence}`,
    sender: "MoMo",
    time: "NOW",
    preview: text,
    text,
    tag: "transaction",
    source: "simulated",
  };
}
