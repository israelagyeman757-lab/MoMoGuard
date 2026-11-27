"""MoMoGuard controller: owns the menus, the brain, the pause manager, the plugs.

Run: python -m uvicorn controller.app:app --port 8000
"""

import os
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from controller.brain.scoring import amount_in_words, assess_payment, load_settings, needs_confirm
from controller.message_agent.agent import assess_message
from controller.metrics import MetricsStore
from controller.pause_manager import PauseManager
from controller.plugs.bank_plug import BankPlug
from controller.plugs.data_plug import DataPlug
from controller.plugs.glance_plug import GlancePlug
from controller.plugs.mtn_momo_bank_plug import MtnMomoBankPlug
from controller.plugs.network_plug import NetworkPlug
from controller.ussd import UssdRouter

SOURCES = {"bank": "simulated", "network": "simulated",
           "calls": "simulated", "glance": "simulated"}


def _make_bank_plug():
    """BANK_PLUG_MODE=mtn_sandbox switches to the real hackathon sandbox;
    anything else (including unset) keeps the simulated in-memory bank."""
    if os.environ.get("BANK_PLUG_MODE", "simulated") == "mtn_sandbox":
        return MtnMomoBankPlug()
    return BankPlug()

SENTENCE = {"low": "allow", "caution": "caution", "high": "hold", "very_high": "block"}


def _cedis(amount: float) -> str:
    return f"GH₵{amount:g}"


