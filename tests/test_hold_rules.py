from controller.hold_rules import (
    AMOUNT_BOOSTER_GHS,
    EvaluateInput,
    HOLD_FLAGGED_HIGH,
    HOLD_FLAGGED_MEDIUM,
    HOLD_NEW_BOOSTER,
    HOLD_NEW_PAIR,
    compute_duration,
    resolve_new_pair,
)


def test_resolve_new_pair_from_sandbox():
    assert resolve_new_pair(0, True) is True
    assert resolve_new_pair(1, False) is False


def test_resolve_new_pair_from_history():
    assert resolve_new_pair(None, False) is True
    assert resolve_new_pair(None, True) is False


def test_duration_new_pair_only():
    inp = EvaluateInput(payer="0244111111", payee="0244222222", amount=100)
    out = compute_duration(inp, new_pair=True)
    assert out.minutes == HOLD_NEW_PAIR
    assert out.hold is True
    assert out.risk_level == "MEDIUM"


def test_duration_new_pair_with_booster():
    inp = EvaluateInput(
        payer="0244111111",
        payee="0244222222",
        amount=AMOUNT_BOOSTER_GHS + 1,
    )
    out = compute_duration(inp, new_pair=True)
    assert out.minutes == HOLD_NEW_BOOSTER


def test_duration_flagged_medium():
    inp = EvaluateInput(
        payer="0244111111",
        payee="0244222222",
        amount=50,
        flagged_medium=True,
    )
    out = compute_duration(inp, new_pair=False)
    assert out.minutes == HOLD_FLAGGED_MEDIUM


def test_duration_flagged_high():
    inp = EvaluateInput(
        payer="0244111111",
        payee="0244222222",
        amount=50,
        flagged_high=True,
    )
    out = compute_duration(inp, new_pair=False)
    assert out.minutes == HOLD_FLAGGED_HIGH


def test_duration_new_and_flagged_high():
    inp = EvaluateInput(
        payer="0244111111",
        payee="0244222222",
        amount=50,
        flagged_high=True,
    )
    out = compute_duration(inp, new_pair=True)
    assert out.minutes == HOLD_FLAGGED_HIGH