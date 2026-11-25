"""Call-log and dataset access. STUB until the organisers' dataset arrives.

Canned call patterns stand in for the dataset's call logs and are labelled
simulated. Call signals are time-windowed: an unknown caller counts only
if the call happened shortly BEFORE the payment. After the sandbox: map
dataset columns into Transaction/Call/Sms/Report and mark source "dataset".
"""

from datetime import datetime, timezone

# Canned demo call (simulated): a stranger called Aunty for 10 minutes
# shortly before the demo scam payments on Fri 27 Nov.
CALL_LOG = [
    {"ts": "2026-11-27T09:45:00", "caller": "0500000000",
     "callee": "0240000001", "duration_s": 600},
]
UNKNOWN_CALLERS = {"0500000000"}
MASS_CALLERS = {"0240000005"}

WINDOW_MIN = 60
LONG_CALL_S = 300


def _parse(ts: str | None) -> datetime:
    if ts:
        return datetime.fromisoformat(ts)
    return datetime.now(timezone.utc).replace(tzinfo=None)


class DataPlug:
    source = "simulated"

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self._calls = list(CALL_LOG)

    def _calls_before(self, sender: str, ts: str | None) -> list[dict]:
        moment = _parse(ts)
        return [c for c in self._calls
                if c["callee"] == sender
                and 0 <= (moment - datetime.fromisoformat(c["ts"])).total_seconds()
                <= WINDOW_MIN * 60]

    def unknown_call_before(self, sender: str, ts: str | None = None) -> dict:
        detected = any(c["caller"] in UNKNOWN_CALLERS
                       for c in self._calls_before(sender, ts))
        return {"status": "detected" if detected else "not_detected",
                "source": self.source}

    def long_call_before(self, sender: str, ts: str | None = None) -> dict:
        calls = [c for c in self._calls_before(sender, ts)
                 if c["duration_s"] >= LONG_CALL_S]
        return {"status": "detected" if calls else "not_detected",
                "duration_s": calls[0]["duration_s"] if calls else 0,
                "source": self.source}

    def recipient_calls_many(self, recipient: str) -> dict:
        detected = recipient in MASS_CALLERS
        return {"status": "detected" if detected else "not_detected",
                "source": self.source}