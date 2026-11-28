from __future__ import annotations

import logging
import os

from controller.community.sqlite_store import SQLiteCommunityStore
from controller.community.store import CommunityStore
from controller.community.supabase_store import SupabaseCommunityStore

_log = logging.getLogger(__name__)
_warned_ephemeral = False


def create_community_store(*, sqlite_path: str | None = None) -> CommunityStore:
    """SQLite by default (CI/tests). Supabase when both SUPABASE_* vars are set."""
    global _warned_ephemeral
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if url and key:
        return SupabaseCommunityStore(url, key)
    path = (
        sqlite_path
        if sqlite_path is not None
        else os.environ.get("COMMUNITY_SQLITE_PATH", ":memory:")
    )
    on_vercel = bool(os.environ.get("VERCEL")) or bool(os.environ.get("VERCEL_ENV"))
    if on_vercel and not _warned_ephemeral and path == ":memory:":
        _warned_ephemeral = True
        _log.warning(
            "Community reports use ephemeral in-memory SQLite on Vercel. "
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for durable storage."
        )
    return SQLiteCommunityStore(path)