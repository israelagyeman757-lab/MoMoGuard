"""Number reputation: canned Glance responses + a tiny local report list.

Real Glance access arrives after the opening ceremony; until then every
response is labelled simulated. Reports are suspected, never proof.
"No reports" never means "safe".
"""

import hashlib
from datetime import datetime, timedelta, timezone

from controller.community import create_community_store
from controller.community.store import CommunityStore

# Demo salt for pseudonymous reporter IDs (simulated; not a production secret).
_REPORTER_SALT = "momoguard-demo-salt"

CANNED_REPUTATION = {
    "0240000009": {"reports": 4, "risk": "high"},
    "DEMO-001": {"reports": 3, "risk": "high"},
    "DEMO-002": {"reports": 1, "risk": "single_source"},
    "DEMO-003": {"reports": 0, "risk": "unreported"},
    "DEMO-004": {"reports": 0, "risk": "unavailable"},
    "DEMO-999": {"reports": 0, "risk": "error"},
}


def _hash_reporter(reporter_id: str) -> str:
    return hashlib.sha256((_REPORTER_SALT + reporter_id).encode()).hexdigest()[:16]


class GlancePlug:
    source = "simulated"

    def __init__(self, store: CommunityStore | None = None):
        self._store = store if store is not None else create_community_store()
        self.reset()

    def reset(self) -> None:
        self._store.reset()

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
            "unavailable": "This number could not be checked right now. "
                           "That is not proof it is safe or unsafe.",
            "error": "This number could not be checked because of an error. "
                     "That is not proof it is safe or unsafe.",
        }
        return {"number": number, "reports": reports, "risk": risk,
                "message": messages[risk], "source": self.source}

    def report(self, number: str, trick: str, reporter_id: str,
               age_days: float = 0, description: str = "", community: str = "",
               incident_time: str = "", claimed_identity: str = "",
               request_type: str = "", lost_money: bool | None = None,
               channel: str = "") -> dict:
        """description/community/incident_time are optional free-text extras
        the Innovate Reps console and the SIM Toolkit's report forms collect
        that the original USSD "Report a Scam" flow didn't -- stored
        alongside the existing fields, never required, so the old USSD flow
        (which only ever passes number/trick/reporter_id) is unaffected."""
        hashed = _hash_reporter(reporter_id)
        ts = datetime.now(timezone.utc) - timedelta(days=age_days)
        day = ts.date().isoformat()
        row = {
            "ts": ts.isoformat(timespec="seconds"),
            "day": day,
            "reporter_id": hashed,
            "number": number,
            "trick": trick,
            "description": description,
            "community": community,
            "incident_time": incident_time,
            "claimed_identity": (claimed_identity or "").strip(),
            "request_type": (request_type or "").strip(),
            "lost_money": lost_money,
            "channel": (channel or "").strip(),
            "verification_state": "unverified",
        }
        if not self._store.insert_report(row):
            return {"accepted": False,
                    "message": "You already reported this number today."}
        summary = self._classification_for_number(number)
        return {"accepted": True,
                "message": "Thank you. This number has been noted as suspected.",
                "number": number,
                "report_day": day,
                "report_state": summary["report_state"],
                "classification_note": summary["message"]}

    def local_reports(self) -> list[dict]:
        return self._store.list_reports()

    def reports_for_number(self, number: str) -> list[dict]:
        return self._store.reports_for_number(number)

    def _classification_for_number(self, number: str) -> dict:
        """PRD §3: distinguish report confidence bands — never treat one report as proof."""
        reports = self.reports_for_number(number)
        distinct = len({r["reporter_id"] for r in reports})
        effective = self.effective_reports(number)
        canned = CANNED_REPUTATION.get(number)
        canned_reports = canned["reports"] if canned else 0

        if canned_reports >= 4 or distinct >= 4 or effective >= 3.5:
            state = "high_confidence_warning"
            message = ("This number has several independent reports. "
                       "That may be a warning sign, not proof it is unsafe.")
        elif distinct >= 2:
            state = "corroborated"
            message = ("This number has multiple reports from different people. "
                       "That may be a warning sign, not proof it is unsafe.")
        elif distinct == 1 or canned_reports == 1:
            state = "unverified"
            message = ("This number has an unverified report. "
                       "That is not proof it is a scam.")
        elif canned_reports >= 1 or effective > 0:
            state = "unverified"
            message = ("This number has limited reporting history. "
                       "That is not proof it is safe or unsafe.")
        else:
            state = "no_reports"
            message = ("No community reports found for this number. "
                       "That is not proof it is safe.")

        return {
            "number": number,
            "report_state": state,
            "distinct_reporters": max(distinct, 1 if canned_reports else 0),
            "local_report_count": len(reports) + (canned_reports if canned else 0),
            "effective_reports": round(effective if reports else float(canned_reports), 2),
            "message": message,
            "source": self.source,
        }

    def intelligence(self, number: str) -> dict:
        return self._classification_for_number(number)

    def effective_reports(self, number: str) -> float:
        """Reports fade: weight halves every 30 days, gone after 90."""
        now = datetime.now(timezone.utc)
        total = 0.0
        for r in self.reports_for_number(number):
            age = (now - datetime.fromisoformat(r["ts"])).total_seconds() / 86400
            if age > 90:
                continue
            total += 0.5 ** (age / 30)
        return total