"""Risk scoring: sigmoid(bias + weighted signals), banded, with a two-groups cap.

All tunable numbers live in settings.json (starting guesses, to be re-fitted
on the sandbox dataset). Groups: A customer habits, B network/ledger,
C community reports, D customer answers.
"""

import json
import math
from pathlib import Path

_SETTINGS_PATH = Path(__file__).parent / "settings.json"


def load_settings() -> dict:
    with open(_SETTINGS_PATH, encoding="utf-8") as f:
        return json.load(f)


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def band_for_score(p: float, settings: dict | None = None) -> str:
    s = settings or load_settings()
    bands = s["bands"]
    if p < bands["low_max"]:
        return "low"
    if p < bands["caution_max"]:
        return "caution"
    if p < bands["high_max"]:
        return "high"
    return "very_high"


def _report_weight(reports: int, weights_c: dict) -> float:
    if reports >= 6:
        return weights_c["reports_6_plus"]
    if reports >= 3:
        return weights_c["reports_3"]
    if reports >= 1:
        return weights_c["reports_1"]
    return 0.0


def assess_payment(context: dict, answers: dict | None = None,
                   settings: dict | None = None) -> dict:
    s = settings or load_settings()
    w = s["weights"]
    total = s["bias"]
    groups: set[str] = set()
    reasons: list[str] = []

    def add(group: str, weight: float, reason: str | None = None):
        nonlocal total
        total += weight
        if weight > 0:
            groups.add(group)
            if reason:
                reasons.append(reason)

    if context.get("new_recipient") and not context.get("send_back"):
        add("A", w["A"]["new_recipient"], "new_recipient")
    if (context.get("unusual_amount") and context.get("new_recipient")
            and not context.get("send_back")):
        add("A", w["A"]["unusual_amount"], "unusual_amount")
    if context.get("large_balance_share"):
        add("A", w["A"]["large_balance_share"], "large_balance_share")
    if context.get("safe_history"):
        add("A", w["A"]["safe_history"])

    for signal in ("unknown_call_before", "long_call_before",
                   "recipient_calls_many", "sim_recently_changed", "many_senders"):
        if context.get(signal):
            add("B", w["B"][signal], signal)

    reports = int(context.get("reports", 0))
    report_w = _report_weight(reports, w["C"])
    if report_w > 0:
        add("C", report_w, "community_reports")
    if context.get("known_scam_pattern"):
        add("C", w["C"]["known_scam_pattern"], "known_scam_pattern")

    if answers:
        contacted = answers.get("who_asked") in ("called", "messaged")
        risky_purpose = answers.get("purpose") in ("reverse", "fee_prize_job")
        official = bool(answers.get("claimed_official"))
        hurry = bool(answers.get("hurry"))
        knows = bool(answers.get("knows"))
        if contacted:
            add("D", w["D"]["contacted"], "contacted_first")
        if risky_purpose:
            add("D", w["D"]["risky_purpose"], "risky_purpose")
        if official:
            add("D", w["D"]["claimed_official"], "claimed_official")
        if hurry:
            add("D", w["D"]["hurry"], "told_to_hurry")
        if not knows:
            add("D", w["D"]["does_not_know"], "does_not_know_recipient")

        innocent = (not contacted and answers.get("purpose") in ("goods", "family")
                    and not official and not hurry and knows)
        strong = (reports >= s["relief_blockers"]["min_reports"]
                  or context.get("recipient_calls_many")
                  or (context.get("unknown_call_before") and context.get("long_call_before")))
        if innocent and not strong:
            total -= s["innocent_relief"]

    if context.get("send_back_new_recent_similar") and groups:
        add("A", w["A"]["send_back_mild"], "send_back_new_recent_similar")

    p = sigmoid(total)
    # Two-groups rule: a lone signal group can pause (High) but never reach
    # Very High on its own.
    if len(groups) < 2 and p >= s["bands"]["high_max"]:
        p = s["two_groups_cap"]

    return {
        "score": p,
        "band": band_for_score(p, s),
        "groups": sorted(groups),
        "reasons": reasons,
        "labels": scam_labels(answers, band_for_score(p, s)) if answers else [],
    }


def needs_confirm(amount: float, pair_max_safe: float,
                  settings: dict | None = None) -> bool:
    s = settings or load_settings()
    if pair_max_safe <= 0:
        return False
    base = max(pair_max_safe, s["confirm_min_base"])
    return amount > s["confirm_multiplier"] * base


_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven",
         "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
         "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
         "eighty", "ninety"]


def _under_1000(n: int) -> str:
    if n < 20:
        return _ONES[n]
    if n < 100:
        rest = n % 10
        return _TENS[n // 10] + ("-" + _ONES[rest] if rest else "")
    rest = n % 100
    return _ONES[n // 100] + " hundred" + (" and " + _under_1000(rest) if rest else "")


def amount_in_words(amount: float) -> str:
    n = int(round(amount))
    if n >= 1_000_000:
        words = _under_1000(n // 1_000_000) + " million"
        rest = n % 1_000_000
        if rest >= 1000:
            words += " " + _under_1000(rest // 1000) + " thousand"
            rest %= 1000
        if rest:
            words += " " + _under_1000(rest)
        return words + " cedis"
    if n >= 1000:
        thousands = n // 1000
        rest = n % 1000
        words = _under_1000(thousands) + " thousand"
        if rest:
            words += " " + _under_1000(rest)
        return words + " cedis"
    return _under_1000(n) + " cedis"


def scam_labels(answers: dict | None, band: str) -> list[str]:
    """Scam names only at caution+, only when two clues agree, always 'may be'."""
    if not answers or band == "low":
        return []
    contacted = answers.get("who_asked") in ("called", "messaged")
    if not contacted:
        return []
    labels = []
    if answers.get("purpose") == "reverse":
        labels.append("possible_fake_reversal")
    if answers.get("claimed_official"):
        labels.append("possible_impersonation")
    if answers.get("purpose") == "fee_prize_job":
        labels.append("possible_advance_fee")
    return labels