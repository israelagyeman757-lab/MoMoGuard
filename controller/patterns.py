"""Rule-based pattern matching for reports (number + tactic/category)."""

from __future__ import annotations

from collections import Counter
from typing import Any


def _keyword_overlap(a: str, b: str) -> float:
    wa = {w.lower() for w in a.split() if len(w) > 3}
    wb = {w.lower() for w in b.split() if len(w) > 3}
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / max(len(wa), len(wb))


def find_similar_reports(
    report: dict[str, Any],
    all_reports: list[dict[str, Any]],
    *,
    min_overlap: float = 0.25,
) -> list[dict[str, Any]]:
    """Reports sharing number or similar tactic (category + description)."""
    phone = report.get("phone_number") or ""
    scam_type = report.get("scam_type", "")
    description = report.get("description", "")
    rid = report.get("id")
    similar: list[dict[str, Any]] = []
    for other in all_reports:
        if other.get("id") == rid:
            continue
        same_number = phone and other.get("phone_number") == phone
        same_tactic = (
            scam_type
            and other.get("scam_type") == scam_type
            and _keyword_overlap(description, other.get("description", "")) >= min_overlap
        )
        different_number_same_tactic = (
            not same_number
            and scam_type
            and other.get("scam_type") == scam_type
            and _keyword_overlap(description, other.get("description", "")) >= 0.4
        )
        if same_number or same_tactic or different_number_same_tactic:
            similar.append(
                {
                    **other,
                    "match_reason": (
                        "same_number"
                        if same_number
                        else "shared_tactic"
                        if same_tactic or different_number_same_tactic
                        else "unknown"
                    ),
                }
            )
    return similar


def lookup_result(phone: str, reports: list[dict], warnings: list[dict]) -> dict:
    """Map DB state to blueprint lookup outcomes."""
    active = [
        r
        for r in reports
        if r.get("status") not in ("ARCHIVED", "DISPUTED")
    ]
    published = [w for w in warnings if w.get("status") == "published"]
    phone_warnings = [
        w for w in published if phone and phone in (w.get("description") or "") + (w.get("title") or "")
    ]

    if published and (phone_warnings or any(r.get("status") == "CORROBORATED" for r in active)):
        advice = (
            "A community warning is available for this type of scam. "
            "Do not share your PIN or OTP. Contact MTN through official channels only."
        )
        return {
            "result": "WARNING_AVAILABLE",
            "message": advice,
            "reports_count": len(active),
            "warnings": published[:3],
        }

    corroborated = [r for r in active if r.get("status") == "CORROBORATED"]
    if len(corroborated) >= 2 or (corroborated and len(active) >= 2):
        advice = (
            "Multiple independent reports mention this number or tactic. "
            "Treat contact with caution. No reports does not mean safe — this number has reports."
        )
        return {
            "result": "MULTIPLE_REPORTS",
            "message": advice,
            "reports_count": len(active),
            "warnings": [],
        }

    under = [r for r in active if r.get("status") in ("UNDER_REVIEW", "UNVERIFIED")]
    if under:
        advice = (
            "This number is under community review. "
            "No public accusation yet. Stay alert and never share PINs or OTPs."
        )
        return {
            "result": "UNDER_REVIEW",
            "message": advice,
            "reports_count": len(under),
            "warnings": [],
        }

    advice = (
        "No reports found in Walo for this number. "
        "That does NOT mean it is safe — always verify before sending money or sharing codes."
    )
    return {
        "result": "NO_REPORTS_FOUND",
        "message": advice,
        "reports_count": 0,
        "warnings": [],
    }


def tactic_summary(reports: list[dict]) -> list[dict]:
    counts = Counter(r.get("scam_type", "other") for r in reports)
    return [{"scam_type": k, "count": v} for k, v in counts.most_common()]