"""SQLite-backed MoMoGuard store: reports, numbers, warnings, training."""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

REPORT_STATUSES = frozenset(
    {"UNVERIFIED", "UNDER_REVIEW", "CORROBORATED", "DISPUTED", "ARCHIVED"}
)
WARNING_STATUSES = frozenset({"draft", "published", "archived"})
SCAM_TYPES = frozenset(
    {
        "fake_mtn_rep",
        "pin_otp_request",
        "fake_payment_confirmation",
        "reversal_scam",
        "suspicious_call_message",
        "job_offer",
        "other",
    }
)
TRAINING_CATEGORIES = frozenset(
    {
        "fake_agents",
        "pin_otp_requests",
        "fake_payment_confirmations",
        "reversal_scams",
        "impersonation",
        "fake_jobs",
        "suspicious_calls_messages",
    }
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id TEXT NOT NULL,
    phone_number TEXT NOT NULL DEFAULT '',
    scam_type TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    loss_reported INTEGER,
    status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL UNIQUE,
    current_status TEXT NOT NULL DEFAULT 'unknown',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    scam_type TEXT NOT NULL DEFAULT 'other',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    published_at TEXT
);

CREATE TABLE IF NOT EXISTS training_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    scam_category TEXT NOT NULL,
    explanation TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS training_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER REFERENCES training_scenarios(id),
    question TEXT NOT NULL,
    answer_options TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    scam_category TEXT NOT NULL,
    assessment_tag TEXT NOT NULL DEFAULT 'practice'
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    assessment_type TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id),
    question_id INTEGER NOT NULL,
    selected_answer TEXT NOT NULL,
    is_correct INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS training_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_number ON reports(phone_number);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_warnings_status ON warnings(status);

CREATE TABLE IF NOT EXISTS pair_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payer TEXT NOT NULL,
    payee TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    payment_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (payer, payee)
);

CREATE TABLE IF NOT EXISTS holds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payer TEXT NOT NULL,
    payee TEXT NOT NULL,
    amount REAL NOT NULL,
    risk_level TEXT NOT NULL,
    reasons TEXT NOT NULL DEFAULT '[]',
    hold_minutes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    release_at TEXT,
    status TEXT NOT NULL DEFAULT 'held',
    rep_id TEXT,
    sandbox_txn_ref TEXT
);