def create_app(pause_timeout_s: float = 180.0) -> FastAPI:
    app = FastAPI(title="MoMoGuard controller", version="0.2")
    # Dev only: the phone preview is served from a separate local port.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    settings = load_settings()
    bank = _make_bank_plug()
    data = DataPlug()
    glance = GlancePlug()
    network = NetworkPlug()
    metrics = MetricsStore()
    confirms: dict[str, dict] = {}

    def on_expire(reference: str) -> None:
        record = pm.get(reference)
        metrics.finish_payment(reference, "expire")
        if record:
            metrics.record("expire", reference=reference, sender=record["sender"],
                           recipient=record["recipient"], amount=record["amount"])

    pm = PauseManager(timeout_s=pause_timeout_s, on_expire=on_expire)

    def build_context(sender: str, recipient: str, amount: float,
                      ts: str | None = None) -> dict:
        history = bank.history(sender)
        sends = [t["amount"] for t in history if t["sender"] == sender]
        typical = sum(sends) / len(sends) if sends else 100.0
        new_recipient = not bank.has_safe_history(sender, recipient)
        payment_time = (datetime.fromisoformat(ts) if ts
                        else datetime.now(timezone.utc).replace(tzinfo=None))
        incoming = [t for t in history
                    if t["sender"] == recipient and t["recipient"] == sender
                    and datetime.fromisoformat(t["ts"]) <= payment_time]
        send_back_new_recent_similar = any(
            new_recipient
            and 0 <= (payment_time - datetime.fromisoformat(t["ts"])).total_seconds()
            <= settings["send_back_window_hours"] * 3600
            and settings["send_back_min_ratio"] <= amount / t["amount"]
            <= settings["send_back_max_ratio"]
            for t in incoming
        )
        balance = bank.balance(sender)
        return {
            "new_recipient": new_recipient,
            "send_back": bool(incoming),
            "send_back_new_recent_similar": send_back_new_recent_similar,
            "unusual_amount": new_recipient and amount > settings["unusual_amount_multiplier"] * typical,
            "large_balance_share": balance is not None and amount > settings["large_balance_share_threshold"] * balance,
            "safe_history": not new_recipient,
            "unknown_call_before": data.unknown_call_before(sender, ts)["status"] == "detected",
            "long_call_before": data.long_call_before(sender, ts)["status"] == "detected",
            "recipient_calls_many": data.recipient_calls_many(recipient)["status"] == "detected",
            "sim_recently_changed": network.sim_recently_changed(recipient)["status"] == "detected",
            "many_senders": bank.distinct_senders(recipient) >= 3,
            "reports": glance.check(recipient)["reports"],
            "known_scam_pattern": False,
        }

    def recipient_name(number: str) -> str:
        account = bank.account(number)
        return account["name"] if account else number

    def send_to_bank(sender: str, recipient: str, amount: float, key: str) -> dict:
        result = bank.send(sender, recipient, amount, unique_key=key)
        if result["status"] == "ok":
            metrics.record("release", sender=sender, recipient=recipient, amount=amount)
            return {"ok": True, "message": f"Sent {_cedis(amount)} to {recipient_name(recipient)}."}
        metrics.record("send_failed", sender=sender, recipient=recipient, amount=amount)
        return {"ok": False, "message": "Payment could not be completed. Nothing was sent."}

    async def do_assess(session_id: str, sender: str, recipient: str,
                        amount: float, ts: str | None = None) -> dict:
        context = build_context(sender, recipient, amount, ts)
        scored = assess_payment(context, settings=settings)
        band = scored["band"]
        metrics.payments_checked += 1
        sources = {**SOURCES, "bank": bank.source}
        base = {"band": band, "reasons": scored["reasons"],
                "labels": scored["labels"], "sources": sources}

        pair_max = bank.pair_max_safe(sender, recipient)
        if needs_confirm(amount, pair_max, settings):
            confirms[session_id] = {"sender": sender, "recipient": recipient, "amount": amount}
            message = (f"You usually send about {_cedis(pair_max)} to {recipient_name(recipient)}. "
                       f"You are sending {_cedis(amount)} ({amount_in_words(amount)}). "
                       "Continue? 1 Yes 2 No")
            metrics.record("assess", session_id=session_id, sender=sender,
                           recipient=recipient, amount=amount, band=band, decision="confirm")
            return {**base, "decision": "confirm", "message": message,
                    "confirm": {"usual": pair_max, "new": amount,
                                "in_words": amount_in_words(amount)}}

        decision = SENTENCE[band]
        if decision in ("allow", "caution"):
            sent = send_to_bank(sender, recipient, amount, uuid.uuid4().hex)
            if not sent["ok"]:
                decision = "block"
                message = sent["message"]
            elif decision == "caution":
                message = (f"{sent['message']} Note: this is a new number. "
                           "Please be sure you know who you are paying.")
            else:
                message = sent["message"]
        elif decision == "hold":
            reference = await pm.pause(sender, recipient, amount, ts=ts)
            metrics.start_payment(reference, band)
            message = ("Pause before sending. This payment looks unusual. "
                       "A short safety check will follow. Nothing sent yet.")
            base["reference"] = reference
            base["voice_script_id"] = "voice_check_en"
        else:  # block
            metrics.start_payment(session_id, band)
            metrics.finish_payment(session_id, "block")
            message = ("This payment has been stopped to protect you. "
                       "It may be a trick. Nothing was sent.")
        metrics.record("assess", session_id=session_id, sender=sender,
                       recipient=recipient, amount=amount, band=band, decision=decision)
        return {**base, "decision": decision, "message": message}

    async def do_confirm(session_id: str, sender: str, recipient: str,
                         amount: float, answer: str) -> dict:
        pending = confirms.pop(session_id, None)
        if (not pending or pending["sender"] != sender
                or pending["recipient"] != recipient or pending["amount"] != amount):
            return {"decision": "cancelled", "message": "This confirmation is no longer active."}
        if answer == "no":
            metrics.record("confirm", session_id=session_id, sender=sender,
                           recipient=recipient, amount=amount, decision="cancelled")
            return {"decision": "cancelled", "message": "Payment cancelled. Nothing was sent."}
        sent = send_to_bank(sender, recipient, amount, uuid.uuid4().hex)
        decision = "allow" if sent["ok"] else "cancelled"
        metrics.record("confirm", session_id=session_id, sender=sender,
                       recipient=recipient, amount=amount, decision=decision)
        return {"decision": decision, "message": sent["message"]}

    async def do_voice_result(reference: str, sender: str, answers: dict,
                              force: str | None = None) -> dict:
        record = pm.get(reference)
        if record is None or record["sender"] != sender:
            return {"decision": "cancel", "offer_report": False,
                    "message": "This safety check is not active. Nothing was sent."}
        if force == "cancel":
            await pm.submit_result(reference, sender, "cancel")
            metrics.finish_payment(reference, "cancel")
            metrics.record("voice_result", reference=reference, sender=sender, decision="cancel")
            return {"decision": "cancel", "offer_report": True,
                    "message": "Payment cancelled. Nothing was sent."}

        context = build_context(record["sender"], record["recipient"],
                                record["amount"], record.get("ts"))
        band = assess_payment(context, answers=answers, settings=settings)["band"]
        decision = {"low": "release", "caution": "release",
                    "high": "hold", "very_high": "cancel"}[band]
        outcome = await pm.submit_result(reference, sender, decision)
        if outcome["status"] == "refused":
            return {"decision": "cancel", "offer_report": False,
                    "message": "This safety check is no longer active. Nothing was sent."}
        if outcome["status"] == "released":
            sent = send_to_bank(record["sender"], record["recipient"],
                                record["amount"], key=reference)
            if sent["ok"]:
                metrics.finish_payment(reference, "release")
                metrics.record("voice_result", reference=reference, sender=sender, decision="release")
                return {"decision": "release", "offer_report": False,
                        "message": sent["message"] + " Safety check passed."}
            metrics.finish_payment(reference, "failed_send")
            return {"decision": "cancel", "offer_report": False, "message": sent["message"]}
        if outcome["status"] == "cancelled":
            metrics.finish_payment(reference, "cancel")
            metrics.record("voice_result", reference=reference, sender=sender, decision="cancel")
            return {"decision": "cancel", "offer_report": True,
                    "message": "Payment cancelled after the safety check. Nothing was sent.",
                    "attempts_left": outcome.get("attempts_left", 0)}
        metrics.record("voice_result", reference=reference, sender=sender, decision="hold")
        return {"decision": "hold", "offer_report": False,
                "message": "This payment still looks unusual. Please try the safety check again.",
                "attempts_left": outcome["attempts_left"]}

    async def do_report(number: str, trick: str, reporter_id: str) -> dict:
        result = glance.report(number, trick, reporter_id)
        metrics.record("report", number=number, trick=trick, accepted=result["accepted"])
        return result

    async def do_check_number(number: str) -> dict:
        return glance.check(number)

    ussd = UssdRouter(do_assess, do_confirm, do_voice_result, do_report, do_check_number)

    app.state.bank = bank
    app.state.pm = pm
    app.state.metrics = metrics

    def _require(body: dict, *fields):
        missing = [f for f in fields if f not in body]
        if missing:
            raise HTTPException(status_code=422, detail=f"missing fields: {missing}")

    @app.post("/assess")
    async def assess(body: dict):
        _require(body, "session_id", "sender", "recipient", "amount")
        return await do_assess(body["session_id"], body["sender"],
                               body["recipient"], float(body["amount"]), body.get("ts"))

    @app.post("/confirm")
    async def confirm(body: dict):
        _require(body, "session_id", "sender", "recipient", "amount", "answer")
        return await do_confirm(body["session_id"], body["sender"], body["recipient"],
                                float(body["amount"]), body["answer"])

    @app.post("/voice-result")
    async def voice_result(body: dict):
        _require(body, "reference", "sender", "answers")
        return await do_voice_result(body["reference"], body["sender"], body["answers"])

    @app.post("/resume")
    async def resume(body: dict):
        _require(body, "reference", "sender")
        result = await pm.resume(body["reference"], body["sender"])
        messages = {
            "pending": "The safety check is still waiting for answers.",
            "released": "This payment was already released.",
            "cancelled": "This payment was cancelled. Nothing was sent.",
            "expired": "The safety check timed out. The payment was cancelled.",
            "refused": "This reference is not valid for this sender.",
        }
        return {"status": result["status"], "message": messages[result["status"]]}

    @app.post("/report")
    async def report(body: dict):
        _require(body, "number", "trick", "reporter_id")
        return await do_report(body["number"], body["trick"], body["reporter_id"])

    @app.get("/check-number")
    async def check_number(number: str):
        return await do_check_number(number)

    @app.post("/check-sms")
    async def check_sms(body: dict):
        result = assess_message(body)
        metrics.record("sms_check", sender=body.get("sender"),
                       classification=result.get("classification"))
        return result

    @app.post("/check-otp")
    async def check_otp(body: dict):
        # STUB ONLY: the OTP approach is on hold by project decision.
        return {"status": "not_implemented", "checker_status": "not_checked",
                "recommended_action": "allow",
                "message": "The code check is not available yet."}

    @app.post("/ussd")
    async def ussd_endpoint(body: dict):
        _require(body, "session_id", "sender")
        return await ussd.handle(body["session_id"], body.get("key", ""), body["sender"])

    @app.get("/metrics")
    async def get_metrics():
        return metrics.metrics()

    @app.get("/audit")
    async def get_audit():
        return {"events": metrics.audit(), "source": "simulated"}

    @app.post("/reset-demo")
    async def reset_demo():
        bank.reset()
        data.reset()
        glance.reset()
        network.reset()
        await pm.reset()
        metrics.reset()
        confirms.clear()
        ussd.reset()
        return {"status": "ok", "message": "Demo reset to starting state."}

    return app


app = create_app()