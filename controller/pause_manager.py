"""Paused-payment references: single-use, owner-bound, time-limited.

A pass releases the payment once; a fail cancels it; no answer within the
timeout cancels it (never released because time ran out); max 3 attempts.
"""

import asyncio
import uuid

MAX_ATTEMPTS = 3


class PauseManager:
    def __init__(self, timeout_s: float = 180.0, on_expire=None):
        self.timeout_s = timeout_s
        self._on_expire = on_expire
        self._records: dict[str, dict] = {}
        self._timers: dict[str, asyncio.Task] = {}

    async def pause(self, sender: str, recipient: str, amount: float,
                    ts: str | None = None) -> str:
        reference = uuid.uuid4().hex[:12]
        self._records[reference] = {
            "sender": sender,
            "recipient": recipient,
            "amount": amount,
            "ts": ts,
            "status": "pending",
            "attempts": 0,
        }
        self._timers[reference] = asyncio.create_task(self._expire(reference))
        return reference

    async def _expire(self, reference: str) -> None:
        await asyncio.sleep(self.timeout_s)
        record = self._records.get(reference)
        if record and record["status"] == "pending":
            record["status"] = "expired"
            if self._on_expire:
                self._on_expire(reference)

    def get(self, reference: str) -> dict | None:
        return self._records.get(reference)

    def _stop_timer(self, reference: str) -> None:
        timer = self._timers.pop(reference, None)
        if timer:
            timer.cancel()

    async def submit_result(self, reference: str, sender: str, decision: str) -> dict:
        record = self._records.get(reference)
        if record is None or record["sender"] != sender:
            return {"status": "refused"}
        if record["status"] != "pending":
            return {"status": "refused"}

        record["attempts"] += 1
        if decision == "release":
            record["status"] = "released"
            self._stop_timer(reference)
            return {
                "status": "released",
                "payment": {
                    "sender": record["sender"],
                    "recipient": record["recipient"],
                    "amount": record["amount"],
                },
            }
        if decision == "cancel":
            record["status"] = "cancelled"
            self._stop_timer(reference)
            return {"status": "cancelled", "attempts_left": MAX_ATTEMPTS - record["attempts"]}
        # hold: still risky, another attempt allowed up to the cap
        if record["attempts"] >= MAX_ATTEMPTS:
            record["status"] = "cancelled"
            self._stop_timer(reference)
            return {"status": "cancelled", "attempts_left": 0}
        return {"status": "pending", "attempts_left": MAX_ATTEMPTS - record["attempts"]}

    async def resume(self, reference: str, sender: str) -> dict:
        record = self._records.get(reference)
        if record is None or record["sender"] != sender:
            return {"status": "refused"}
        return {"status": record["status"]}

    async def reset(self) -> None:
        for reference in list(self._timers):
            self._stop_timer(reference)
        self._records.clear()