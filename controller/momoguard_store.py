"""SQLite-backed MoMoGuard store: reports, numbers, warnings, training."""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
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
    tags TEXT NOT NULL DEFAULT '[]',
    facilitated_by_rep TEXT,
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
    facilitated_by_rep TEXT,
    completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stk_tip_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_id TEXT NOT NULL,
    text TEXT NOT NULL,
    more INTEGER NOT NULL DEFAULT 0,
    report INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS rep_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
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
"""


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


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
        self._migrate_schema()

    def _migrate_schema(self) -> None:
        report_cols = {
            row[1] for row in self._conn.execute("PRAGMA table_info(reports)").fetchall()
        }
        if "tags" not in report_cols:
            self._conn.execute(
                "ALTER TABLE reports ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'"
            )
        if "facilitated_by_rep" not in report_cols:
            self._conn.execute("ALTER TABLE reports ADD COLUMN facilitated_by_rep TEXT")
        attempt_cols = {
            row[1] for row in self._conn.execute("PRAGMA table_info(quiz_attempts)").fetchall()
        }
        if "facilitated_by_rep" not in attempt_cols:
            self._conn.execute("ALTER TABLE quiz_attempts ADD COLUMN facilitated_by_rep TEXT")
        self._conn.commit()

    def reset(self) -> None:
        for table in (
            "quiz_responses",
            "quiz_attempts",
            "rep_events",
            "stk_tip_requests",
            "training_recommendations",
            "training_questions",
            "training_scenarios",
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
        tags = data.get("tags") or []
        if isinstance(tags, str):
            tags = json.loads(tags) if tags else []
        created_at = _now()
        cur = self._conn.execute(
            """
            INSERT INTO reports (
                reporter_id, phone_number, scam_type, description,
                loss_reported, status, tags, facilitated_by_rep, created_at
            ) VALUES (?, ?, ?, ?, ?, 'UNVERIFIED', ?, ?, ?)
            """,
            (
                reporter_id,
                phone,
                scam_type,
                data.get("description", ""),
                None if data.get("loss_reported") is None else (1 if data["loss_reported"] else 0),
                json.dumps(tags),
                data.get("facilitated_by_rep"),
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
        raw_tags = row["tags"] if "tags" in row.keys() else "[]"
        try:
            tags = json.loads(raw_tags) if raw_tags else []
        except json.JSONDecodeError:
            tags = []
        return {
            "id": row["id"],
            "reporter_id": row["reporter_id"],
            "phone_number": row["phone_number"],
            "scam_type": row["scam_type"],
            "description": row["description"],
            "loss_reported": None if loss is None else bool(loss),
            "status": row["status"],
            "tags": tags,
            "facilitated_by_rep": row["facilitated_by_rep"] if "facilitated_by_rep" in row.keys() else None,
            "created_at": row["created_at"],
        }

    def count_assisted_reports(self) -> int:
        row = self._conn.execute(
            "SELECT COUNT(*) AS n FROM reports WHERE tags LIKE '%assisted-by-rep%'"
        ).fetchone()
        return int(row["n"]) if row else 0

    def list_reports_for_moderator(
        self,
        *,
        status: str | None = None,
        phone_number: str | None = None,
        scam_type: str | None = None,
    ) -> list[dict]:
        return self.list_reports(status=status, phone_number=phone_number, scam_type=scam_type)

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
        *,
        facilitated_by_rep: str | None = None,
    ) -> dict:
        total = len(responses)
        correct = sum(1 for r in responses if r["is_correct"])
        score = round((correct / total) * 100, 1) if total else 0.0
        completed_at = _now()
        cur = self._conn.execute(
            """
            INSERT INTO quiz_attempts (
                user_id, assessment_type, score, total_questions, facilitated_by_rep, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, assessment_type, score, total, facilitated_by_rep, completed_at),
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

    def insert_stk_tip_request(
        self, rep_id: str, text: str, *, more: bool = False, report: bool = False
    ) -> dict:
        created_at = _now()
        cur = self._conn.execute(
            """
            INSERT INTO stk_tip_requests (rep_id, text, more, report, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?)
            """,
            (rep_id, text, 1 if more else 0, 1 if report else 0, created_at),
        )
        self._conn.commit()
        return self.get_stk_tip_request(cur.lastrowid)

    def get_stk_tip_request(self, request_id: int) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM stk_tip_requests WHERE id=?", (request_id,)
        ).fetchone()
        return self._stk_tip_row(row) if row else None

    def list_stk_tip_requests(self, *, status: str | None = "pending") -> list[dict]:
        if status:
            rows = self._conn.execute(
                "SELECT * FROM stk_tip_requests WHERE status=? ORDER BY created_at DESC",
                (status,),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM stk_tip_requests ORDER BY created_at DESC"
            ).fetchall()
        return [self._stk_tip_row(r) for r in rows]

    def update_stk_tip_request(self, request_id: int, status: str) -> dict | None:
        reviewed_at = _now() if status != "pending" else None
        self._conn.execute(
            """
            UPDATE stk_tip_requests SET status=?, reviewed_at=?
            WHERE id=?
            """,
            (status, reviewed_at, request_id),
        )
        self._conn.commit()
        return self.get_stk_tip_request(request_id)

    def _stk_tip_row(self, row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "rep_id": row["rep_id"],
            "text": row["text"],
            "more": bool(row["more"]),
            "report": bool(row["report"]),
            "status": row["status"],
            "created_at": row["created_at"],
            "reviewed_at": row["reviewed_at"],
        }

    def record_rep_event(self, rep_id: str, event_type: str, payload: dict | None = None) -> dict:
        created_at = _now()
        cur = self._conn.execute(
            """
            INSERT INTO rep_events (rep_id, event_type, payload, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (rep_id, event_type, json.dumps(payload or {}), created_at),
        )
        self._conn.commit()
        return {
            "id": cur.lastrowid,
            "rep_id": rep_id,
            "event_type": event_type,
            "payload": payload or {},
            "created_at": created_at,
        }

    def rep_dashboard_stats(self, rep_id: str) -> dict:
        assisted = self._conn.execute(
            "SELECT COUNT(*) AS n FROM reports WHERE facilitated_by_rep=?",
            (rep_id,),
        ).fetchone()
        trained = self._conn.execute(
            """
            SELECT COUNT(DISTINCT user_id) AS n FROM quiz_attempts
            WHERE facilitated_by_rep=?
            """,
            (rep_id,),
        ).fetchone()
        shares = self._conn.execute(
            """
            SELECT COUNT(*) AS n FROM rep_events
            WHERE rep_id=? AND event_type='warning_share'
            """,
            (rep_id,),
        ).fetchone()
        attempts = self._conn.execute(
            """
            SELECT user_id, assessment_type, score FROM quiz_attempts
            WHERE facilitated_by_rep=?
            """,
            (rep_id,),
        ).fetchall()
        by_user: dict[str, dict[str, float]] = {}
        for row in attempts:
            bucket = by_user.setdefault(row["user_id"], {})
            bucket[row["assessment_type"]] = float(row["score"])
        improvements = [
            post - pre
            for scores in by_user.values()
            if (pre := scores.get("pre")) is not None and (post := scores.get("post")) is not None
        ]
        avg_improvement = round(sum(improvements) / len(improvements), 1) if improvements else None
        pending_tips = self._conn.execute(
            """
            SELECT COUNT(*) AS n FROM stk_tip_requests
            WHERE rep_id=? AND status='pending'
            """,
            (rep_id,),
        ).fetchone()
        return {
            "rep_id": rep_id,
            "reports_assisted": int(assisted["n"]) if assisted else 0,
            "people_trained": int(trained["n"]) if trained else 0,
            "warnings_shared": int(shares["n"]) if shares else 0,
            "avg_improvement_pp": avg_improvement,
            "stk_tips_pending": int(pending_tips["n"]) if pending_tips else 0,
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
            "assisted_reports": self.count_assisted_reports(),
            "stk_tips_pending": len(self.list_stk_tip_requests(status="pending")),
            "training": self.training_stats(),
        }