"""PostgREST-backed MoMoGuard store (service role, server-side only)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx

from controller.momoguard_store import (
    REPORT_STATUSES,
    SCAM_TYPES,
    WARNING_STATUSES,
    normalize_phone,
)

_TIMEOUT_S = float(os.environ.get("SUPABASE_HTTP_TIMEOUT_S", "10"))

_DELETE_ORDER = (
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
)

HOLD_STATUSES = frozenset({"held", "released", "reversed", "extended"})


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def _headers(key: str, *, represent: bool = False) -> dict[str, str]:
    prefer = "return=representation" if represent else "return=minimal"
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


class _Rest:
    def __init__(self, rest: str, key: str) -> None:
        self._rest = rest.rstrip("/")
        self._key = key

    def _client(self) -> httpx.Client:
        return httpx.Client(timeout=_TIMEOUT_S)

    def select(
        self,
        table: str,
        *,
        filters: dict[str, str] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        params: dict[str, str] = {"select": "*"}
        if filters:
            params.update(filters)
        if order:
            params["order"] = order
        if limit is not None:
            params["limit"] = str(limit)
        with self._client() as client:
            resp = client.get(
                f"{self._rest}/{table}",
                params=params,
                headers=_headers(self._key),
            )
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []

    def select_one(self, table: str, **filters: str) -> dict | None:
        rows = self.select(table, filters=filters, limit=1)
        return rows[0] if rows else None

    def insert(self, table: str, row: dict[str, Any], *, represent: bool = True) -> dict | None:
        with self._client() as client:
            resp = client.post(
                f"{self._rest}/{table}",
                json=row,
                headers=_headers(self._key, represent=represent),
            )
            resp.raise_for_status()
            if represent and resp.content:
                body = resp.json()
                if isinstance(body, list) and body:
                    return body[0]
                if isinstance(body, dict):
                    return body
            return None

    def insert_many(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        with self._client() as client:
            resp = client.post(
                f"{self._rest}/{table}",
                json=rows,
                headers=_headers(self._key, represent=False),
            )
            resp.raise_for_status()

    def upsert(self, table: str, row: dict[str, Any], on_conflict: str = "id") -> dict:
        headers = {
            **_headers(self._key, represent=True),
            "Prefer": f"resolution=merge-duplicates,return=representation",
        }
        with self._client() as client:
            resp = client.post(
                f"{self._rest}/{table}",
                json=row,
                headers=headers,
                params={"on_conflict": on_conflict},
            )
            resp.raise_for_status()
            body = resp.json()
            if isinstance(body, list) and body:
                return body[0]
            return body

    def patch(self, table: str, filters: dict[str, str], patch: dict[str, Any]) -> list[dict]:
        headers = _headers(self._key, represent=True)
        with self._client() as client:
            resp = client.patch(
                f"{self._rest}/{table}",
                params={**filters, "select": "*"},
                json=patch,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []

    def delete_table(self, table: str) -> None:
        with self._client() as client:
            resp = client.delete(
                f"{self._rest}/{table}",
                params={"id": "not.is.null"},
                headers=_headers(self._key),
            )
            resp.raise_for_status()

    def delete_filtered(self, table: str, filters: dict[str, str]) -> None:
        with self._client() as client:
            resp = client.delete(
                f"{self._rest}/{table}",
                params=filters,
                headers=_headers(self._key),
            )
            resp.raise_for_status()


class SupabaseStore:
    backend = "supabase"

    def __init__(self, base_url: str, service_role_key: str) -> None:
        self._rest = _Rest(f"{base_url.rstrip('/')}/rest/v1", service_role_key)

    def reset(self) -> None:
        for table in _DELETE_ORDER:
            self._rest.delete_table(table)

    # --- users ---

    def upsert_user(self, user_id: str, display_name: str, role: str = "user") -> dict:
        row = self._rest.upsert(
            "users",
            {
                "id": user_id,
                "display_name": display_name,
                "role": role,
                "created_at": _now(),
            },
        )
        return self._user_row(row)

    def get_user(self, user_id: str) -> dict | None:
        row = self._rest.select_one("users", id=f"eq.{quote(user_id, safe='')}")
        return self._user_row(row) if row else None

    def list_users(self, role: str | None = None) -> list[dict]:
        filters = {"role": f"eq.{role}"} if role else None
        return [self._user_row(r) for r in self._rest.select("users", filters=filters)]

    def _user_row(self, row: dict) -> dict:
        return {
            "id": row["id"],
            "display_name": row["display_name"],
            "role": row["role"],
            "created_at": row["created_at"],
        }

    # --- reports ---

    def insert_report(self, data: dict[str, Any]) -> dict:
        phone = normalize_phone(data.get("phone_number", ""))
        scam_type = data["scam_type"]
        if scam_type not in SCAM_TYPES:
            raise ValueError(f"invalid scam_type: {scam_type}")
        row = self._rest.insert(
            "reports",
            {
                "reporter_id": data["reporter_id"],
                "phone_number": phone,
                "scam_type": scam_type,
                "description": data.get("description", ""),
                "loss_reported": data.get("loss_reported"),
                "status": "UNVERIFIED",
                "created_at": _now(),
            },
        )
        assert row is not None
        if phone:
            self._touch_number(phone)
        return self._report_row(row)

    def get_report(self, report_id: int) -> dict | None:
        row = self._rest.select_one("reports", id=f"eq.{report_id}")
        return self._report_row(row) if row else None

    def list_reports(
        self,
        *,
        status: str | None = None,
        phone_number: str | None = None,
        scam_type: str | None = None,
    ) -> list[dict]:
        filters: dict[str, str] = {}
        if status:
            filters["status"] = f"eq.{status}"
        if phone_number:
            filters["phone_number"] = f"eq.{normalize_phone(phone_number)}"
        if scam_type:
            filters["scam_type"] = f"eq.{scam_type}"
        rows = self._rest.select("reports", filters=filters or None, order="created_at.desc")
        return [self._report_row(r) for r in rows]

    def update_report_status(self, report_id: int, status: str) -> dict | None:
        if status not in REPORT_STATUSES:
            raise ValueError(f"invalid status: {status}")
        updated = self._rest.patch("reports", {"id": f"eq.{report_id}"}, {"status": status})
        if not updated:
            return None
        report = self._report_row(updated[0])
        if report["phone_number"]:
            self._refresh_number_status(report["phone_number"])
        return report

    def _report_row(self, row: dict) -> dict:
        return {
            "id": row["id"],
            "reporter_id": row["reporter_id"],
            "phone_number": row["phone_number"],
            "scam_type": row["scam_type"],
            "description": row["description"],
            "loss_reported": row["loss_reported"],
            "status": row["status"],
            "created_at": row["created_at"],
        }

    def _touch_number(self, phone: str) -> None:
        existing = self.get_number(phone)
        if existing:
            self._rest.patch(
                "numbers",
                {"phone_number": f"eq.{phone}"},
                {"updated_at": _now()},
            )
        else:
            self._rest.insert(
                "numbers",
                {
                    "phone_number": phone,
                    "current_status": "unknown",
                    "updated_at": _now(),
                },
                represent=False,
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
        existing = self.get_number(phone)
        payload = {"current_status": status, "updated_at": _now()}
        if existing:
            self._rest.patch("numbers", {"phone_number": f"eq.{phone}"}, payload)
        else:
            self._rest.insert(
                "numbers",
                {"phone_number": phone, **payload},
                represent=False,
            )

    def get_number(self, phone: str) -> dict | None:
        phone = normalize_phone(phone)
        return self._rest.select_one("numbers", phone_number=f"eq.{phone}")

    def reports_for_number(self, phone: str) -> list[dict]:
        return self.list_reports(phone_number=phone)

    # --- warnings ---

    def insert_warning(self, data: dict[str, Any]) -> dict:
        row = self._rest.insert(
            "warnings",
            {
                "title": data["title"],
                "description": data.get("description", ""),
                "scam_type": data.get("scam_type", "other"),
                "status": data.get("status", "draft"),
                "created_at": _now(),
            },
        )
        assert row is not None
        return self._warning_row(row)

    def get_warning(self, warning_id: int) -> dict | None:
        row = self._rest.select_one("warnings", id=f"eq.{warning_id}")
        return self._warning_row(row) if row else None

    def list_warnings(self, *, status: str | None = None) -> list[dict]:
        filters = {"status": f"eq.{status}"} if status else None
        rows = self._rest.select("warnings", filters=filters, order="created_at.desc")
        return [self._warning_row(r) for r in rows]

    def update_warning(self, warning_id: int, patch: dict[str, Any]) -> dict | None:
        warning = self.get_warning(warning_id)
        if not warning:
            return None
        status = patch.get("status", warning["status"])
        if status not in WARNING_STATUSES:
            raise ValueError(f"invalid warning status: {status}")
        body = {
            "title": patch.get("title", warning["title"]),
            "description": patch.get("description", warning["description"]),
            "scam_type": patch.get("scam_type", warning["scam_type"]),
            "status": status,
        }
        if status == "published" and warning["status"] != "published":
            body["published_at"] = _now()
        elif warning.get("published_at"):
            body["published_at"] = warning["published_at"]
        updated = self._rest.patch("warnings", {"id": f"eq.{warning_id}"}, body)
        return self._warning_row(updated[0]) if updated else None

    def _warning_row(self, row: dict) -> dict:
        return {
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "scam_type": row["scam_type"],
            "status": row["status"],
            "created_at": row["created_at"],
            "published_at": row.get("published_at"),
        }

    # --- training ---

    def insert_scenario(self, data: dict[str, Any]) -> dict:
        row = self._rest.insert(
            "training_scenarios",
            {
                "title": data["title"],
                "description": data.get("description", ""),
                "scam_category": data["scam_category"],
                "explanation": data.get("explanation", ""),
            },
        )
        assert row is not None
        return dict(row)

    def get_scenario(self, scenario_id: int) -> dict | None:
        return self._rest.select_one("training_scenarios", id=f"eq.{scenario_id}")

    def list_scenarios(self) -> list[dict]:
        return self._rest.select("training_scenarios", order="id.asc")

    def insert_question(self, data: dict[str, Any]) -> dict:
        opts = data["answer_options"]
        if isinstance(opts, list):
            opts_json = opts
        else:
            opts_json = json.loads(opts)
        row = self._rest.insert(
            "training_questions",
            {
                "scenario_id": data.get("scenario_id"),
                "question": data["question"],
                "answer_options": opts_json,
                "correct_answer": data["correct_answer"],
                "explanation": data.get("explanation", ""),
                "scam_category": data["scam_category"],
                "assessment_tag": data.get("assessment_tag", "practice"),
            },
        )
        assert row is not None
        return self._question_row(row)

    def get_question(self, question_id: int) -> dict | None:
        row = self._rest.select_one("training_questions", id=f"eq.{question_id}")
        return self._question_row(row) if row else None

    def list_questions(
        self, *, assessment_tag: str | None = None, category: str | None = None
    ) -> list[dict]:
        filters: dict[str, str] = {}
        if assessment_tag:
            filters["assessment_tag"] = f"eq.{assessment_tag}"
        if category:
            filters["scam_category"] = f"eq.{category}"
        rows = self._rest.select(
            "training_questions",
            filters=filters or None,
            order="id.asc",
        )
        return [self._question_row(r) for r in rows]

    def _question_row(self, row: dict) -> dict:
        opts = row["answer_options"]
        if isinstance(opts, str):
            opts = json.loads(opts)
        return {
            "id": row["id"],
            "scenario_id": row.get("scenario_id"),
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
        attempt = self._rest.insert(
            "quiz_attempts",
            {
                "user_id": user_id,
                "assessment_type": assessment_type,
                "score": score,
                "total_questions": total,
                "completed_at": completed_at,
            },
        )
        assert attempt is not None
        attempt_id = attempt["id"]
        self._rest.insert_many(
            "quiz_responses",
            [
                {
                    "attempt_id": attempt_id,
                    "question_id": r["question_id"],
                    "selected_answer": r["selected_answer"],
                    "is_correct": r["is_correct"],
                }
                for r in responses
            ],
        )
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
        rows = self._rest.select(
            "quiz_attempts",
            filters={"user_id": f"eq.{quote(user_id, safe='')}"},
            order="completed_at.desc",
        )
        return [
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "assessment_type": r["assessment_type"],
                "score": r["score"],
                "total_questions": r["total_questions"],
                "completed_at": r["completed_at"],
            }
            for r in rows
        ]

    def training_stats(self) -> dict:
        attempts = self._rest.select("quiz_attempts")
        by_type: dict[str, dict] = {}
        for a in attempts:
            t = a["assessment_type"]
            bucket = by_type.setdefault(t, {"scores": [], "count": 0})
            bucket["scores"].append(a["score"])
            bucket["count"] += 1
        by_assessment_type = {
            t: {
                "avg_score": round(sum(v["scores"]) / len(v["scores"]), 1),
                "count": v["count"],
            }
            for t, v in by_type.items()
            if v["scores"]
        }
        pre_users = {a["user_id"] for a in attempts if a["assessment_type"] == "pre"}
        post_users = {a["user_id"] for a in attempts if a["assessment_type"] == "post"}
        both = pre_users & post_users
        improvement = 0.0
        if both:
            deltas = []
            for uid in both:
                pre = sorted(
                    [a for a in attempts if a["user_id"] == uid and a["assessment_type"] == "pre"],
                    key=lambda x: x["completed_at"],
                    reverse=True,
                )
                post = sorted(
                    [a for a in attempts if a["user_id"] == uid and a["assessment_type"] == "post"],
                    key=lambda x: x["completed_at"],
                    reverse=True,
                )
                if pre and post:
                    deltas.append(post[0]["score"] - pre[0]["score"])
            if deltas:
                improvement = round(sum(deltas) / len(deltas), 1)
        responses = self._rest.select(
            "quiz_responses",
            filters={"is_correct": "eq.false"},
        )
        qids = {r["question_id"] for r in responses}
        questions = (
            self._rest.select("training_questions")
            if qids
            else []
        )
        qmap = {q["id"]: q for q in questions}
        miss_counts: dict[str, int] = {}
        for r in responses:
            q = qmap.get(r["question_id"])
            if not q:
                continue
            cat = q["scam_category"]
            miss_counts[cat] = miss_counts.get(cat, 0) + 1
        most_missed = sorted(miss_counts.items(), key=lambda x: -x[1])[:5]
        return {
            "by_assessment_type": by_assessment_type,
            "users_completed_both": len(both),
            "average_improvement_pp": improvement,
            "most_missed_categories": [
                {"category": c, "misses": n} for c, n in most_missed
            ],
        }

    def get_recommendations(self, user_id: str) -> list[dict]:
        rows = self._rest.select(
            "training_recommendations",
            filters={"user_id": f"eq.{quote(user_id, safe='')}"},
            order="created_at.desc",
        )
        return [
            {"category": r["category"], "reason": r["reason"], "created_at": r["created_at"]}
            for r in rows
        ]

    def _refresh_recommendations(self, user_id: str) -> None:
        self._rest.delete_filtered(
            "training_recommendations",
            {"user_id": f"eq.{quote(user_id, safe='')}"},
        )
        attempts = self._rest.select(
            "quiz_attempts",
            filters={"user_id": f"eq.{quote(user_id, safe='')}"},
        )
        attempt_ids = {a["id"] for a in attempts}
        if not attempt_ids:
            return
        responses = self._rest.select("quiz_responses", filters={"is_correct": "eq.false"})
        relevant = [r for r in responses if r["attempt_id"] in attempt_ids]
        questions = self._rest.select("training_questions")
        qmap = {q["id"]: q for q in questions}
        miss_counts: dict[str, int] = {}
        for r in relevant:
            q = qmap.get(r["question_id"])
            if not q:
                continue
            cat = q["scam_category"]
            miss_counts[cat] = miss_counts.get(cat, 0) + 1
        rows = []
        for cat, _ in sorted(miss_counts.items(), key=lambda x: -x[1]):
            rows.append(
                {
                    "user_id": user_id,
                    "category": cat,
                    "reason": f"You missed questions about {cat.replace('_', ' ')}. Review this category.",
                    "created_at": _now(),
                }
            )
        if rows:
            self._rest.insert_many("training_recommendations", rows)

    # --- holds ---

    def insert_hold(self, data: dict[str, Any]) -> dict:
        hold_minutes = int(data.get("hold_minutes") or 0)
        created_at = _now()
        release_at = (
            datetime.now(timezone.utc) + timedelta(minutes=hold_minutes)
        ).replace(tzinfo=None).isoformat(timespec="seconds")
        row = self._rest.insert(
            "holds",
            {
                "payer": normalize_phone(data["payer"]),
                "payee": normalize_phone(data["payee"]),
                "amount": float(data["amount"]),
                "risk_level": data["risk_level"],
                "reasons": data.get("reasons") or [],
                "hold_minutes": hold_minutes,
                "created_at": created_at,
                "release_at": release_at,
                "status": "held",
                "sandbox_txn_ref": data.get("sandbox_txn_ref"),
            },
        )
        return self._hold_row(row or {})

    def get_hold(self, hold_id: int) -> dict | None:
        row = self._rest.select_one("holds", id=f"eq.{hold_id}")
        return self._hold_row(row) if row else None

    def list_holds(self, *, status: str | None = None, payee: str | None = None) -> list[dict]:
        filters: dict[str, str] = {}
        if status:
            filters["status"] = f"eq.{status}"
        if payee:
            filters["payee"] = f"eq.{quote(normalize_phone(payee), safe='')}"
        rows = self._rest.select("holds", filters=filters or None, order="created_at.desc")
        return [self._hold_row(r) for r in rows]

    def active_hold_for_payee(self, payee: str) -> dict | None:
        payee = normalize_phone(payee)
        now = _now()
        rows = self._rest.select(
            "holds",
            filters={
                "payee": f"eq.{quote(payee, safe='')}",
                "status": "eq.held",
                "release_at": f"gt.{now}",
            },
            order="release_at.desc",
            limit=1,
        )
        return self._hold_row(rows[0]) if rows else None

    def update_hold_status(
        self, hold_id: int, status: str, *, rep_id: str | None = None
    ) -> dict | None:
        if status not in HOLD_STATUSES:
            raise ValueError(f"invalid hold status: {status}")
        patch: dict[str, Any] = {"status": status}
        if rep_id:
            patch["rep_id"] = rep_id
        rows = self._rest.patch("holds", {"id": f"eq.{hold_id}"}, patch)
        if not rows:
            return self.get_hold(hold_id)
        return self._hold_row(rows[0])

    def extend_hold(self, hold_id: int, extra_minutes: int, *, rep_id: str | None = None) -> dict | None:
        hold = self.get_hold(hold_id)
        if not hold or hold["status"] not in ("held", "extended"):
            return None
        release_raw = hold.get("release_at") or _now()
        try:
            release = datetime.fromisoformat(str(release_raw).replace("Z", "+00:00"))
        except ValueError:
            release = datetime.now(timezone.utc)
        new_release = (release + timedelta(minutes=extra_minutes)).replace(tzinfo=None).isoformat(
            timespec="seconds"
        )
        patch = {
            "release_at": new_release,
            "hold_minutes": int(hold.get("hold_minutes") or 0) + extra_minutes,
            "status": "extended",
        }
        if rep_id:
            patch["rep_id"] = rep_id
        rows = self._rest.patch("holds", {"id": f"eq.{hold_id}"}, patch)
        return self._hold_row(rows[0]) if rows else self.get_hold(hold_id)

    def expire_released_holds(self, *, payee: str | None = None) -> None:
        now = _now()
        filters: dict[str, str] = {
            "status": "in.(held,extended)",
            "release_at": f"lte.{now}",
        }
        if payee:
            filters["payee"] = f"eq.{quote(normalize_phone(payee), safe='')}"
        rows = self._rest.select("holds", filters=filters)
        for row in rows:
            self._rest.patch("holds", {"id": f"eq.{row['id']}"}, {"status": "released"})

    def get_pair_history(self, payer: str, payee: str) -> dict | None:
        return self._rest.select_one(
            "pair_history",
            payer=f"eq.{quote(normalize_phone(payer), safe='')}",
            payee=f"eq.{quote(normalize_phone(payee), safe='')}",
        )

    def record_pair_payment(self, payer: str, payee: str) -> None:
        payer = normalize_phone(payer)
        payee = normalize_phone(payee)
        existing = self.get_pair_history(payer, payee)
        if existing:
            self._rest.patch(
                "pair_history",
                {"id": f"eq.{existing['id']}"},
                {"payment_count": int(existing.get("payment_count") or 0) + 1},
            )
        else:
            self._rest.insert(
                "pair_history",
                {
                    "payer": payer,
                    "payee": payee,
                    "first_seen": _now(),
                    "payment_count": 1,
                },
            )

    def _hold_row(self, row: dict) -> dict:
        reasons = row.get("reasons") or []
        if isinstance(reasons, str):
            reasons = json.loads(reasons)
        return {
            "id": row["id"],
            "payer": row["payer"],
            "payee": row["payee"],
            "amount": row["amount"],
            "risk_level": row["risk_level"],
            "reasons": reasons,
            "hold_minutes": row["hold_minutes"],
            "created_at": row["created_at"],
            "release_at": row["release_at"],
            "status": row["status"],
            "rep_id": row.get("rep_id"),
            "sandbox_txn_ref": row.get("sandbox_txn_ref"),
        }

    def overview_stats(self) -> dict:
        reports = self._rest.select("reports")
        warnings = self._rest.select("warnings")
        reports_by_status: dict[str, int] = {}
        for r in reports:
            reports_by_status[r["status"]] = reports_by_status.get(r["status"], 0) + 1
        warnings_by_status: dict[str, int] = {}
        for w in warnings:
            warnings_by_status[w["status"]] = warnings_by_status.get(w["status"], 0) + 1
        tactic_counts: dict[str, int] = {}
        for r in reports:
            if r["status"] not in ("UNVERIFIED", "UNDER_REVIEW", "CORROBORATED"):
                continue
            tactic_counts[r["scam_type"]] = tactic_counts.get(r["scam_type"], 0) + 1
        top_tactics = sorted(tactic_counts.items(), key=lambda x: -x[1])[:5]
        return {
            "reports_by_status": reports_by_status,
            "warnings_by_status": warnings_by_status,
            "top_tactics": [{"scam_type": t, "count": n} for t, n in top_tactics],
            "training": self.training_stats(),
        }