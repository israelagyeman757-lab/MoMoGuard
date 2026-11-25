"""Message Intelligence Agent: warn-only SMS check (module inside the controller).

Never deletes, blocks, or holds a message. Any error fails open:
{"checker_status": "not_checked", "recommended_action": "allow"}.
Ledger matching is "unavailable" in this build (classifier-only until the
sandbox DataPlug lands). No encryption, no signature verification.
"""

import re

_MODEL = None

_FINANCIAL_HINT = re.compile(
    r"(gh[₵s¢]|cedis|momo|mobile money|account|\bpin\b|\botp\b|prize|fee|"
    r"transfer|sent|received|deposit|revers|refund|balance|loan|grant|bank)",
    re.IGNORECASE,
)
_AMOUNT = re.compile(
    r"(?:GH₵|GHS|GH¢)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*cedis",
    re.IGNORECASE,
)
_CLAIMS_SENT = re.compile(
    r"(i have sent|i sent|i have transferred|i paid you|sent you|by mistake|"
    r"has been reversed|was reversed|has been cancelled)", re.IGNORECASE)
_REQUEST_RETURN = re.compile(r"(return|send it back|refund|send .{0,20}back)", re.IGNORECASE)
_URGENCY = re.compile(
    r"(immediately|urgently|right now|\bnow\b|today|end of day|act now|"
    r"final warning|before)", re.IGNORECASE)
_CREDENTIAL = re.compile(r"\b(pin|otp|code)\b", re.IGNORECASE)
_CREDENTIAL_ASK = re.compile(r"(send|share|reply|confirm|verify|enter)", re.IGNORECASE)
_CLAIMS_OFFICIAL = re.compile(
    r"(mtn|bank|government|agent|head office)", re.IGNORECASE)
_ADVANCE_FEE = re.compile(
    r"(prize|won|processing fee|release fee|registration fee|clearance fee|"
    r"delivery fee|grant|loan)", re.IGNORECASE)


def _get_model():
    global _MODEL
    if _MODEL is None:
        from pathlib import Path

        import joblib

        from controller.message_agent.train import MODEL_PATH, build_pipeline
        from controller.message_agent.dataset import DATASET

        if Path(MODEL_PATH).exists():
            _MODEL = joblib.load(MODEL_PATH)
        else:
            _MODEL = build_pipeline()
            _MODEL.fit([t for t, _ in DATASET],
                       [1 if lab == "scam" else 0 for _, lab in DATASET])
    return _MODEL


def _classify(text: str) -> tuple[bool, float]:
    model = _get_model()
    prob = float(model.predict_proba([text])[0][1])
    return prob >= 0.5, prob


def _extract_amount(text: str) -> float | None:
    match = _AMOUNT.search(text)
    if not match:
        return None
    raw = match.group(1) or match.group(2)
    return float(raw.replace(",", ""))


def _labels(text: str) -> list[str]:
    labels = []
    claims_sent = bool(_CLAIMS_SENT.search(text))
    request_return = bool(_REQUEST_RETURN.search(text))
    credential = bool(_CREDENTIAL.search(text)) and bool(_CREDENTIAL_ASK.search(text))
    official = bool(_CLAIMS_OFFICIAL.search(text))
    if claims_sent and request_return:
        labels.append("possible_fake_deposit")
    if request_return:
        labels.append("request_to_return_money")
    if _URGENCY.search(text):
        labels.append("urgency")
    if official and credential:
        labels.append("possible_impersonation")
    if credential:
        labels.append("credential_theft")
    if _ADVANCE_FEE.search(text):
        labels.append("possible_advance_fee")
    return labels


_WARNINGS = {
    "possible_fake_deposit":
        "Pause before sending. This message may be a fake deposit claim. "
        "Check your MoMo balance yourself first. A warning, not proof.",
    "possible_impersonation":
        "Pause before sending. Someone may be pretending to be MTN, a bank or "
        "the government. Never share your PIN or code. A warning, not proof.",
    "credential_theft":
        "Pause before sending. This message asks for your PIN or code. "
        "Never share it with anyone. A warning, not proof.",
    "possible_advance_fee":
        "Pause before sending. This may be an advance-fee trick: a prize, job "
        "or loan that asks for money first. A warning, not proof.",
    "generic":
        "Pause before sending. This message may be a trick to get your money. "
        "Check with someone you trust. A warning, not proof.",
}


def _warning_for(labels: list[str]) -> str:
    for key in ("possible_fake_deposit", "possible_impersonation",
                "credential_theft", "possible_advance_fee"):
        if key in labels:
            return _WARNINGS[key]
    return _WARNINGS["generic"]


def assess_message(msg: dict) -> dict:
    try:
        return _assess(msg)
    except Exception:
        return {"checker_status": "not_checked", "recommended_action": "allow",
                "classification": "unknown", "message_type": "not_financial",
                "risk_level": "low", "labels": [],
                "explanation": "The message could not be checked.",
                "source": "simulated"}


def _assess(msg: dict) -> dict:
    text = msg.get("text", "")
    sender = str(msg.get("sender", ""))
    sender_type = "normal_number" if re.fullmatch(r"\+?\d{7,15}", sender) else "sender_id"

    base = {
        "evidence": {
            "claimed_amount": _extract_amount(text),
            "matching_transaction": "unavailable",
            "sender_type": sender_type,
            "institutional_authenticity": (
                "unsupported_method" if sender_type == "sender_id" else "missing_marker"),
        },
        "source": "simulated",
    }

    if not _FINANCIAL_HINT.search(text):
        return {**base, "message_type": "not_financial",
                "classification": "unknown", "risk_level": "low", "labels": [],
                "recommended_action": "allow",
                "explanation": "Not a financial message.", "checker_status": "complete"}

    is_scam, prob = _classify(text)
    labels = _labels(text) if is_scam else []
    message_type = ("financial_claim" if _CLAIMS_SENT.search(text)
                    or _ADVANCE_FEE.search(text) else "financial_alert")
    risk_level = "high" if prob >= 0.75 else "medium" if is_scam else "low"

    result = {
        **base,
        "message_type": message_type,
        "classification": "suspicious" if is_scam else "likely_honest",
        "risk_level": risk_level,
        "labels": labels,
        "recommended_action": "warn" if is_scam else "allow",
        "explanation": (
            "The message looks like a trick to get money or codes." if is_scam
            else "The message looks like a normal alert or personal text."),
        "checker_status": "complete",
    }
    if is_scam:
        result["warning"] = _warning_for(labels)
    return result