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


def _ticket_id(response: dict | None) -> str | None:
    if not response or response.get("error"):
        return None
    for key in ("ticket", "ticketId", "ticket_id", "id"):
        val = response.get(key)
        if val is not None and str(val).strip():
            return str(val)
    data = response.get("data")
    if isinstance(data, dict):
        for key in ("ticket", "ticketId", "id"):
            val = data.get(key)
            if val is not None:
                return str(val)
    return None


def register_sandbox_dispute_hold(
    *,
    sender_msisdn: str,
    txn_id: str,
    amount: float,
    description: str = "Walɔ withdrawal hold — wrong transfer protection",
) -> str | None:
    """
    Sandbox care flow when a hold is recorded (backend owns timer):
    (a) open_ticket → (b) hold on ticket amount.
    """
    if not team_key_configured():
        return None
    opened = sandbox_post(
        "s/care/mtn",
        {
            "action": "open_ticket",
            "msisdn": sender_msisdn,
            "category": "wrong_transfer",
            "txnId": txn_id,
            "description": description,
            "verified": "yes",
        },
    )
    ticket = _ticket_id(opened)
    if not ticket:
        return None
    sandbox_post(
        "s/care/mtn",
        {
            "action": "hold",
            "ticket": ticket,
            "amount": amount,
        },
    )
    return ticket


def complete_sandbox_reversal(*, ticket: str | None, txn_id: str | None) -> dict | None:
    """Rep reverse: (c) return_funds, else fallback telco reverse by txnId."""
    if not team_key_configured():
        return None
    if ticket:
        return sandbox_post("s/care/mtn", {"action": "return_funds", "ticket": ticket})
    if txn_id:
        return sandbox_post(
            "s/telco/mtn",
            {"action": "reverse", "txnId": txn_id},
        )
    return None