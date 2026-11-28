"""Rancard Glance: centralized sandbox reporting + reverse-number lookup.

Reporting (live): POST {base}/api/v1/developer/sandbox/flagged-msisdns/reports
Lookup (live): GET {base}/api/v1/developer/sandbox/msisdn/aggregates?msisdn=SYN-####
See docs/rancard-glance-integration.md.
"""

from __future__ import annotations

import json
import os
import re
import uuid
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

_DEFAULT_BASE = "https://glance-api.rancardmobility.com"
_REPORT_PATH = "/api/v1/developer/sandbox/flagged-msisdns/reports"
_AGGREGATES_PATH = "/api/v1/developer/sandbox/msisdn/aggregates"
_DISCLAIMER = (
    "This is a risk signal from Glance, not a confirmed fraud finding "
    "and not proof the number is safe or unsafe."
)
_IDEMPOTENCY_NS = uuid.UUID("f47ac10b-58cc-4372-a567-0e02b2c3d479")

# Confirmed empirically against the sandbox API (2026-11-28). A fourth value may
# exist in Rancard's developer console/docs (not readable with this key).
SANDBOX_REPORT_REASONS = frozenset({"PHISHING", "IMPERSONATION", "ACCOUNT_TAKEOVER"})

_SEVERITIES = frozenset({"LOW", "MEDIUM", "HIGH"})

_CANNED_LOOKUP = {
    "0240000009": {
        "status": "flagged", "risk": "high",
        "history": ["reported for an advance-fee scam pattern (demo data)"],
        "message": "Glance has flagged this number. That may be a warning "
                    "sign, not proof it is unsafe.",
    },
    "0240000005": {
        "status": "flagged", "risk": "high",
        "history": ["reported for a fake-reversal scam pattern (demo data)"],
        "message": "Glance has flagged this number. That may be a warning "
                    "sign, not proof it is unsafe.",
    },
    "0240000001": {
        "status": "clear", "risk": "low", "history": [],
        "message": "No threat history found for this number. That is not "
                    "proof it is safe.",
    },
    "0000000000": {
        "status": "error", "risk": "unavailable", "history": [],
        "message": "Glance could not be reached. That is not proof it is "
                    "safe or unsafe.",
    },
}

def _api_key() -> str:
    return (
        os.environ.get("GLANCE_DEV_KEY")
        or os.environ.get("RANCARD_GLANCE_API_KEY")
        or ""
    ).strip()


def phone_to_sandbox_msisdn(number: str) -> str:
    """Map a real/demo phone number to fictional SYN-0000..SYN-9999 (sandbox only).

    Uses the last four digits of the normalized MSISDN so demo numbers like
    0240000009 always map to SYN-0009. This is not a production MSISDN.
    """
    digits = re.sub(r"\D", "", number or "")
    if not digits:
        return "SYN-0000"
    suffix = int(digits[-4:]) % 10000
    return f"SYN-{suffix:04d}"


def map_report_reason(*, trick: str = "", request_type: str = "") -> str:
    trick = (trick or "").lower()
    req = (request_type or "").lower()
    if trick == "possible_impersonation":
        return "IMPERSONATION"
    if trick in ("credential_theft", "possible_advance_fee"):
        return "PHISHING"
    if trick == "possible_fake_reversal":
        return "ACCOUNT_TAKEOVER"
    if req in ("pin_or_verification_code", "fee_prize_or_job", "other", ""):
        return "PHISHING"
    if req in ("reversal", "money_transfer"):
        return "ACCOUNT_TAKEOVER"
    return "PHISHING"


def map_severity(lost_money: bool | None) -> str:
    if lost_money is True:
        return "HIGH"
    if lost_money is False:
        return "MEDIUM"
    return "MEDIUM"


def map_simulated_source(channel: str = "") -> str:
    channel = (channel or "").lower()
    if channel == "innovate_reps":
        return os.environ.get("RANCARD_GLANCE_SIM_SOURCE_REP", "SIM-A")
    if channel == "customer_sim_toolkit":
        return os.environ.get("RANCARD_GLANCE_SIM_SOURCE_CUSTOMER", "SIM-A")
    return os.environ.get("RANCARD_GLANCE_SIM_SOURCE_ID", "SIM-A")


def build_idempotency_key(reporter_id: str, number: str, report_day: str) -> str:
    material = f"{reporter_id}|{number}|{report_day}"
    return str(uuid.uuid5(_IDEMPOTENCY_NS, material))


def _risk_band(item: dict) -> tuple[str, str]:
    """Return (status, risk) without treating anything as confirmed fraud."""
    color = (item.get("riskColor") or "").upper()
    level = (item.get("explanation") or {}).get("riskLevel", "")
    level_u = str(level).upper()
    if color == "RED" or level_u in ("HIGH", "CRITICAL"):
        return "flagged", "high"
    if color == "YELLOW" or level_u in ("MEDIUM", "MODERATE"):
        return "watch", "caution"
    if color == "GREEN" or level_u == "LOW":
        return "watch", "low"
    return "watch", "unknown"


