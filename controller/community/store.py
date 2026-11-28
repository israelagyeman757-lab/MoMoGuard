"""Community reporting, number reputation, and published warnings — SQLite-backed.

This is the Track 4 community-pivot subsystem, additive and independent of
the existing payment-risk code (Brain, pause manager, GlancePlug, OTP stub,
MessageIntelligenceAgent, bank plugs). That code stays untouched: it still
owns the "is this payment safe" decision. This module answers a different
question — "has the community already flagged this number, and has a
moderator confirmed it" — and persists its answer, because unlike the rest
of the demo it needs to survive a restart and support a human review step.

Design borrowed on purpose from controller/plugs/glance_plug.py rather than
invented from scratch, per the pivot review (internal/community-pivot-review.md):
pseudonymous hashed reporter id, one report per reporter per number per day,
and a report-weight that halves every 30 days and is gone after 90. The one
deliberate new idea is the moderator step: a *report* is unreviewed and
decays automatically; a *warning* only exists once a moderator has reviewed
a report and published it, and a warning does not decay. Keep these two
kinds of evidence conceptually separate — don't let "reported" silently
become "confirmed".

Reports are suspected, never proof. "No reports" never means "safe".
"""

import hashlib
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).parent / "community.db"

# Demo salt for pseudonymous reporter IDs (simulated; not a production secret),
# deliberately separate from GlancePlug's own salt — these are two independent
# stores with two independent reporter-id namespaces.
_REPORTER_SALT = "momoguard-community-demo-salt"

TRICKS = {"possible_fake_reversal", "possible_impersonation", "possible_advance_fee", "other"}
STATUSES = ("pending", "published", "rejected")

SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL,
    trick TEXT NOT NULL,
    detail TEXT,
    reporter_hash TEXT NOT NULL,
    day TEXT NOT NULL,
    ts TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS numbers (
    number TEXT PRIMARY KEY,
    report_count INTEGER NOT NULL DEFAULT 0,
    effective_reports REAL NOT NULL DEFAULT 0,
    risk TEXT NOT NULL DEFAULT 'unreported',
    updated_ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL,
    trick TEXT NOT NULL,
    message TEXT NOT NULL,
    report_id INTEGER,
    published_ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS training_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id TEXT NOT NULL,
    user_id TEXT,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    ts TEXT NOT NULL
);
"""

WARNING_PHRASES = {
    "possible_fake_reversal": ("may be running a fake-reversal trick "
                               "(claiming a payment was sent, then asking for it back)"),
    "possible_impersonation": "may be pretending to be MTN, a bank, or a government official",
    "possible_advance_fee": "may be asking for a fee, prize, or job payment up front",
    "other": "has been reported for a suspected scam",
}

NUMBER_MESSAGES = {
    "high": ("This number has been reported by several people in the community. "
             "That may be a warning sign, not proof it is unsafe."),
    "single_source": ("This number has one community report. "
                       "That may be a warning sign, not proof it is unsafe."),
    "unreported": "No community reports found for this number. That is not proof it is safe.",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _hash_reporter(reporter_id: str) -> str:
    return hashlib.sha256((_REPORTER_SALT + reporter_id).encode()).hexdigest()[:16]


class CommunityStore:
    """Owns one SQLite connection for reports/numbers/warnings/training_attempts.

    Held open for the process lifetime (same convention as the in-memory
    plugs holding their own Python state) rather than reopened per call, so
    an in-memory ":memory:" path works for tests too.
    """

    source = "community"

    def __init__(self, db_path: str | Path | None = None):
        self.db_path = str(db_path) if db_path is not None else str(DEFAULT_DB_PATH)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        self._conn.commit()

    def reset(self) -> None:
        with self._conn:
            for table in ("reports", "numbers", "warnings", "training_attempts"):
                self._conn.execute(f"DELETE FROM {table}")

    # ------------------------------------------------------------------ #
    # Reports
    # ------------------------------------------------------------------ #
    def create_report(self, number: str, trick: str, reporter_id: str,
                      detail: str | None = None, age_days: float = 0) -> dict:
        """age_days backdates the report's timestamp — only meant for tests
        that need to exercise the decay math deterministically, same
        convention as GlancePlug.report()'s age_days parameter."""
        if trick not in TRICKS:
            trick = "other"
        reporter_hash = _hash_reporter(reporter_id)
        ts = datetime.now(timezone.utc) - timedelta(days=age_days)
        day = ts.date().isoformat()
        dup = self._conn.execute(
            "SELECT id FROM reports WHERE number=? AND reporter_hash=? AND day=?",
            (number, reporter_hash, day),
        ).fetchone()
        if dup:
            return {"accepted": False,
                    "message": "You already reported this number today."}
        with self._conn:
            cur = self._conn.execute(
                "INSERT INTO reports (number, trick, detail, reporter_hash, day, ts, status) "
                "VALUES (?, ?, ?, ?, ?, ?, 'pending')",
                (number, trick, detail, reporter_hash, day, ts.isoformat(timespec="seconds")),
            )
        self._recompute_number(number)
        return {"accepted": True,
                "message": "Thank you. This report has been sent for moderator review.",
                "report": self.get_report(cur.lastrowid)}

    def get_report(self, report_id: int) -> dict | None:
        row = self._conn.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
        return dict(row) if row else None

    def list_reports(self, status: str | None = None, number: str | None = None) -> list[dict]:
        query = "SELECT * FROM reports"
        clauses, params = [], []
        if status:
            clauses.append("status=?")
            params.append(status)
        if number:
            clauses.append("number=?")
            params.append(number)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY id DESC"
        return [dict(r) for r in self._conn.execute(query, params).fetchall()]

    def update_report_status(self, report_id: int, status: str,
                             message: str | None = None) -> dict | None:
        if status not in STATUSES:
            raise ValueError(f"status must be one of {STATUSES}")
        report = self.get_report(report_id)
        if report is None:
            return None
        with self._conn:
            self._conn.execute("UPDATE reports SET status=? WHERE id=?", (status, report_id))
        report["status"] = status
        warning = None
        if status == "published":
            warning = self._publish_warning(report, message)
        self._recompute_number(report["number"])
        return {"report": report, "warning": warning}

    # ------------------------------------------------------------------ #
    # Numbers (reputation, aggregated from reports)
    # ------------------------------------------------------------------ #
    def _effective_reports(self, number: str) -> float:
        """Reports fade: weight halves every 30 days, gone after 90.
        Rejected reports never count. Pending and published both count —
        moderation decides what becomes a *warning*, not what counts toward
        this decaying reputation signal."""
        now = datetime.now(timezone.utc)
        rows = self._conn.execute(
            "SELECT ts FROM reports WHERE number=? AND status != 'rejected'", (number,)
        ).fetchall()
        total = 0.0
        for row in rows:
            age_days = (now - datetime.fromisoformat(row["ts"])).total_seconds() / 86400
            if age_days > 90:
                continue
            total += 0.5 ** (age_days / 30)
        return total

    def _recompute_number(self, number: str) -> None:
        effective = self._effective_reports(number)
        count = self._conn.execute(
            "SELECT COUNT(*) AS c FROM reports WHERE number=? AND status != 'rejected'", (number,)
        ).fetchone()["c"]
        risk = "high" if effective >= 3 else "single_source" if effective >= 1 else "unreported"
        with self._conn:
            self._conn.execute(
                "INSERT INTO numbers (number, report_count, effective_reports, risk, updated_ts) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(number) DO UPDATE SET "
                "report_count=excluded.report_count, "
                "effective_reports=excluded.effective_reports, "
                "risk=excluded.risk, updated_ts=excluded.updated_ts",
                (number, count, effective, risk, _now_iso()),
            )

    def check_number(self, number: str) -> dict:
        row = self._conn.execute("SELECT * FROM numbers WHERE number=?", (number,)).fetchone()
        risk = row["risk"] if row else "unreported"
        count = row["report_count"] if row else 0
        return {
            "number": number,
            "report_count": count,
            "risk": risk,
            "message": NUMBER_MESSAGES[risk],
            "warnings": self.list_warnings(number=number),
            "source": self.source,
        }

    # ------------------------------------------------------------------ #
    # Warnings (moderator-published only)
    # ------------------------------------------------------------------ #
    def _publish_warning(self, report: dict, message: str | None = None) -> dict:
        text = message or (
            f"Scam alert: the number {report['number']} "
            f"{WARNING_PHRASES.get(report['trick'], WARNING_PHRASES['other'])}. "
            "This is a community report reviewed by a moderator, not proof. "
            "Stay alert, and never share your PIN or code."
        )
        ts = _now_iso()
        with self._conn:
            cur = self._conn.execute(
                "INSERT INTO warnings (number, trick, message, report_id, published_ts) "
                "VALUES (?, ?, ?, ?, ?)",
                (report["number"], report["trick"], text, report["id"], ts),
            )
        return self.get_warning(cur.lastrowid)

    def get_warning(self, warning_id: int) -> dict | None:
        row = self._conn.execute("SELECT * FROM warnings WHERE id=?", (warning_id,)).fetchone()
        return dict(row) if row else None

    def list_warnings(self, number: str | None = None) -> list[dict]:
        query = "SELECT * FROM warnings"
        params: list = []
        if number:
            query += " WHERE number=?"
            params.append(number)
        query += " ORDER BY id DESC"
        return [dict(r) for r in self._conn.execute(query, params).fetchall()]

    # ------------------------------------------------------------------ #
    # Training attempts
    # ------------------------------------------------------------------ #
    def record_training_attempt(self, scenario_id: str, score: int, total: int,
                                passed: bool, user_id: str | None = None) -> dict:
        ts = _now_iso()
        with self._conn:
            cur = self._conn.execute(
                "INSERT INTO training_attempts (scenario_id, user_id, score, total, passed, ts) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (scenario_id, user_id, score, total, int(passed), ts),
            )
        return {"id": cur.lastrowid, "scenario_id": scenario_id, "user_id": user_id,
                "score": score, "total": total, "passed": passed, "ts": ts}
