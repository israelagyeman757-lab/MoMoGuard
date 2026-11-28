"""Withdrawal holds API and sandbox plugin webhook."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter, Header, HTTPException

from controller.auth import require_moderator
from controller.hold_rules import build_evaluate_input, compute_duration
from controller.sandbox import care_reverse_hold


def mask_phone(phone: str) -> str:
    n = re.sub(r"\D", "", phone or "")
    if len(n) < 6:
        return phone or ""
    return f"{n[:3]}****{n[-3:]}"


def _mask_hold(row: dict) -> dict:
    out = dict(row)
    out["payer_masked"] = mask_phone(row.get("payer", ""))
    out["payee_masked"] = mask_phone(row.get("payee", ""))
    out.pop("payer", None)
    out.pop("payee", None)
    return out


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _expire_lazy(db: Any, payee: str | None = None) -> None:
    db.expire_released_holds(payee=payee)


class HoldsService:
    def __init__(self, db: Any) -> None:
        self.db = db

    def evaluate(self, body: dict[str, Any]) -> dict[str, Any]:
        payer = body.get("payer", "")
        payee = body.get("payee", "")
        if not payer or not payee:
            raise ValueError("payer and payee required")
        pair = self.db.get_pair_history(payer, payee)
        inp, new_pair = build_evaluate_input(
            body,
            pair_exists=pair is not None,
            reports_for_number=self.db.reports_for_number,
            get_number=self.db.get_number,
            list_warnings=lambda: self.db.list_warnings(status="published"),
        )
        result = compute_duration(inp, new_pair=new_pair)
        hold_id = None
        if result.minutes > 0:
            hold = self.db.insert_hold(
                {
                    "payer": inp.payer,
                    "payee": inp.payee,
                    "amount": inp.amount,
                    "risk_level": result.risk_level,
                    "reasons": result.reasons,
                    "hold_minutes": result.minutes,
                    "sandbox_txn_ref": body.get("sandbox_txn_ref"),
                }
            )
            hold_id = hold["id"]
        self.db.record_pair_payment(inp.payer, inp.payee)
        return {
            "hold": result.hold,
            "minutes": result.minutes,
            "risk_level": result.risk_level,
            "reasons": result.reasons,
            "hold_id": hold_id,
        }

    def withdraw_check(self, phone: str) -> dict[str, Any]:
        _expire_lazy(self.db, payee=phone)
        active = self.db.active_hold_for_payee(phone)
        if not active:
            return {"allow": True}
        release_at = active.get("release_at")
        return {
            "allow": False,
            "release_at": release_at,
            "reason": "; ".join(active.get("reasons") or []) or "funds_held",
            "hold_id": active.get("id"),
            "amount": active.get("amount"),
        }

    def list_holds(self, *, status: str | None = None) -> list[dict]:
        _expire_lazy(self.db)
        rows = self.db.list_holds(status=status or "held")
        return [_mask_hold(r) for r in rows]

    def release(self, hold_id: int, rep_id: str | None) -> dict:
        row = self.db.update_hold_status(hold_id, "released", rep_id=rep_id)
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        return _mask_hold(row)

    def extend(self, hold_id: int, body: dict, rep_id: str | None) -> dict:
        extra = int(body.get("extra_minutes") or body.get("minutes") or 60)
        row = self.db.extend_hold(hold_id, extra, rep_id=rep_id)
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        return _mask_hold(row)

    def reverse(self, hold_id: int, rep_id: str | None) -> dict:
        row = self.db.get_hold(hold_id)
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        updated = self.db.update_hold_status(hold_id, "reversed", rep_id=rep_id)
        if row.get("sandbox_txn_ref"):
            care_reverse_hold(
                msisdn=row.get("payee", ""),
                txn_ref=row.get("sandbox_txn_ref"),
            )
        return _mask_hold(updated)


def register_holds_routes(app_router: APIRouter, db: Any) -> None:
    svc = HoldsService(db)

    def mod_auth(authorization: str | None):
        try:
            return require_moderator(authorization, allow_viewer=True)
        except PermissionError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    @app_router.post("/holds/evaluate")
    async def post_evaluate(body: dict):
        try:
            return svc.evaluate(body)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app_router.get("/holds/withdraw-check/{phone}")
    async def get_withdraw_check(phone: str):
        return svc.withdraw_check(phone)

    @app_router.get("/holds")
    async def get_holds(
        authorization: str | None = Header(default=None),
        status: str | None = "held",
    ):
        mod_auth(authorization)
        return {"holds": svc.list_holds(status=status)}

    @app_router.post("/holds/{hold_id}/release")
    async def post_release(
        hold_id: int,
        authorization: str | None = Header(default=None),
    ):
        rep = mod_auth(authorization)
        return svc.release(hold_id, rep_id=rep.get("user_id") if isinstance(rep, dict) else None)

    @app_router.post("/holds/{hold_id}/extend")
    async def post_extend(
        hold_id: int,
        body: dict,
        authorization: str | None = Header(default=None),
    ):
        rep = mod_auth(authorization)
        return svc.extend(hold_id, body, rep_id=rep.get("user_id") if isinstance(rep, dict) else None)

    @app_router.post("/holds/{hold_id}/reverse")
    async def post_reverse(
        hold_id: int,
        authorization: str | None = Header(default=None),
    ):
        rep = mod_auth(authorization)
        return svc.reverse(hold_id, rep_id=rep.get("user_id") if isinstance(rep, dict) else None)


def handle_sandbox_plugin(
    payload: dict[str, Any],
    evaluate: Callable[[dict], dict],
    withdraw_check: Callable[[str], dict],
) -> dict[str, Any]:
    """Answer Innofemme plugin webhook within 2s budget."""
    point = payload.get("point") or payload.get("pluginPoint") or ""
    if point == "payment.receive":
        payer = (payload.get("payer") or {}).get("msisdn", "")
        payee = (payload.get("payee") or {}).get("msisdn", "")
        amount = float(payload.get("amount") or 0)
        before = payload.get("paymentsFromThisPayerBefore")
        evaluate(
            {
                "payer": payer,
                "payee": payee,
                "amount": amount,
                "payments_from_payer_before": before,
                "recipient_wallet_age_days": _wallet_age_days(
                    (payload.get("payee") or {}).get("walletOpenedAt")
                ),
                "sim_swap_recent": _sim_swap_recent((payload.get("payer") or {}).get("lastSimSwapAt")),
                "different_payers_24h": (payload.get("payee") or {}).get("differentPayersInLast24Hours"),
                "sandbox_txn_ref": payload.get("transactionId") or payload.get("referenceId"),
            }
        )
        return {"decision": "allow", "message": "Walɔ recorded hold policy"}

    if point == "payment.authorize":
        payer = (payload.get("payer") or {}).get("msisdn", "")
        check = withdraw_check(payer)
        if check.get("allow"):
            return {"decision": "allow", "message": "Walɔ clear"}
        release_at = check.get("release_at")
        remaining = _minutes_until(release_at)
        if remaining <= 0:
            return {"decision": "allow", "message": "Hold expired"}
        msg = (check.get("reason") or "Funds held")[:150]
        return {"decision": "delay", "minutes": remaining, "message": msg}

    return {"decision": "allow", "message": "Walɔ carry on"}


def _wallet_age_days(opened_at: str | None) -> int | None:
    dt = _parse_ts(opened_at)
    if not dt:
        return None
    return max(0, (_utcnow() - dt.astimezone(timezone.utc)).days)


def _sim_swap_recent(last_swap: str | None) -> bool:
    dt = _parse_ts(last_swap)
    if not dt:
        return False
    return (_utcnow() - dt.astimezone(timezone.utc)) < timedelta(hours=24)


def _minutes_until(release_at: str | None) -> int:
    dt = _parse_ts(release_at)
    if not dt:
        return 0
    delta = dt.astimezone(timezone.utc) - _utcnow()
    return max(0, int(delta.total_seconds() // 60) + (1 if delta.seconds else 0))