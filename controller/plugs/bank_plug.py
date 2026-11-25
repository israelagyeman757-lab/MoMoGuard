"""Pretend bank: in-memory accounts that move pretend money.

Swap for the sandbox BankPlug after the organisers' sandbox arrives;
the interface (balance/history/send/pair_max_safe/reset) stays the same.
"""

import copy
import uuid
from datetime import datetime, timezone

SEED_ACCOUNTS = {
    "0240000001": {"name": "Aunty", "balance": 8000.0, "phone_type": "feature"},
    "0240000002": {"name": "Kofi", "balance": 300.0, "phone_type": "feature"},
    "0240000005": {"name": "Stranger", "balance": 50.0, "phone_type": "smart"},
    "0240000006": {"name": "New Supplier", "balance": 800.0, "phone_type": "feature"},
    "0240000007": {"name": "Mum", "balance": 400.0, "phone_type": "feature"},
    "0240000009": {"name": "Reported Number", "balance": 20.0, "phone_type": "smart"},
}

# Aunty usually sends Kofi GH₵50-100, so GH₵7,000 triggers the confirm screen.
SEED_HISTORY = [
    {"id": "t1", "ts": "2026-11-20T09:00:00", "sender": "0240000001",
     "recipient": "0240000002", "amount": 50.0, "balance_before": 1800.0},
    {"id": "t2", "ts": "2026-11-21T10:30:00", "sender": "0240000001",
     "recipient": "0240000002", "amount": 100.0, "balance_before": 1750.0},
    {"id": "t3", "ts": "2026-11-22T14:00:00", "sender": "0240000001",
     "recipient": "0240000002", "amount": 80.0, "balance_before": 1650.0},
    {"id": "t4", "ts": "2026-11-23T11:00:00", "sender": "0240000001",
     "recipient": "0240000002", "amount": 100.0, "balance_before": 1600.0},
    {"id": "t5", "ts": "2026-11-23T16:00:00", "sender": "0240000002",
     "recipient": "0240000001", "amount": 60.0, "balance_before": 400.0},
]


class BankPlug:
    source = "simulated"

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self._accounts = copy.deepcopy(SEED_ACCOUNTS)
        self._history = copy.deepcopy(SEED_HISTORY)
        self._used_keys: set[str] = set()

    def account(self, number: str) -> dict | None:
        return self._accounts.get(number)

    def balance(self, number: str) -> float | None:
        acct = self._accounts.get(number)
        return acct["balance"] if acct else None

    def history(self, number: str | None = None) -> list[dict]:
        if number is None:
            return list(self._history)
        return [t for t in self._history
                if t["sender"] == number or t["recipient"] == number]

    def send(self, sender: str, recipient: str, amount: float, unique_key: str) -> dict:
        if unique_key in self._used_keys:
            return {"status": "refused", "reason": "duplicate_key"}
        if sender not in self._accounts or recipient not in self._accounts:
            return {"status": "unknown_account"}
        if amount <= 0:
            return {"status": "refused", "reason": "invalid_amount"}
        if self._accounts[sender]["balance"] < amount:
            return {"status": "insufficient"}
        self._used_keys.add(unique_key)
        balance_before = self._accounts[sender]["balance"]
        self._accounts[sender]["balance"] -= amount
        self._accounts[recipient]["balance"] += amount
        tx = {
            "id": uuid.uuid4().hex[:10],
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "sender": sender, "recipient": recipient, "amount": amount,
            "balance_before": balance_before,
        }
        self._history.append(tx)
        return {"status": "ok", "transaction": tx, "source": self.source}

    def pair_max_safe(self, sender: str, recipient: str) -> float:
        amounts = [t["amount"] for t in self._history
                   if t["sender"] == sender and t["recipient"] == recipient]
        return max(amounts, default=0.0)

    def has_safe_history(self, sender: str, recipient: str) -> bool:
        return self.pair_max_safe(sender, recipient) > 0

    def distinct_senders(self, recipient: str) -> int:
        return len({t["sender"] for t in self._history if t["recipient"] == recipient})