from controller.brain.scoring import (
    amount_in_words,
    assess_payment,
    band_for_score,
    needs_confirm,
    scam_labels,
)
import pytest


def ctx(**flags):
    base = {
        "new_recipient": False, "unusual_amount": False,
        "large_balance_share": False, "safe_history": False,
        "unknown_call_before": False, "long_call_before": False,
        "recipient_calls_many": False, "sim_recently_changed": False,
        "many_senders": False, "reports": 0, "known_scam_pattern": False,
    }
    base.update(flags)
    return base


ANSWERS_INNOCENT = {
    "who_asked": "self", "purpose": "goods",
    "claimed_official": False, "hurry": False, "knows": True,
}
ANSWERS_COACHED = {
    "who_asked": "called", "purpose": "reverse",
    "claimed_official": True, "hurry": True, "knows": False,
}


def test_band_boundaries():
    assert band_for_score(0.24) == "low"
    assert band_for_score(0.25) == "caution"
    assert band_for_score(0.59) == "caution"
    assert band_for_score(0.60) == "high"
    assert band_for_score(0.89) == "high"
    assert band_for_score(0.90) == "very_high"


def test_no_signals_is_low():
    result = assess_payment(ctx())
    assert result["band"] == "low"
    assert result["score"] < 0.25


def test_single_group_capped_at_high():
    # Only group B fires, strongly. Without the cap this would be very_high.
    result = assess_payment(ctx(
        recipient_calls_many=True, sim_recently_changed=True,
        unknown_call_before=True, long_call_before=True, many_senders=True,
    ))
    assert result["groups"] == ["B"]
    assert result["band"] == "high"
    assert result["score"] < 0.9


def test_two_groups_can_reach_very_high():
    result = assess_payment(ctx(
        recipient_calls_many=True, sim_recently_changed=True,
        unknown_call_before=True, reports=6,
    ))
    assert set(result["groups"]) == {"B", "C"}
    assert result["band"] == "very_high"


def test_safe_history_lowers_score():
    risky = assess_payment(ctx(new_recipient=True, unusual_amount=True))
    safe = assess_payment(ctx(safe_history=True))
    assert safe["score"] < risky["score"]
    assert safe["band"] == "low"


def test_coached_answers_with_network_trace_stays_very_high():
    result = assess_payment(
        ctx(unknown_call_before=True, long_call_before=True,
            sim_recently_changed=True, new_recipient=True),
        answers=ANSWERS_COACHED,
    )
    assert "D" in result["groups"]
    assert result["band"] == "very_high"


def test_innocent_answers_get_relief():
    context = ctx(new_recipient=True, unknown_call_before=True)
    without = assess_payment(context)
    with_answers = assess_payment(context, answers=ANSWERS_INNOCENT)
    assert without["band"] == "caution"
    assert with_answers["band"] == "low"
    assert with_answers["score"] < without["score"]


def test_relief_denied_when_strong_evidence():
    context = ctx(new_recipient=True, unknown_call_before=True, reports=3)
    with_answers = assess_payment(context, answers=ANSWERS_INNOCENT)
    without = assess_payment(context)
    assert with_answers["score"] == without["score"]


def test_trusted_pair_confirm_rule():
    assert needs_confirm(7000, pair_max_safe=100) is True   # base floors at 200 -> 5x = 1000
    assert needs_confirm(900, pair_max_safe=100) is False
    assert needs_confirm(1500, pair_max_safe=250) is True   # 5x250 = 1250
    assert needs_confirm(7000, pair_max_safe=0) is False    # no safe history -> not a trusted pair


def test_scam_labels_need_two_clues():
    assert scam_labels(ANSWERS_COACHED, "caution") == [
        "possible_fake_reversal", "possible_impersonation",
    ]
    alone = dict(ANSWERS_COACHED, who_asked="self")
    assert scam_labels(alone, "caution") == []
    assert scam_labels(ANSWERS_COACHED, "low") == []


def test_amount_in_words():
    assert amount_in_words(7000) == "seven thousand cedis"
    assert amount_in_words(7500) == "seven thousand five hundred cedis"
    assert amount_in_words(200) == "two hundred cedis"


def test_send_back_alone_is_low_not_full_new_recipient_risk():
    # Decision #6: sending money back to someone who paid you is mild.
    # A new pair, recent deposit, similar amount, but NO other signal -> low.
    result = assess_payment(ctx(new_recipient=True, send_back=True,
                                send_back_new_recent_similar=True))
    assert result["band"] == "low"
    assert result["score"] == pytest.approx(assess_payment(ctx())["score"])


def test_send_back_mild_weight_only_with_other_signals():
    import math
    result = assess_payment(ctx(new_recipient=True, send_back=True,
                                send_back_new_recent_similar=True,
                                unknown_call_before=True))
    expected = 1 / (1 + math.exp(-(-2.5 + 0.3 + 1.2)))
    assert result["score"] == pytest.approx(expected)
    assert result["band"] == "caution"