def normalize_aggregates_response(number: str, raw: dict) -> dict:
    """Map Glance aggregates envelope → MoMoGuard reverse-lookup JSON."""
    sandbox_msisdn = phone_to_sandbox_msisdn(number)
    request_id = raw.get("requestId")
    base = {
        "number": number,
        "sandbox_msisdn": sandbox_msisdn,
        "source": "rancard_live",
        "glance_request_id": request_id,
        "glance_code": raw.get("code"),
        "live_attempted": True,
    }
    if not raw.get("success"):
        msg = raw.get("message") or "Glance lookup failed."
        return {
            **base,
            "status": "error",
            "risk": "unavailable",
            "history": [],
            "message": f"{msg} {_DISCLAIMER}",
            "short_message": "Could not check. Not proof.",
        }

    items = (raw.get("data") or {}).get("items") or []
    if not items:
        return {
            **base,
            "status": "no_results",
            "risk": "unknown",
            "history": [],
            "times_reported": 0,
            "message": (
                "No Glance records found for this number. "
                "That is not proof it is safe."
            ),
            "short_message": "No records. Not proof safe.",
        }

    item = items[0]
    status, risk = _risk_band(item)
    times = int(item.get("timesReported") or 0)
    risk_desc = (item.get("riskDescription") or "").strip()
    reasons = (item.get("explanation") or {}).get("reasons") or []
    history = [risk_desc] if risk_desc else []
    history.extend(f"Signal: {reason}" for reason in reasons if reason)

    headline = (
        f"Glance shows {times} report(s) for this number"
        if times else "Glance returned a signal for this number"
    )
    message = f"{headline}. {risk_desc} {_DISCLAIMER}".strip()

    color = item.get("riskColor")
    short = f"{color or '—'}: {times} reports. Not proof."

    return {
        **base,
        "status": status,
        "risk": risk,
        "history": history,
        "message": message,
        "short_message": short,
        "times_reported": times,
        "risk_color": item.get("riskColor"),
        "risk_description": risk_desc,
        "severity": item.get("severity"),
        "first_reported": item.get("firstReported"),
        "last_reported": item.get("lastReported"),
        "risk_score": item.get("riskScore"),
        "glance_status": (item.get("explanation") or {}).get("status"),
        "glance_risk_level": (item.get("explanation") or {}).get("riskLevel"),
    }


