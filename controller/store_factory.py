from __future__ import annotations

import logging
import os

from controller.momoguard_store import MoMoGuardStore

_log = logging.getLogger(__name__)
_warned_ephemeral = False


def create_store(*, sqlite_path: str | None = None) -> MoMoGuardStore:
    """SQLite by default. Supabase optional when SUPABASE_* vars are set (reports adapter)."""
    global _warned_ephemeral
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if url and key:
        _log.info("SUPABASE_* set; SQLite still used for hackathon MVP (Supabase schema optional).")
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
            "Set COMMUNITY_SQLITE_PATH or SUPABASE for durable storage."
        )
    return MoMoGuardStore(path)