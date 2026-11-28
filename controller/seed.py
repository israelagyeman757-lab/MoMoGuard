"""Fictional demo seed data for the 8-step hackathon story."""

from __future__ import annotations

from typing import Any

DEMO_SCAM_NUMBER = "0244123456"

_PRE_QUESTIONS = [
    ("fake_agents", "A caller says they are from MTN and asks for your MoMo PIN to fix your account. What should you do?", ["Give your PIN", "Follow their steps", "End the call and use official MTN channels", "Send a small test amount"], "End the call and use official MTN channels"),
    ("pin_otp_requests", "You receive an SMS with a one-time code and a link asking you to confirm a payment. You did not start any payment. Best action?", ["Enter the code on the link", "Share the code with the sender", "Ignore it and never share codes", "Call the number in the SMS"], "Ignore it and never share codes"),
    ("fake_payment_confirmations", "Someone sends a screenshot showing money was sent to you, but your balance did not change. They ask you to send goods. What now?", ["Ship the goods quickly", "Ask for another screenshot", "Check your MoMo balance yourself before acting", "Send a refund"], "Check your MoMo balance yourself before acting"),
    ("reversal_scams", "A stranger says they sent money to you by mistake and asks you to send it back urgently. You see no credit. You should:", ["Send back immediately", "Send half to be safe", "Do not send; verify with your own balance and MTN", "Give them your PIN to verify"], "Do not send; verify with your own balance and MTN"),
    ("impersonation", "A voice message claims to be your bank and asks you to press 1 to avoid account closure.", ["Press 1 quickly", "Call back the number shown", "Hang up and call your bank using the number on your card", "Share your account number"], "Hang up and call your bank using the number on your card"),
    ("fake_jobs", "A job offer on WhatsApp requires a registration fee via MoMo before an interview.", ["Pay the fee — jobs are competitive", "Pay after the interview", "Refuse fees; verify the employer through official channels", "Share ID and PIN for verification"], "Refuse fees; verify the employer through official channels"),
    ("suspicious_calls_messages", "An unknown number says your relative is in trouble and needs urgent MoMo transfer.", ["Send money immediately", "Ask for their PIN", "Verify the story by calling your relative on a number you know", "Forward the message to friends"], "Verify the story by calling your relative on a number you know"),
    ("fake_agents", "An agent offers to double your MoMo balance if you send money to a promo number.", ["Try with a small amount", "Share PIN for faster processing", "Decline — legitimate MTN promos never ask for PIN or upfront sends", "Forward to friends"], "Decline — legitimate MTN promos never ask for PIN or upfront sends"),
    ("pin_otp_requests", "A website popup asks for your MoMo OTP while you browse.", ["Enter OTP to continue", "Screenshot and send to a friend", "Close the page; never enter OTP on untrusted sites", "Refresh and try again"], "Close the page; never enter OTP on untrusted sites"),
    ("reversal_scams", "You receive money, then a message says it was a wrong number and asks for instant reversal with a fee.", ["Reverse plus fee", "Keep the money", "Contact MTN; do not rush transfers to strangers", "Share PIN to speed reversal"], "Contact MTN; do not rush transfers to strangers"),
]

_POST_QUESTIONS = [
    ("impersonation", "Someone calls claiming to be MTN support and needs your PIN to unlock MoMo. Safest response?", ["Provide PIN", "Give last 4 digits", "Hang up; MTN never asks for PIN", "Transfer GH₵1 to verify"], "Hang up; MTN never asks for PIN"),
    ("fake_payment_confirmations", "Buyer shows a fake receipt before you deliver. What checks first?", ["Trust the screenshot", "Your real MoMo balance and SMS from MTN", "Their ID card photo", "Their friend's number"], "Your real MoMo balance and SMS from MTN"),
    ("fake_jobs", "Recruiter demands MoMo payment for training materials.", ["Pay to secure the job", "Borrow and pay", "Reject; real employers do not charge upfront via MoMo", "Share bank details"], "Reject; real employers do not charge upfront via MoMo"),
    ("suspicious_calls_messages", "Text says your account will be closed unless you click a link and login.", ["Click and login", "Forward to family", "Delete; use official app or branch", "Reply with account number"], "Delete; use official app or branch"),
    ("fake_agents", "Street agent offers to register MoMo and asks to watch you enter PIN.", ["Allow — they are helping", "Enter PIN quickly", "Refuse; never enter PIN when others watch", "Give phone to them"], "Refuse; never enter PIN when others watch"),
    ("pin_otp_requests", "Caller asks you to read the OTP aloud to complete a transfer you did not start.", ["Read it", "Read half", "Refuse; never share OTP", "Ask them to call back"], "Refuse; never share OTP"),
    ("reversal_scams", "Urgent wrong-transfer message with pressure to send back before police come.", ["Send back fast", "Send to a new number they give", "Pause; verify balance and report suspicious contact", "Block your SIM"], "Pause; verify balance and report suspicious contact"),
    ("impersonation", "Email mimics MTN logo asking to confirm wallet via a form.", ["Fill the form", "Use the link in the email", "Go to MTN app or official site yourself", "Email your PIN"], "Go to MTN app or official site yourself"),
    ("fake_payment_confirmations", "Customer claims payment sent but asks you to release goods before you see credit.", ["Release — they seem honest", "Wait until your balance shows the credit", "Ask for their PIN", "Send a refund first"], "Wait until your balance shows the credit"),
    ("suspicious_calls_messages", "Unknown WhatsApp contact shares investment returns and asks for MoMo deposit.", ["Invest a little", "Share PIN for faster returns", "Ignore; treat as likely scam", "Add to family group"], "Ignore; treat as likely scam"),
]


