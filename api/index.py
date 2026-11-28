"""Vercel serverless entry: mounts the controller at /api for same-origin frontends."""

from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from fastapi import FastAPI

from controller.app import create_app

_pause_s = float(os.environ.get("PAUSE_TIMEOUT_S", "180"))
_controller = create_app(pause_timeout_s=_pause_s)

app = FastAPI(title="MoMoGuard API gateway", version="0.2")
app.mount("/api", _controller)