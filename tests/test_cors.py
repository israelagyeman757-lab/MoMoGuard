from fastapi.testclient import TestClient

from controller.app import create_app
from controller.momoguard_store import MoMoGuardStore

PREVIEW_ORIGIN = "http://127.0.0.1:5500"


def test_preflight_allows_post_from_any_origin():
    store = MoMoGuardStore(":memory:")
    with TestClient(create_app(store=store, seed=False)) as client:
        response = client.options("/ussd", headers={
            "Origin": PREVIEW_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "*"


def test_health_with_origin():
    store = MoMoGuardStore(":memory:")
    with TestClient(create_app(store=store, seed=False)) as client:
        response = client.get("/health", headers={"Origin": PREVIEW_ORIGIN})
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "*"