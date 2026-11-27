// SIMULATED CONTACTS / TRUST MODEL — for demo use only.
//
// This is the demo-control page's own tiny data model: it decides what a
// contact "looks like" to an operator (saved? trusted? how many times have
// they been in touch?), nothing more. It does not implement any risk logic
// itself — it hands a number and an amount to the live feature-phone page,
// which then goes through the REAL controller (/ussd -> /assess, or
// /check-sms) to decide what happens. The different outcomes you see for
// trusted vs. suspicious contacts come entirely from the controller's own
// simulated bank/call-log/network/reputation signals already seeded for
// these numbers (see CONTRACT.md "Demo accounts" and controller/plugs/*),
// not from anything invented here.
//
// trust: "trusted"   — saved contact, many prior calls/texts/payments.
// trust: "suspicious" — not saved, never contacted before, scam-shaped.

export const SIMULATED_CONTACTS = [
  {
    id: "kofi",
    name: "Kofi",
    number: "0240000002",
    trust: "trusted",
    savedContact: true,
    timesContactedBefore: 48,
    lastContact: "3 days ago",
    note: "Saved contact. Aunty sends him GH\u20B550\u2013100 most weeks (simulated bank history) \u2014 a clean record the controller already treats as low risk.",
    smsTemplate: "Hey Aunty, thanks for the usual top-up! See you Sunday.",
    call: {
      recipient: "0240000002",
      amount: 100,
      ask: "asks Aunty to send him the usual GH\u20B5100 top-up",
    },
  },
  {
    id: "supplier",
    name: "New Supplier",
    number: "0240000006",
    trust: "trusted",
    savedContact: true,
    timesContactedBefore: 6,
    lastContact: "this morning",
    note: "Saved contact; paid Aunty GH\u20B5200 this morning (simulated). Sending a little back reads as a normal send-back, not a risk on its own.",
    smsTemplate: "Hi Aunty, confirming delivery for tomorrow \u2014 same arrangement as always.",
    call: {
      recipient: "0240000006",
      amount: 100,
      ask: "asks Aunty to send GH\u20B5100 towards next week's delivery",
    },
  },
  {
    id: "stranger",
    name: "Unknown number",
    number: "0240000005",
    trust: "suspicious",
    savedContact: false,
    timesContactedBefore: 0,
    lastContact: null,
    note: "Not a saved contact, never contacted before. Simulated: a recent SIM change and a long unknown call right before paying \u2014 two separate risk-signal groups.",
    smsTemplate: "I have sent you GH\u20B5300 by mistake. Please return GH\u20B5200 immediately or I will have to report this.",
    call: {
      recipient: "0240000005",
      amount: 300,
      ask: "claims to have sent money by mistake and asks for GH\u20B5300 back urgently",
    },
  },
  {
    id: "reported",
    name: "Unknown number",
    number: "0240000009",
    trust: "suspicious",
    savedContact: false,
    timesContactedBefore: 0,
    lastContact: null,
    note: "Not a saved contact, never contacted before. Reported several times by other users (simulated Glance reputation).",
    smsTemplate: "CONGRATULATIONS! You have won a MoMo cash grant of GH\u20B55,000. Pay a small processing fee of GH\u20B550 today to claim it.",
    call: {
      recipient: "0240000009",
      amount: 50,
      ask: "claims Aunty won a cash prize and asks for a GH\u20B550 processing fee",
    },
  },
];
