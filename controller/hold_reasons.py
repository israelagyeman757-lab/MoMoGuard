"""Human-readable hold reason labels (en + tw) — never expose raw codes to users."""

from __future__ import annotations

REASON_LABELS: dict[str, dict[str, str]] = {
    "new_number_pair": {
        "en": "First payment from this number to you",
        "tw": "Ɛnyɛ daa sika a wɔde aba wo nɔma yi so",
    },
    "flagged_high": {
        "en": "Number reported to Walɔ",
        "tw": "Wɔde nɔma no amanneɛ ama Walɔ",
    },
    "flagged_medium": {
        "en": "Number under review in Walɔ",
        "tw": "Wɔresesee nɔma no wɔ Walɔ",
    },
    "amount_above_500_ghs": {
        "en": "Large amount (over GHS 500)",
        "tw": "Sika dodow (GHS 500 so)",
    },
    "recipient_wallet_under_7_days": {
        "en": "Your wallet was opened recently",
        "tw": "Wo wallet no foforo",
    },
    "many_distinct_payers_24h": {
        "en": "Many different senders in the last 24 hours",
        "tw": "Ɔsomfoɔ pii de sika aba wo nkyɛn nnɛnna yi mu",
    },
    "recent_sim_swap": {
        "en": "Recent SIM swap on sender line",
        "tw": "Wɔsesaɛ SIM nkyɛn nnɛnna yi",
    },
    "funds_held": {
        "en": "Funds temporarily held by Walɔ",
        "tw": "Walɔ agye sika no daa kakra",
    },
}

_KNOWN = frozenset(REASON_LABELS)


def labels_for_codes(codes: list[str] | None, *, locale: str = "en") -> list[str]:
    loc = "tw" if locale == "tw" else "en"
    out: list[str] = []
    for code in codes or []:
        row = REASON_LABELS.get(code)
        if row:
            out.append(row[loc])
    if not out:
        out.append(REASON_LABELS["funds_held"][loc])
    return out


def join_labels(codes: list[str] | None, *, locale: str = "en") -> str:
    return "; ".join(labels_for_codes(codes, locale=locale))


def reason_labels_payload(codes: list[str] | None) -> dict[str, str]:
    return {
        "en": join_labels(codes, locale="en"),
        "tw": join_labels(codes, locale="tw"),
    }