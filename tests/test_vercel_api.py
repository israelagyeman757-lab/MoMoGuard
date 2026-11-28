from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
_spec = spec_from_file_location("vercel_api", ROOT / "api" / "index.py")
_mod = module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)


def test_vercel_entry_serves_controller_under_api_prefix():
    with TestClient(_mod.app) as client:
        metrics = client.get("/api/metrics")
        assert metrics.status_code == 200
        assert metrics.json().get("source") == "simulated"

        docs = client.get("/api/docs")
        assert docs.status_code == 200