def seed_demo(store: Any, *, reset: bool = True) -> None:
    if reset:
        store.reset()
    store.upsert_user("mod-001", "Demo Moderator", "moderator")
    store.upsert_user("train-user-1", "Ama", "user")
    store.upsert_user("reporter-1", "Kwesi", "user")
    store.upsert_user("reporter-2", "Efua", "user")

    for i, (cat, q, opts, correct) in enumerate(_PRE_QUESTIONS, 1):
        store.insert_question(
            {
                "question": q,
                "answer_options": opts,
                "correct_answer": correct,
                "scam_category": cat,
                "assessment_tag": "pre",
                "explanation": f"Review lessons on {cat.replace('_', ' ')}.",
            }
        )
    for cat, q, opts, correct in _POST_QUESTIONS:
        store.insert_question(
            {
                "question": q,
                "answer_options": opts,
                "correct_answer": correct,
                "scam_category": cat,
                "assessment_tag": "post",
                "explanation": f"Review lessons on {cat.replace('_', ' ')}.",
            }
        )

    scenarios = [
        ("Fake MTN agent call", "Caller claims to be MTN and requests your PIN.", "impersonation", "MTN staff never ask for your PIN or OTP."),
        ("Wrong transfer pressure", "Stranger insists you reverse money you never received.", "reversal_scams", "Verify your balance; do not rush transfers."),
        ("Fake job fee", "WhatsApp recruiter demands registration fee via MoMo.", "fake_jobs", "Legitimate jobs do not charge upfront registration via MoMo."),
    ]
    for title, desc, cat, expl in scenarios:
        store.insert_scenario(
            {"title": title, "description": desc, "scam_category": cat, "explanation": expl}
        )

    store.insert_report(
        {
            "reporter_id": "reporter-1",
            "phone_number": DEMO_SCAM_NUMBER,
            "scam_type": "fake_mtn_rep",
            "description": "Caller claimed to be MTN and asked for my MoMo PIN to fix my account.",
            "loss_reported": False,
        }
    )
    store.insert_report(
        {
            "reporter_id": "reporter-2",
            "phone_number": DEMO_SCAM_NUMBER,
            "scam_type": "fake_mtn_rep",
            "description": "Same tactic: fake MTN agent demanded PIN to unlock wallet.",
            "loss_reported": False,
        }
    )
    for r in store.list_reports(phone_number=DEMO_SCAM_NUMBER):
        store.update_report_status(r["id"], "CORROBORATED")

    seed_demo_holds(store)


DEMO_WALLET_MSISDN = "0244111222"

DEMO_HOLD_SPECS = (
    {
        "payer": "0245000111",
        "payee": DEMO_WALLET_MSISDN,
        "amount": 100,
        "risk_level": "MEDIUM",
        "reasons": ["new_number_pair"],
        "hold_minutes": 30,
    },
    {
        "payer": "0244888100",
        "payee": DEMO_SCAM_NUMBER,
        "amount": 350,
        "risk_level": "HIGH",
        "reasons": ["flagged_high"],
        "hold_minutes": 1440,
    },
)


def seed_demo_holds(store: Any) -> None:
    """Exactly two distinct demo holds; idempotent via replace-by-demo-pair."""
    if not hasattr(store, "insert_hold"):
        return
    if hasattr(store, "replace_demo_holds"):
        store.replace_demo_holds(DEMO_HOLD_SPECS)
        return
    pairs = [(s["payer"], s["payee"]) for s in DEMO_HOLD_SPECS]
    if hasattr(store, "delete_holds_for_pairs"):
        store.delete_holds_for_pairs(pairs)
    for spec in DEMO_HOLD_SPECS:
        store.insert_hold(spec)


def ensure_demo_holds(store: Any) -> None:
    if not hasattr(store, "insert_hold"):
        return
    pairs = {(s["payer"], s["payee"]) for s in DEMO_HOLD_SPECS}
    held = store.list_holds(status="held") if hasattr(store, "list_holds") else []
    matching = [h for h in held if (h.get("payer"), h.get("payee")) in pairs]
    if len(matching) == 2:
        return
    seed_demo_holds(store)


def ensure_demo_seed(store: Any) -> None:
    """Load fictional demo data once (idempotent for durable Supabase startup)."""
    if store.get_user("mod-001"):
        ensure_demo_holds(store)
        return
    seed_demo(store, reset=False)