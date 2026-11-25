import controller.message_agent.agent as agent_module
from controller.message_agent.agent import assess_message

REQUIRED_SCAMS = [
    "I have sent you GH₵300. Please return GH₵200 immediately.",
    "Your MoMo account will be blocked unless you verify your PIN.",
    "You have won a prize. Pay a processing fee.",
    "I am an MTN agent. Send me your OTP.",
    "Your transaction has been reversed. Return the money.",
]


def msg(text, sender="0240000005"):
    return {"sender": sender, "recipient": "0240000001",
            "text": text, "ts": "2026-11-27T10:00:00"}


def test_required_scam_messages_are_flagged():
    for text in REQUIRED_SCAMS:
        result = assess_message(msg(text))
        assert result["recommended_action"] == "warn", text
        assert result["classification"] == "suspicious", text
        assert result["checker_status"] == "complete", text


def test_honest_momo_alert_passes():
    result = assess_message(msg(
        "You have received GHS 300.00 from KOFI MENSAH. "
        "Your new balance is GHS 1,800.00.", sender="MoMo"))
    assert result["recommended_action"] == "allow"
    assert result["classification"] == "likely_honest"


def test_personal_message_is_not_financial():
    result = assess_message(msg("Aunty, are you coming to the market today?"))
    assert result["message_type"] == "not_financial"
    assert result["recommended_action"] == "allow"


def test_agent_error_fails_open(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("model exploded")
    monkeypatch.setattr(agent_module, "_classify", boom)
    result = assess_message(msg(REQUIRED_SCAMS[0]))
    assert result["checker_status"] == "not_checked"
    assert result["recommended_action"] == "allow"


def test_warning_wording_is_pause_not_accusation():
    result = assess_message(msg(REQUIRED_SCAMS[0]))
    warning = result["warning"].lower()
    assert "freeze" not in warning
    assert "scammer" not in warning
    assert "pause" in warning or "may be" in warning


def test_claimed_amount_is_extracted():
    result = assess_message(msg(REQUIRED_SCAMS[0]))
    assert result["evidence"]["claimed_amount"] == 300


def test_fake_deposit_labels():
    result = assess_message(msg(REQUIRED_SCAMS[0]))
    assert "possible_fake_deposit" in result["labels"]
    assert "request_to_return_money" in result["labels"]


def test_action_is_never_hold():
    for text in REQUIRED_SCAMS:
        assert assess_message(msg(text))["recommended_action"] in ("allow", "warn")