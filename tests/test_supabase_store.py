"""Supabase store and factory tests (HTTP mocked — no live calls)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from controller.seed import ensure_demo_seed, seed_demo
from controller.store_factory import create_store
from controller.supabase_store import SupabaseStore
def _mock_response(status_code: int, json_body=None, content=b""):
    resp = MagicMock()
    resp.status_code = status_code
    resp.content = content if json_body is None else json.dumps(json_body).encode()
    resp.json.return_value = json_body if json_body is not None else []
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        resp.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
    return resp


class _MockClient:
    def __init__(self, routes: dict) -> None:
        self._routes = routes
        self._store: dict[str, list[dict]] = {
            "users": [],
            "reports": [],
            "numbers": [],
            "warnings": [],
            "training_scenarios": [],
            "training_questions": [],
            "quiz_attempts": [],
            "quiz_responses": [],
            "training_recommendations": [],
        }
        self._id_seq = 1

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get(self, url: str, params=None, headers=None):
        table = url.rstrip("/").split("/")[-1]
        rows = list(self._store.get(table, []))
        if params:
            for key, val in params.items():
                if key in ("select", "order", "limit", "on_conflict"):
                    continue
                if val.startswith("eq."):
                    needle = val[3:]
                    rows = [r for r in rows if str(r.get(key)) == needle]
        return _mock_response(200, rows)

    def post(self, url: str, json=None, headers=None, params=None):
        table = url.rstrip("/").split("/")[-1]
        payload = json if isinstance(json, list) else [json]
        created = []
        for row in payload:
            if row is None:
                continue
            out = dict(row)
            if table != "users" and "id" not in out:
                out["id"] = self._id_seq
                self._id_seq += 1
            if table == "users" and any(u["id"] == row["id"] for u in self._store["users"]):
                for i, u in enumerate(self._store["users"]):
                    if u["id"] == row["id"]:
                        self._store["users"][i] = {**u, **out}
                        created.append(self._store["users"][i])
                        break
            else:
                self._store.setdefault(table, []).append(out)
                created.append(out)
        represent = headers and "return=representation" in headers.get("Prefer", "")
        body = created[0] if len(created) == 1 and represent else created
        return _mock_response(201, body if represent else None, b"" if not represent else b"x")

    def patch(self, url: str, params=None, json=None, headers=None):
        table = url.rstrip("/").split("/")[-1]
        updated = []
        for i, row in enumerate(self._store.get(table, [])):
            match = True
            if params:
                for key, val in params.items():
                    if key == "select":
                        continue
                    if val.startswith("eq.") and str(row.get(key)) != val[3:]:
                        match = False
            if match and json:
                self._store[table][i] = {**row, **json}
                updated.append(self._store[table][i])
        return _mock_response(200, updated)

    def delete(self, url: str, params=None, headers=None):
        table = url.rstrip("/").split("/")[-1]
        if table in self._store:
            kept = []
            for row in self._store[table]:
                drop = False
                if params:
                    for key, val in params.items():
                        if val == "not.is.null" and key in row:
                            drop = True
                            break
                        if val.startswith("eq.") and str(row.get(key)) == val[3:]:
                            drop = True
                            break
                if not drop:
                    kept.append(row)
                elif params and params.get(key, "").startswith("eq."):
                    continue
                elif params and "not.is.null" in params.values():
                    continue
                else:
                    kept.append(row)
            if params and list(params.values())[0] == "not.is.null":
                self._store[table] = []
            else:
                self._store[table] = [
                    r
                    for r in self._store[table]
                    if not all(
                        str(r.get(k)) == v[3:]
                        for k, v in (params or {}).items()
                        if v.startswith("eq.")
                    )
                ]
        return _mock_response(204, [])


@patch("controller.supabase_store.httpx.Client")
def test_factory_selects_supabase_when_env_set(mock_client_cls, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    store = create_store()
    assert store.backend == "supabase"
    assert isinstance(store, SupabaseStore)


@patch("controller.supabase_store.httpx.Client")
def test_supabase_insert_and_list_report(mock_client_cls):
    mock_client_cls.return_value = _MockClient({})
    store = SupabaseStore("https://example.supabase.co", "key")
    assert store.insert_report(
        {
            "reporter_id": "r1",
            "phone_number": "0244999888",
            "scam_type": "job_offer",
            "description": "test",
        }
    )["status"] == "UNVERIFIED"
    listed = store.list_reports(phone_number="0244999888")
    assert len(listed) == 1
    assert listed[0]["scam_type"] == "job_offer"


@patch("controller.supabase_store.httpx.Client")
def test_ensure_demo_seed_idempotent(mock_client_cls):
    mock_client_cls.return_value = _MockClient({})
    store = SupabaseStore("https://example.supabase.co", "key")
    ensure_demo_seed(store)
  # should insert demo users/questions/reports
    assert store.get_user("mod-001") is not None
    q_count = len(store.list_questions(assessment_tag="pre"))
    assert q_count >= 10
    ensure_demo_seed(store)
    assert len(store.list_questions(assessment_tag="pre")) == q_count


@patch("controller.supabase_store.httpx.Client")
def test_supabase_reset_then_seed(mock_client_cls):
    mock_client_cls.return_value = _MockClient({})
    store = SupabaseStore("https://example.supabase.co", "key")
    seed_demo(store)
    assert len(store.list_reports()) >= 2
    store.reset()
    assert store.list_reports() == []
    seed_demo(store, reset=False)
    assert len(store.list_reports()) >= 2