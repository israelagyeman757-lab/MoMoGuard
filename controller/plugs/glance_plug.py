"""Number reputation: canned Glance responses + a tiny local report list.

Real Glance access arrives after the opening ceremony; until then every
response is labelled simulated. Reports are suspected, never proof.
"No reports" never means "safe".
"""

import hashlib
from datetime import datetime, timedelta, timezone

# Demo salt for pseudonymous reporter IDs (simulated; not a production secret).
_REPORTER_SALT = "momoguard-demo-salt"

CANNED_REPUTATION = {
    "0240000009": {"reports": 4, "risk": "high"},
    "DEMO-001": {"reports": 3, "risk": "high"},
    "DEMO-002": {"reports": 1, "risk": "single_source"},
    "DEMO-003": {"reports": 0, "risk": "unreported"},
}


def _hash_reporter(reporter_id: str) -> str:
    return hashlib.sha256((_REPORTER_SALT + reporter_id).encode()).hexdigest()[:16]


class GlancePlug:
    source = "simulated"

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self._local: list[dict] = []

    def check(self, number: str) -> dict:
        canned = CANNED_REPUTATION.get(number)
        if canned:
            reports, risk = canned["reports"], canned["risk"]
        else:
            reports = self.effective_reports(number)
            risk = ("high" if reports >= 3
                    else "single_source" if reports >= 1 else "unreported")
        messages = {
            "high": "This number has been reported by several people. "
                    "That may be a warning sign, not proof it is unsafe.",
            "single_source": "This number has one report. That may be a warning sign, "
                             "not proof it is unsafe.",
            "unreported": "No reports found for this number. "
                          "That is not proof it is safe.",
        }
        return {"number": number, "reports": reports, "risk": risk,
                "message": messages[risk], "source": self.source}

    def report(self, number: str, trick: str, reporter_id: str,
               age_days: float = 0) -> dict:
        hashed = _hash_reporter(reporter_id)
        ts = datetime.now(timezone.utc) - timedelta(days=age_days)
        day = ts.date().isoformat()
        for r in self._local:
            if r["number"] == number and r["reporter_id"] == hashed and r["day"] == day:
                return {"accepted": False,
                        "message": "You already reported this number today."}
        self._local.append({"ts": ts.isoformat(timespec="seconds"), "day": day,
                            "reporter_id": hashed, "number": number, "trick": trick})
        return {"accepted": True,
                "message": "Thank you. This number has been noted as suspected."}

    def local_reports(self) -> list[dict]:
        return list(self._local)

    def effective_reports(self, number: str) -> float:
        """Reports fade: weight halves every 30 days, gone after 90."""
        now = datetime.now(timezone.utc)
        total = 0.0
        for r in self._local:
            if r["number"] != number:
                continue
            age = (now - datetime.fromisoformat(r["ts"])).total_seconds() / 86400
            if age > 90:
                continue
            total += 0.5 ** (age / 30)
        return total