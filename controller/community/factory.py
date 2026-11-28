from __future__ import annotations

import os

from controller.community.sqlite_store import SQLiteCommunityStore
from controller.community.store import CommunityStore
from controller.community.supabase_store import SupabaseCommunityStore


def create_community_store(*, sqlite_path: str | None = None) -> CommunityStore:
    """SQLite by default (CI/tests). Supabase when both SUPABASE_* vars are set."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if url and key:
        return SupabaseCommunityStore(url, key)
    path = (
        sqlite_path
        if sqlite_path is not None
        else os.environ.get("COMMUNITY_SQLITE_PATH", ":memory:")
    )
    return SQLiteCommunityStore(path)