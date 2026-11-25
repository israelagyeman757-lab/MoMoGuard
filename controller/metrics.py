"""Scoreboard metrics + audit log. Never contains PINs or OTPs."""

import math
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class MetricsStore:
    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.payments_checked = 0
        self.scams_stopped = 0
        self._events: list[dict] = []
        self._pending: dict[str, dict] = {}
        self._durations: list[float] = []

    def record(self, type_: str, **fields) -> None:
        self._events.append({"ts": _now(), "type": type_, **fields})

    def start_payment(self, key: str, band: str) -> None:
        self._pending[key] = {"band": band, "start": datetime.now(timezone.utc)}

    def finish_payment(self, key: str, outcome: str) -> None:
        pending = self._pending.pop(key, None)
        if pending is None:
            return
        seconds = (datetime.now(timezone.utc) - pending["start"]).total_seconds()
        risky = pending["band"] in ("high", "very_high")
        if risky:
            self._durations.append(seconds)
            if outcome in ("cancel", "expire", "block"):
                self.scams_stopped += 1

    def metrics(self) -> dict:
        durations = sorted(self._durations)
        if durations:
            avg = sum(durations) / len(durations)
            p95 = durations[max(0, math.ceil(0.95 * len(durations)) - 1)]
        else:
            avg = p95 = 0.0
        return {
            "payments_checked": self.payments_checked,
            "scams_stopped": self.scams_stopped,
            "seconds_added": {"avg": round(avg, 1), "p95": round(p95, 1)},
            "source": "simulated",
        }

    def audit(self) -> list[dict]:
        return list(reversed(self._events))