from __future__ import annotations

import logging
import os

from controller.momoguard_store import MoMoGuardStore
from controller.supabase_store import SupabaseStore

_log = logging.getLogger(__name__)
_warned_ephemeral = False


def create_store(*, sqlite_path: str | None = None) -> MoMoGuardStore | SupabaseStore:
    """SQLite by default (CI/tests). Supabase when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."""
    global _warned_ephemeral
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if url and key:
        _log.info("Using Supabase backend for MoMoGuard persistence.")
        return SupabaseStore(url, key)
    path = (
        sqlite_path
        if sqlite_path is not None
        else os.environ.get("COMMUNITY_SQLITE_PATH", ":memory:")
    )
    on_vercel = bool(os.environ.get("VERCEL")) or bool(os.environ.get("VERCEL_ENV"))
    if on_vercel and not _warned_ephemeral and path == ":memory:":
        _warned_ephemeral = True
        _log.warning(
            "Using ephemeral in-memory SQLite on Vercel. "
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for durable storage."
        )
    return MoMoGuardStore(path)