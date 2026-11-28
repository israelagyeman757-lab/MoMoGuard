"""Simple demo moderator authentication (no secrets committed)."""

from __future__ import annotations

import os
from typing import Any

# Demo tokens for hackathon only — override via env in production demos.
_DEMO_MODERATOR_TOKEN = os.environ.get("MODERATOR_DEMO_TOKEN", "demo-mod-token")
_DEMO_VIEWER_TOKEN = os.environ.get("VIEWER_DEMO_TOKEN", "demo-view-token")


def verify_token(authorization: str | None) -> dict[str, Any] | None:
    if not authorization:
        return None
    token = authorization.removeprefix("Bearer ").strip()
    if token == _DEMO_MODERATOR_TOKEN:
        return {"user_id": "mod-001", "role": "moderator", "display_name": "Demo Moderator"}
    if token == _DEMO_VIEWER_TOKEN:
        return {"user_id": "mod-viewer", "role": "viewer", "display_name": "Demo Viewer"}
    return None


def require_moderator(authorization: str | None, *, allow_viewer: bool = False) -> dict[str, Any]:
    user = verify_token(authorization)
    if not user:
        raise PermissionError("authentication required")
    if user["role"] == "moderator":
        return user
    if allow_viewer and user["role"] == "viewer":
        return user
    raise PermissionError("moderator role required")