CREATE INDEX IF NOT EXISTS idx_holds_payee_status ON holds(payee, status);
CREATE INDEX IF NOT EXISTS idx_holds_status_release ON holds(status, release_at);
CREATE INDEX IF NOT EXISTS idx_pair_payer_payee ON pair_history(payer, payee);
"""

HOLD_STATUSES = frozenset({"held", "released", "reversed", "extended"})


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def _parse_hold_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def normalize_phone(number: str) -> str:
    digits = re.sub(r"\D", "", number or "")
    if digits.startswith("233") and len(digits) >= 12:
        digits = "0" + digits[3:]
    return digits


def validate_phone(number: str) -> bool:
    n = normalize_phone(number)
    return bool(re.fullmatch(r"0\d{9}", n)) if n else False


class MoMoGuardStore:
    backend = "sqlite"

    def __init__(self, path: str = ":memory:") -> None:
        self._path = path
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)

    def reset(self) -> None:
        for table in (
            "quiz_responses",
            "quiz_attempts",
            "training_recommendations",
            "training_questions",
            "training_scenarios",
            "holds",
            "pair_history",
            "warnings",
            "reports",
            "numbers",
            "users",
        ):
            self._conn.execute(f"DELETE FROM {table}")
        self._conn.commit()

    # --- users ---

    def upsert_user(self, user_id: str, display_name: str, role: str = "user") -> dict:
        self._conn.execute(
            """
            INSERT INTO users (id, display_name, role, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, role=excluded.role
            """,
            (user_id, display_name, role, _now()),
        )
        self._conn.commit()
        return self.get_user(user_id)

    def get_user(self, user_id: str) -> dict | None:
        row = self._conn.execute(
            "SELECT id, display_name, role, created_at FROM users WHERE id=?", (user_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_users(self, role: str | None = None) -> list[dict]:
        if role:
            rows = self._conn.execute(
                "SELECT id, display_name, role, created_at FROM users WHERE role=?",
                (role,),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT id, display_name, role, created_at FROM users"
            ).fetchall()
        return [dict(r) for r in rows]

    # --- reports ---

    def insert_report(self, data: dict[str, Any]) -> dict:
        phone = normalize_phone(data.get("phone_number", ""))
        scam_type = data["scam_type"]
        if scam_type not in SCAM_TYPES:
            raise ValueError(f"invalid scam_type: {scam_type}")
        reporter_id = data["reporter_id"]
        created_at = _now()
        cur = self._conn.execute(
            """
            INSERT INTO reports (
                reporter_id, phone_number, scam_type, description,
                loss_reported, status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'UNVERIFIED', ?)
            """,
            (
                reporter_id,
                phone,
                scam_type,
                data.get("description", ""),
                None if data.get("loss_reported") is None else (1 if data["loss_reported"] else 0),
                created_at,
            ),
        )
        report_id = cur.lastrowid
        if phone:
            self._touch_number(phone)
        self._conn.commit()
        return self.get_report(report_id)

    def get_report(self, report_id: int) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM reports WHERE id=?", (report_id,)
        ).fetchone()
        return self._report_row(row) if row else None

    def list_reports(
        self,
        *,
        status: str | None = None,
        phone_number: str | None = None,
        scam_type: str | None = None,
    ) -> list[dict]:
        clauses: list[str] = []
        params: list[Any] = []
        if status:
            clauses.append("status=?")
            params.append(status)
        if phone_number:
            clauses.append("phone_number=?")
            params.append(normalize_phone(phone_number))
        if scam_type:
            clauses.append("scam_type=?")
            params.append(scam_type)
        sql = "SELECT * FROM reports"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC"
        rows = self._conn.execute(sql, params).fetchall()
        return [self._report_row(r) for r in rows]

    def update_report_status(self, report_id: int, status: str) -> dict | None:
        if status not in REPORT_STATUSES:
            raise ValueError(f"invalid status: {status}")
        self._conn.execute(
            "UPDATE reports SET status=? WHERE id=?", (status, report_id)
        )
        self._conn.commit()
        report = self.get_report(report_id)
        if report and report["phone_number"]:
            self._refresh_number_status(report["phone_number"])
        return report

    def _report_row(self, row: sqlite3.Row) -> dict:
        loss = row["loss_reported"]
        return {
            "id": row["id"],
            "reporter_id": row["reporter_id"],
            "phone_number": row["phone_number"],
            "scam_type": row["scam_type"],
            "description": row["description"],
            "loss_reported": None if loss is None else bool(loss),
            "status": row["status"],
            "created_at": row["created_at"],
        }

    def _touch_number(self, phone: str) -> None:
        self._conn.execute(
            """
            INSERT INTO numbers (phone_number, current_status, updated_at)
            VALUES (?, 'unknown', ?)
            ON CONFLICT(phone_number) DO UPDATE SET updated_at=excluded.updated_at
            """,
            (phone, _now()),
        )

    def _refresh_number_status(self, phone: str) -> None:
        reports = self.list_reports(phone_number=phone)
        if not reports:
            status = "unknown"
        elif any(r["status"] == "CORROBORATED" for r in reports):
            status = "CORROBORATED"
        elif any(r["status"] == "UNDER_REVIEW" for r in reports):
            status = "UNDER_REVIEW"
        elif any(r["status"] == "DISPUTED" for r in reports):
            status = "DISPUTED"
        elif all(r["status"] in ("ARCHIVED", "DISPUTED") for r in reports):
            status = "ARCHIVED"
        else:
            status = "UNVERIFIED"
        self._conn.execute(
            """
            INSERT INTO numbers (phone_number, current_status, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(phone_number) DO UPDATE SET
                current_status=excluded.current_status,
                updated_at=excluded.updated_at
            """,
            (phone, status, _now()),
        )
        self._conn.commit()

    def get_number(self, phone: str) -> dict | None:
        phone = normalize_phone(phone)
        row = self._conn.execute(
            "SELECT * FROM numbers WHERE phone_number=?", (phone,)
        ).fetchone()
        return dict(row) if row else None

    def reports_for_number(self, phone: str) -> list[dict]:
        return self.list_reports(phone_number=phone)

    # --- warnings ---

    def insert_warning(self, data: dict[str, Any]) -> dict:
        cur = self._conn.execute(
            """
            INSERT INTO warnings (title, description, scam_type, status, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                data["title"],
                data.get("description", ""),
                data.get("scam_type", "other"),
                data.get("status", "draft"),
                _now(),
            ),
        )
        self._conn.commit()
        return self.get_warning(cur.lastrowid)

    def get_warning(self, warning_id: int) -> dict | None:
        row = self._conn.execute("SELECT * FROM warnings WHERE id=?", (warning_id,)).fetchone()
        return self._warning_row(row) if row else None

    def list_warnings(self, *, status: str | None = None) -> list[dict]:
        if status:
            rows = self._conn.execute(
                "SELECT * FROM warnings WHERE status=? ORDER BY created_at DESC",
                (status,),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM warnings ORDER BY created_at DESC"
            ).fetchall()
        return [self._warning_row(r) for r in rows]

    def update_warning(self, warning_id: int, patch: dict[str, Any]) -> dict | None:
        warning = self.get_warning(warning_id)
        if not warning:
            return None
        title = patch.get("title", warning["title"])
        description = patch.get("description", warning["description"])
        scam_type = patch.get("scam_type", warning["scam_type"])
        status = patch.get("status", warning["status"])
        if status not in WARNING_STATUSES:
            raise ValueError(f"invalid warning status: {status}")
        published_at = warning.get("published_at")
        if status == "published" and warning["status"] != "published":
            published_at = _now()
        self._conn.execute(
            """
            UPDATE warnings SET title=?, description=?, scam_type=?, status=?, published_at=?
            WHERE id=?
            """,
            (title, description, scam_type, status, published_at, warning_id),
        )
        self._conn.commit()
        return self.get_warning(warning_id)

    def _warning_row(self, row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "scam_type": row["scam_type"],
            "status": row["status"],
            "created_at": row["created_at"],
            "published_at": row["published_at"],
        }

    # --- training ---

    def insert_scenario(self, data: dict[str, Any]) -> dict:
        cur = self._conn.execute(
            """
            INSERT INTO training_scenarios (title, description, scam_category, explanation)
            VALUES (?, ?, ?, ?)
            """,
            (
                data["title"],
                data.get("description", ""),
                data["scam_category"],
                data.get("explanation", ""),
            ),
        )
        self._conn.commit()
        return self.get_scenario(cur.lastrowid)

    def get_scenario(self, scenario_id: int) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM training_scenarios WHERE id=?", (scenario_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_scenarios(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM training_scenarios ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]

    def insert_question(self, data: dict[str, Any]) -> dict:
        opts = data["answer_options"]
        if isinstance(opts, list):
            opts_json = json.dumps(opts)
        else:
            opts_json = opts
        cur = self._conn.execute(
            """
            INSERT INTO training_questions (
                scenario_id, question, answer_options, correct_answer,
                explanation, scam_category, assessment_tag
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("scenario_id"),
                data["question"],
                opts_json,
                data["correct_answer"],
                data.get("explanation", ""),
                data["scam_category"],
                data.get("assessment_tag", "practice"),
            ),
        )
        self._conn.commit()
        return self.get_question(cur.lastrowid)

    def get_question(self, question_id: int) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM training_questions WHERE id=?", (question_id,)
        ).fetchone()
        return self._question_row(row) if row else None

    def list_questions(
        self, *, assessment_tag: str | None = None, category: str | None = None
    ) -> list[dict]:
        clauses: list[str] = []
        params: list[Any] = []
        if assessment_tag:
            clauses.append("assessment_tag=?")
            params.append(assessment_tag)
        if category:
            clauses.append("scam_category=?")
            params.append(category)
        sql = "SELECT * FROM training_questions"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY id"
        rows = self._conn.execute(sql, params).fetchall()
        return [self._question_row(r) for r in rows]

    def _question_row(self, row: sqlite3.Row) -> dict:
        opts = json.loads(row["answer_options"])
        return {
            "id": row["id"],
            "scenario_id": row["scenario_id"],
            "question": row["question"],
            "answer_options": opts,
            "correct_answer": row["correct_answer"],
            "explanation": row["explanation"],
            "scam_category": row["scam_category"],
            "assessment_tag": row["assessment_tag"],
        }

    def save_quiz_attempt(
        self,
        user_id: str,
        assessment_type: str,
        responses: list[dict[str, Any]],
    ) -> dict:
        total = len(responses)
        correct = sum(1 for r in responses if r["is_correct"])
        score = round((correct / total) * 100, 1) if total else 0.0
        completed_at = _now()
        cur = self._conn.execute(
            """
            INSERT INTO quiz_attempts (user_id, assessment_type, score, total_questions, completed_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, assessment_type, score, total, completed_at),
        )
        attempt_id = cur.lastrowid
        for r in responses:
            self._conn.execute(
                """
                INSERT INTO quiz_responses (attempt_id, question_id, selected_answer, is_correct)
                VALUES (?, ?, ?, ?)
                """,
                (attempt_id, r["question_id"], r["selected_answer"], 1 if r["is_correct"] else 0),
            )
        self._conn.commit()
        self._refresh_recommendations(user_id)
        return {
            "attempt_id": attempt_id,
            "user_id": user_id,
            "assessment_type": assessment_type,
            "score": score,
            "total_questions": total,
            "correct": correct,
            "completed_at": completed_at,
        }

    def quiz_history(self, user_id: str) -> list[dict]:
        rows = self._conn.execute(
            """
            SELECT id, user_id, assessment_type, score, total_questions, completed_at
            FROM quiz_attempts WHERE user_id=? ORDER BY completed_at DESC
            """,
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def training_stats(self) -> dict:
        rows = self._conn.execute(
            """
            SELECT assessment_type, AVG(score) AS avg_score, COUNT(*) AS n
            FROM quiz_attempts GROUP BY assessment_type
            """
        ).fetchall()
        by_type = {r["assessment_type"]: {"avg_score": round(r["avg_score"] or 0, 1), "count": r["n"]} for r in rows}
        pre_users = {
            r[0]
            for r in self._conn.execute(
                "SELECT DISTINCT user_id FROM quiz_attempts WHERE assessment_type='pre'"
            ).fetchall()
        }
        post_users = {
            r[0]
            for r in self._conn.execute(
                "SELECT DISTINCT user_id FROM quiz_attempts WHERE assessment_type='post'"
            ).fetchall()
        }
        both = pre_users & post_users
        improvement = 0.0
        if both:
            deltas = []
            for uid in both:
                pre = self._conn.execute(
                    "SELECT score FROM quiz_attempts WHERE user_id=? AND assessment_type='pre' ORDER BY completed_at DESC LIMIT 1",
                    (uid,),
                ).fetchone()
                post = self._conn.execute(
                    "SELECT score FROM quiz_attempts WHERE user_id=? AND assessment_type='post' ORDER BY completed_at DESC LIMIT 1",
                    (uid,),
                ).fetchone()
                if pre and post:
                    deltas.append(post["score"] - pre["score"])
            if deltas:
                improvement = round(sum(deltas) / len(deltas), 1)
        missed = self._conn.execute(
            """
            SELECT tq.scam_category, COUNT(*) AS misses
            FROM quiz_responses qr
            JOIN training_questions tq ON tq.id = qr.question_id
            WHERE qr.is_correct = 0
            GROUP BY tq.scam_category
            ORDER BY misses DESC
            LIMIT 5
            """
        ).fetchall()
        return {
            "by_assessment_type": by_type,
            "users_completed_both": len(both),
            "average_improvement_pp": improvement,
            "most_missed_categories": [{"category": r["scam_category"], "misses": r["misses"]} for r in missed],
        }

    def get_recommendations(self, user_id: str) -> list[dict]:
        rows = self._conn.execute(
            """
            SELECT category, reason, created_at FROM training_recommendations
            WHERE user_id=? ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def _refresh_recommendations(self, user_id: str) -> None:
        self._conn.execute(
            "DELETE FROM training_recommendations WHERE user_id=?", (user_id,)
        )
        missed = self._conn.execute(
            """
            SELECT tq.scam_category, COUNT(*) AS misses
            FROM quiz_responses qr
            JOIN quiz_attempts qa ON qa.id = qr.attempt_id
            JOIN training_questions tq ON tq.id = qr.question_id
            WHERE qa.user_id=? AND qr.is_correct = 0
            GROUP BY tq.scam_category
            HAVING misses >= 1
            ORDER BY misses DESC
            """,
            (user_id,),
        ).fetchall()
        for row in missed:
            cat = row["scam_category"]
            self._conn.execute(
                """
                INSERT INTO training_recommendations (user_id, category, reason, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    user_id,
                    cat,
                    f"You missed questions about {cat.replace('_', ' ')}. Review this category.",
                    _now(),
                ),
            )
        self._conn.commit()

    # --- holds ---

    def insert_hold(self, data: dict[str, Any]) -> dict:
        reasons = data.get("reasons") or []
        hold_minutes = int(data.get("hold_minutes") or 0)
        created_at = _now()
        release_at = (
            datetime.now(timezone.utc) + timedelta(minutes=hold_minutes)
        ).replace(tzinfo=None).isoformat(timespec="seconds")
        cur = self._conn.execute(
            """
            INSERT INTO holds (
                payer, payee, amount, risk_level, reasons, hold_minutes,
                created_at, release_at, status, sandbox_txn_ref
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'held', ?)
            """,
            (
                normalize_phone(data["payer"]),
                normalize_phone(data["payee"]),
                float(data["amount"]),
                data["risk_level"],
                json.dumps(reasons),
                hold_minutes,
                created_at,
                release_at,
                data.get("sandbox_txn_ref"),
            ),
        )
        self._conn.commit()
        return self.get_hold(cur.lastrowid)

    def get_hold(self, hold_id: int) -> dict | None:
        row = self._conn.execute("SELECT * FROM holds WHERE id=?", (hold_id,)).fetchone()
        return self._hold_row(row) if row else None

    def list_holds(self, *, status: str | None = None, payee: str | None = None) -> list[dict]:
        clauses: list[str] = []
        params: list[Any] = []
        if status:
            clauses.append("status=?")
            params.append(status)
        if payee:
            clauses.append("payee=?")
            params.append(normalize_phone(payee))
        sql = "SELECT * FROM holds"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC"
        rows = self._conn.execute(sql, params).fetchall()
        return [self._hold_row(r) for r in rows]

    def active_hold_for_payee(self, payee: str) -> dict | None:
        payee = normalize_phone(payee)
        row = self._conn.execute(
            """
            SELECT * FROM holds
            WHERE payee=? AND status='held' AND release_at > ?
            ORDER BY release_at DESC LIMIT 1
            """,
            (payee, _now()),
        ).fetchone()
        return self._hold_row(row) if row else None

    def update_hold_status(
        self, hold_id: int, status: str, *, rep_id: str | None = None
    ) -> dict | None:
        if status not in HOLD_STATUSES:
            raise ValueError(f"invalid hold status: {status}")
        self._conn.execute(
            "UPDATE holds SET status=?, rep_id=COALESCE(?, rep_id) WHERE id=?",
            (status, rep_id, hold_id),
        )
        self._conn.commit()
        return self.get_hold(hold_id)

    def extend_hold(self, hold_id: int, extra_minutes: int, *, rep_id: str | None = None) -> dict | None:
        hold = self.get_hold(hold_id)
        if not hold or hold["status"] not in ("held", "extended"):
            return None
        release = _parse_hold_ts(hold.get("release_at")) or datetime.now(timezone.utc)
        new_release = (release + timedelta(minutes=extra_minutes)).replace(tzinfo=None).isoformat(
            timespec="seconds"
        )
        new_minutes = int(hold.get("hold_minutes") or 0) + extra_minutes
        self._conn.execute(
            """
            UPDATE holds SET release_at=?, hold_minutes=?, status='extended', rep_id=COALESCE(?, rep_id)
            WHERE id=?
            """,
            (new_release, new_minutes, rep_id, hold_id),
        )
        self._conn.commit()
        return self.get_hold(hold_id)

    def expire_released_holds(self, *, payee: str | None = None) -> None:
        sql = "UPDATE holds SET status='released' WHERE status IN ('held','extended') AND release_at <= ?"
        params: list[Any] = [_now()]
        if payee:
            sql += " AND payee=?"
            params.append(normalize_phone(payee))
        self._conn.execute(sql, params)
        self._conn.commit()

    def get_pair_history(self, payer: str, payee: str) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM pair_history WHERE payer=? AND payee=?",
            (normalize_phone(payer), normalize_phone(payee)),
        ).fetchone()
        return dict(row) if row else None

    def record_pair_payment(self, payer: str, payee: str) -> None:
        payer = normalize_phone(payer)
        payee = normalize_phone(payee)
        now = _now()
        self._conn.execute(
            """
            INSERT INTO pair_history (payer, payee, first_seen, payment_count)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(payer, payee) DO UPDATE SET payment_count = payment_count + 1
            """,
            (payer, payee, now),
        )
        self._conn.commit()

    def _hold_row(self, row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "payer": row["payer"],
            "payee": row["payee"],
            "amount": row["amount"],
            "risk_level": row["risk_level"],
            "reasons": json.loads(row["reasons"] or "[]"),
            "hold_minutes": row["hold_minutes"],
            "created_at": row["created_at"],
            "release_at": row["release_at"],
            "status": row["status"],
            "rep_id": row["rep_id"],
            "sandbox_txn_ref": row["sandbox_txn_ref"],
        }

    def overview_stats(self) -> dict:
        reports = self._conn.execute(
            "SELECT status, COUNT(*) AS n FROM reports GROUP BY status"
        ).fetchall()
        warnings = self._conn.execute(
            "SELECT status, COUNT(*) AS n FROM warnings GROUP BY status"
        ).fetchall()
        tactics = self._conn.execute(
            """
            SELECT scam_type, COUNT(*) AS n FROM reports
            WHERE status IN ('UNVERIFIED','UNDER_REVIEW','CORROBORATED')
            GROUP BY scam_type ORDER BY n DESC LIMIT 5
            """
        ).fetchall()
        return {
            "reports_by_status": {r["status"]: r["n"] for r in reports},
            "warnings_by_status": {r["status"]: r["n"] for r in warnings},
            "top_tactics": [{"scam_type": r["scam_type"], "count": r["n"]} for r in tactics],
            "training": self.training_stats(),
        }