class RancardGlancePlug:
    source = "rancard_stub"

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        pass

    @property
    def lookup_mode(self) -> str:
        return os.environ.get("RANCARD_GLANCE_MODE", "stub")

    @property
    def report_mode(self) -> str:
        return os.environ.get("RANCARD_GLANCE_REPORT_MODE", "stub")

    @property
    def mode(self) -> str:
        """Backward-compatible alias for lookup mode."""
        return self.lookup_mode

    def reverse_lookup(self, number: str) -> dict:
        if self.lookup_mode == "live":
            return self._live_lookup(number)
        return self._stub_lookup(number)

    def submit_sandbox_report(
        self,
        *,
        number: str,
        reporter_id: str,
        report_day: str,
        trick: str = "",
        request_type: str = "",
        lost_money: bool | None = None,
        channel: str = "",
    ) -> dict:
        if self.report_mode != "live":
            return {
                "submitted": False,
                "source": "rancard_report_stub",
                "message": "Glance sandbox reporting is in stub mode.",
            }
        api_key = _api_key()
        if not api_key:
            return {
                "submitted": False,
                "source": "rancard_report_stub",
                "message": "Glance API key is not configured.",
            }

        reason = map_report_reason(trick=trick, request_type=request_type)
        if reason not in SANDBOX_REPORT_REASONS:
            return {
                "submitted": False,
                "source": "rancard_report_stub",
                "message": f"Unmapped Glance reason ({reason!r}).",
            }

        msisdn = phone_to_sandbox_msisdn(number)
        severity = map_severity(lost_money)
        if severity not in _SEVERITIES:
            severity = "MEDIUM"

        body = {
            "msisdn": msisdn,
            "reason": reason,
            "simulatedSourceId": map_simulated_source(channel),
            "severity": severity,
        }
        idem = build_idempotency_key(reporter_id, number, report_day)
        return self._post_report(body, idempotency_key=idem, sandbox_msisdn=msisdn, reason=reason)

    def _post_report(self, body: dict, *, idempotency_key: str,
                    sandbox_msisdn: str, reason: str) -> dict:
        base = (os.environ.get("RANCARD_GLANCE_BASE_URL") or _DEFAULT_BASE).rstrip("/")
        url = base + _REPORT_PATH
        api_key = _api_key()
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-API-Key": api_key,
            "Idempotency-Key": idempotency_key,
        }
        timeout_s = float(os.environ.get("RANCARD_GLANCE_TIMEOUT_S", "8"))
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            try:
                raw = json.loads(text)
            except json.JSONDecodeError:
                raw = {"message": text[:200]}
            if e.code == 429:
                msg = "Glance rate limit reached. Try again in a minute."
            else:
                msg = raw.get("message") or f"Glance report failed (HTTP {e.code})."
            return {
                "submitted": False,
                "source": "rancard_live",
                "http_status": e.code,
                "message": msg,
                "sandbox_msisdn": sandbox_msisdn,
                "reason": reason,
                "glance_code": raw.get("code"),
            }
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return {
                "submitted": False,
                "source": "rancard_live",
                "message": "Could not reach Glance. Your local report was still saved.",
                "sandbox_msisdn": sandbox_msisdn,
                "reason": reason,
            }

        submitted = bool(raw.get("success")) or resp.status == 201
        return {
            "submitted": submitted,
            "source": "rancard_live",
            "http_status": resp.status,
            "message": raw.get("message") or "Flagged MSISDN reported successfully.",
            "request_id": raw.get("requestId"),
            "sandbox_msisdn": sandbox_msisdn,
            "reason": reason,
            "glance_code": raw.get("code"),
        }

    def _stub_lookup(self, number: str) -> dict:
        canned = _CANNED_LOOKUP.get(number)
        if canned:
            short = "Flagged in demo data. Not proof."
            if canned["status"] == "clear":
                short = "No demo flag. Not proof safe."
            return {
                "number": number, **canned, "source": self.source,
                "short_message": short,
                "sandbox_msisdn": phone_to_sandbox_msisdn(number),
            }
        return {
            "number": number, "status": "no_results", "risk": "unknown",
            "history": [],
            "message": "No Glance record found for this number. "
                        "That is not proof it is safe.",
            "short_message": "No records. Not proof safe.",
            "sandbox_msisdn": phone_to_sandbox_msisdn(number),
            "source": self.source,
        }

    def _live_lookup(self, number: str) -> dict:
        api_key = _api_key()
        if not api_key:
            return {
                "number": number,
                "status": "error",
                "risk": "unavailable",
                "history": [],
                "message": (
                    "Glance lookup is not configured. "
                    "That is not proof it is safe or unsafe."
                ),
                "short_message": "Check unavailable.",
                "source": "rancard_live",
                "live_attempted": False,
            }

        msisdn = phone_to_sandbox_msisdn(number)
        base = (os.environ.get("RANCARD_GLANCE_BASE_URL") or _DEFAULT_BASE).rstrip("/")
        query = urllib.parse.urlencode({"msisdn": msisdn, "page": "0", "size": "20"})
        url = f"{base}{_AGGREGATES_PATH}?{query}"
        headers = {"Accept": "application/json", "X-API-Key": api_key}
        timeout_s = float(os.environ.get("RANCARD_GLANCE_TIMEOUT_S", "8"))
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            try:
                raw = json.loads(text)
            except json.JSONDecodeError:
                raw = {"message": text[:200], "success": False}
            if e.code == 400:
                return {
                    "number": number,
                    "status": "invalid_number",
                    "risk": "unknown",
                    "history": [],
                    "sandbox_msisdn": msisdn,
                    "message": (
                        raw.get("message")
                        or "This number could not be checked in the Glance sandbox."
                    ) + f" {_DISCLAIMER}",
                    "short_message": "Invalid for sandbox.",
                    "source": "rancard_live",
                    "live_attempted": True,
                    "glance_code": raw.get("code"),
                    "http_status": 400,
                }
            if e.code == 403:
                msg = raw.get("message") or "Glance sandbox lookup is server-only."
            elif e.code == 429:
                msg = "Glance rate limit reached. Try again in a minute."
            else:
                msg = raw.get("message") or f"Glance lookup failed (HTTP {e.code})."
            return {
                "number": number,
                "status": "error",
                "risk": "unavailable",
                "history": [],
                "sandbox_msisdn": msisdn,
                "message": f"{msg} {_DISCLAIMER}",
                "short_message": "Could not check.",
                "source": "rancard_live",
                "live_attempted": True,
                "http_status": e.code,
                "glance_code": raw.get("code"),
                "glance_request_id": raw.get("requestId"),
            }
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
            return {
                "number": number,
                "status": "error",
                "risk": "unavailable",
                "history": [],
                "sandbox_msisdn": msisdn,
                "message": (
                    "Glance could not be reached. "
                    "That is not proof it is safe or unsafe."
                ),
                "short_message": "Could not check.",
                "source": "rancard_live",
                "live_attempted": True,
            }

        return normalize_aggregates_response(number, raw)