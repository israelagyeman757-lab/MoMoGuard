"""Innofemme team-08 sandbox HTTP client (optional — no-op when key unset)."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

_log = logging.getLogger(__name__)

INNOFEMME_BASE = "https://hackathon.innofemme.org/api/w/team-08"
_TIMEOUT_S = 1.8


def team_key_configured() -> bool:
    return bool(os.environ.get("INNOFEMME_TEAM_KEY", "").strip())


def sandbox_post(path: str, payload: dict[str, Any]) -> dict | None:
    """POST to sandbox console API; returns JSON or None if key missing / failure."""
    key = os.environ.get("INNOFEMME_TEAM_KEY", "").strip()
    if not key:
        return None
    url = f"{INNOFEMME_BASE.rstrip('/')}/{path.lstrip('/')}"
    try:
        with httpx.Client(timeout=_TIMEOUT_S) as client:
            resp = client.post(
                url,
                json=payload,
                headers={"x-team-key": key, "Content-Type": "application/json"},
            )
            if resp.status_code >= 400:
                _log.warning("sandbox POST %s -> %s", path, resp.status_code)
                return {"error": resp.text, "status_code": resp.status_code}
            if resp.content:
                return resp.json()
            return {"ok": True}
    except Exception as exc:
        _log.warning("sandbox POST %s failed: %s", path, exc)
        return {"error": str(exc)}


def care_reverse_hold(*, msisdn: str, txn_ref: str | None = None) -> dict | None:
    """Best-effort care action after rep reverse; parameters may need tuning on live sandbox."""
    payload: dict[str, Any] = {"action": "return_funds", "msisdn": msisdn}
    if txn_ref:
        payload["txn"] = txn_ref
    return sandbox_post("s/care/mtn", payload)