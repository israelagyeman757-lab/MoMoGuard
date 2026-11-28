from __future__ import annotations

import os
from typing import Any

import httpx

_TIMEOUT_S = float(os.environ.get("SUPABASE_HTTP_TIMEOUT_S", "10"))


def _headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _row_to_api(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "ts": row["ts"],
        "report_day": row["day"],
        "reporter_id_hash": row["reporter_id"],
        "number": row["number"],
        "trick": row["trick"],
        "description": row.get("description", ""),
        "community": row.get("community", ""),
        "incident_time": row.get("incident_time", ""),
        "claimed_identity": row.get("claimed_identity", ""),
        "request_type": row.get("request_type", ""),
        "lost_money": row.get("lost_money"),
        "channel": row.get("channel", ""),
        "verification_state": row.get("verification_state", "unverified"),
        "moderation_status": row.get("moderation_status", "pending"),
    }


def _row_from_api(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "ts": item["ts"],
        "day": item["report_day"],
        "reporter_id": item["reporter_id_hash"],
        "number": item["number"],
        "trick": item["trick"],
        "description": item.get("description", ""),
        "community": item.get("community", ""),
        "incident_time": item.get("incident_time", ""),
        "claimed_identity": item.get("claimed_identity", ""),
        "request_type": item.get("request_type", ""),
        "lost_money": item.get("lost_money"),
        "channel": item.get("channel", ""),
        "verification_state": item.get("verification_state", "unverified"),
        "moderation_status": item.get("moderation_status", "pending"),
    }


from controller.community.store import CommunityStore


class SupabaseCommunityStore(CommunityStore):
    """PostgREST client using the service role key (server-side only)."""

    backend = "supabase"

    def __init__(self, base_url: str, service_role_key: str) -> None:
        self._base = base_url.rstrip("/")
        self._key = service_role_key
        self._rest = f"{self._base}/rest/v1"

    def _client(self) -> httpx.Client:
        return httpx.Client(timeout=_TIMEOUT_S, headers=_headers(self._key))

    def insert_report(self, row: dict[str, Any]) -> bool:
        payload = _row_to_api(row)
        with self._client() as client:
            probe = client.get(
                f"{self._rest}/community_reports",
                params={
                    "select": "id",
                    "number": f"eq.{row['number']}",
                    "reporter_id_hash": f"eq.{row['reporter_id']}",
                    "report_day": f"eq.{row['day']}",
                    "limit": "1",
                },
            )
            probe.raise_for_status()
            if probe.json():
                return False
            resp = client.post(f"{self._rest}/community_reports", json=payload)
            if resp.status_code == 409:
                return False
            resp.raise_for_status()
            return True

    def reports_for_number(self, number: str) -> list[dict[str, Any]]:
        with self._client() as client:
            resp = client.get(
                f"{self._rest}/community_reports",
                params={
                    "select": "*",
                    "number": f"eq.{number}",
                    "order": "ts.desc",
                },
            )
            resp.raise_for_status()
            return [_row_from_api(r) for r in resp.json()]

    def list_reports(self) -> list[dict[str, Any]]:
        with self._client() as client:
            resp = client.get(
                f"{self._rest}/community_reports",
                params={"select": "*", "order": "ts.desc"},
            )
            resp.raise_for_status()
            return [_row_from_api(r) for r in resp.json()]

    def reset(self) -> None:
        with self._client() as client:
            for table in ("community_warnings", "community_reports"):
                resp = client.delete(
                    f"{self._rest}/{table}",
                    params={"id": "not.is.null"},
                    headers={**_headers(self._key), "Prefer": "return=minimal"},
                )
                resp.raise_for_status()