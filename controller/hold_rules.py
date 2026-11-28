"""Risk rules and hold duration for withdrawal protection (pure logic, unit-tested)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

HOLD_NONE = 0
HOLD_NEW_PAIR = 30
HOLD_NEW_BOOSTER = 120
HOLD_FLAGGED_MEDIUM = 360
HOLD_FLAGGED_HIGH = 1440

AMOUNT_BOOSTER_GHS = 500
RECIPIENT_WALLET_YOUNG_DAYS = 7
DISTINCT_PAYERS_24H = 3


def glance_lookup(phone: str) -> dict | None:
    """Pluggable external number-risk feed; not wired in hackathon MVP."""
    return None


@dataclass
class EvaluateInput:
    payer: str
    payee: str
    amount: float
    payer_wallet_age_days: int | None = None
    recipient_wallet_age_days: int | None = None
    sim_swap_recent: bool = False
    payments_from_payer_before: int | None = None
    different_payers_24h: int | None = None
    is_new_pair: bool | None = None
    flagged_high: bool = False
    flagged_medium: bool = False


@dataclass
class EvaluateResult:
    hold: bool
    minutes: int
    risk_level: str
    reasons: list[str] = field(default_factory=list)


def _has_booster(inp: EvaluateInput) -> bool:
    return bool(booster_reasons(inp))


def booster_reasons(inp: EvaluateInput) -> list[str]:
    out: list[str] = []
    if inp.amount > AMOUNT_BOOSTER_GHS:
        out.append("amount_above_500_ghs")
    if (
        inp.recipient_wallet_age_days is not None
        and inp.recipient_wallet_age_days < RECIPIENT_WALLET_YOUNG_DAYS
    ):
        out.append("recipient_wallet_under_7_days")
    if (
        inp.different_payers_24h is not None
        and inp.different_payers_24h >= DISTINCT_PAYERS_24H
    ):
        out.append("many_distinct_payers_24h")
    if inp.sim_swap_recent:
        out.append("recent_sim_swap")
    return out


def resolve_new_pair(
    payments_from_payer_before: int | None,
    pair_exists: bool,
) -> bool:
    if payments_from_payer_before is not None:
        return payments_from_payer_before == 0
    return not pair_exists


def compute_duration(inp: EvaluateInput, *, new_pair: bool) -> EvaluateResult:
    reasons: list[str] = []
    if inp.flagged_high:
        reasons.append("flagged_high")
    if inp.flagged_medium:
        reasons.append("flagged_medium")
    if new_pair:
        reasons.append("new_number_pair")
    reasons.extend(booster_reasons(inp))

    has_booster = _has_booster(inp)

    if inp.flagged_high or (new_pair and inp.flagged_medium):
        minutes = HOLD_FLAGGED_HIGH
        risk = "HIGH"
    elif inp.flagged_medium:
        minutes = HOLD_FLAGGED_MEDIUM
        risk = "MEDIUM"
    elif new_pair and has_booster:
        minutes = HOLD_NEW_BOOSTER
        risk = "MEDIUM"
    elif new_pair:
        minutes = HOLD_NEW_PAIR
        risk = "MEDIUM"
    else:
        minutes = HOLD_NONE
        risk = "LOW"

    return EvaluateResult(
        hold=minutes > 0,
        minutes=minutes,
        risk_level=risk,
        reasons=reasons,
    )


def flagged_from_db(
    phone: str,
    *,
    reports_for_number: Callable[[str], list[dict]],
    get_number: Callable[[str], dict | None],
    list_warnings: Callable[[], list[dict]],
) -> tuple[bool, bool]:
    high = False
    medium = False
    reports = reports_for_number(phone)
    for r in reports:
        st = r.get("status", "")
        if st == "CORROBORATED":
            high = True
        elif st in ("UNVERIFIED", "UNDER_REVIEW"):
            medium = True
    row = get_number(phone)
    if row and str(row.get("current_status", "")).lower() in ("flagged", "corroborated"):
        high = True
    for w in list_warnings():
        if w.get("status") != "published":
            continue
        blob = (w.get("title") or "") + (w.get("description") or "")
        if phone and phone in blob.replace(" ", ""):
            high = True
    g = glance_lookup(phone)
    if g:
        if g.get("risk") == "HIGH":
            high = True
        elif g.get("risk") == "MEDIUM":
            medium = True
    return high, medium


def build_evaluate_input(
    body: dict[str, Any],
    *,
    pair_exists: bool,
    reports_for_number: Callable[[str], list[dict]],
    get_number: Callable[[str], dict | None],
    list_warnings: Callable[[], list[dict]],
) -> tuple[EvaluateInput, bool]:
    from controller.momoguard_store import normalize_phone

    payer = normalize_phone(body.get("payer", ""))
    payee = normalize_phone(body.get("payee", ""))
    amount = float(body.get("amount") or 0)
    payments_before = body.get("payments_from_payer_before")
    if payments_before is not None:
        payments_before = int(payments_before)
    new_pair = resolve_new_pair(payments_before, pair_exists)
    payee_high, payee_med = flagged_from_db(
        payee,
        reports_for_number=reports_for_number,
        get_number=get_number,
        list_warnings=list_warnings,
    )
    payer_high, payer_med = flagged_from_db(
        payer,
        reports_for_number=reports_for_number,
        get_number=get_number,
        list_warnings=list_warnings,
    )
    inp = EvaluateInput(
        payer=payer,
        payee=payee,
        amount=amount,
        payer_wallet_age_days=body.get("payer_wallet_age_days"),
        recipient_wallet_age_days=body.get("recipient_wallet_age_days"),
        sim_swap_recent=bool(body.get("sim_swap_recent")),
        payments_from_payer_before=payments_before,
        different_payers_24h=body.get("different_payers_24h"),
        flagged_high=payee_high or payer_high,
        flagged_medium=(payee_med or payer_med) and not (payee_high or payer_high),
    )
    return inp, new_pair