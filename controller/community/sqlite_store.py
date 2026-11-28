from __future__ import annotations

import sqlite3
from typing import Any

from controller.community.store import CommunityStore

_COMMUNITY_SCHEMA = """
CREATE TABLE IF NOT EXISTS community_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    report_day TEXT NOT NULL,
    reporter_id_hash TEXT NOT NULL,
    number TEXT NOT NULL,
    trick TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    community TEXT NOT NULL DEFAULT '',
    incident_time TEXT NOT NULL DEFAULT '',
    claimed_identity TEXT NOT NULL DEFAULT '',
    request_type TEXT NOT NULL DEFAULT '',
    lost_money INTEGER,
    channel TEXT NOT NULL DEFAULT '',
    verification_state TEXT NOT NULL DEFAULT 'unverified',
    moderation_status TEXT NOT NULL DEFAULT 'pending',
    UNIQUE (number, reporter_id_hash, report_day)
);

CREATE TABLE IF NOT EXISTS community_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES community_reports(id) ON DELETE SET NULL,
    number TEXT NOT NULL,
    headline TEXT NOT NULL,
    body_text TEXT NOT NULL DEFAULT '',
    moderation_status TEXT NOT NULL DEFAULT 'draft',
    published_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_reports_number
    ON community_reports (number);
CREATE INDEX IF NOT EXISTS idx_community_reports_moderation
    ON community_reports (moderation_status, ts DESC);
CREATE INDEX IF NOT EXISTS idx_community_warnings_number
    ON community_warnings (number) WHERE moderation_status = 'published';
"""

_ROW_SELECT = """
SELECT ts, report_day, reporter_id_hash, number, trick,
       description, community, incident_time, claimed_identity,
       request_type, lost_money, channel, verification_state, moderation_status
FROM community_reports
"""


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    lost = row["lost_money"]
    return {
        "ts": row["ts"],
        "day": row["report_day"],
        "reporter_id": row["reporter_id_hash"],
        "number": row["number"],
        "trick": row["trick"],
        "description": row["description"],
        "community": row["community"],
        "incident_time": row["incident_time"],
        "claimed_identity": row["claimed_identity"],
        "request_type": row["request_type"],
        "lost_money": None if lost is None else bool(lost),
        "channel": row["channel"],
        "verification_state": row["verification_state"],
        "moderation_status": row["moderation_status"],
    }


class SQLiteCommunityStore(CommunityStore):
    backend = "sqlite"

    def __init__(self, path: str = ":memory:") -> None:
        self._path = path
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_COMMUNITY_SCHEMA)

    def insert_report(self, row: dict[str, Any]) -> bool:
        lost = row.get("lost_money")
        lost_sql = None if lost is None else (1 if lost else 0)
        try:
            self._conn.execute(
                """
                INSERT INTO community_reports (
                    ts, report_day, reporter_id_hash, number, trick,
                    description, community, incident_time, claimed_identity,
                    request_type, lost_money, channel, verification_state,
                    moderation_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["ts"],
                    row["day"],
                    row["reporter_id"],
                    row["number"],
                    row["trick"],
                    row.get("description", ""),
                    row.get("community", ""),
                    row.get("incident_time", ""),
                    row.get("claimed_identity", ""),
                    row.get("request_type", ""),
                    lost_sql,
                    row.get("channel", ""),
                    row.get("verification_state", "unverified"),
                    row.get("moderation_status", "pending"),
                ),
            )
            self._conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False

    def reports_for_number(self, number: str) -> list[dict[str, Any]]:
        cur = self._conn.execute(
            _ROW_SELECT + " WHERE number = ? ORDER BY ts DESC",
            (number,),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]

    def list_reports(self) -> list[dict[str, Any]]:
        cur = self._conn.execute(_ROW_SELECT + " ORDER BY ts DESC")
        return [_row_to_dict(r) for r in cur.fetchall()]

    def reset(self) -> None:
        self._conn.execute("DELETE FROM community_warnings")
        self._conn.execute("DELETE FROM community_reports")
        self._conn.commit()