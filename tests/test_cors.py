from fastapi.testclient import TestClient

from controller.app import create_app

PREVIEW_ORIGIN = "http://127.0.0.1:5500"


def test_dev_preview_origin_gets_cors_headers():
    with TestClient(create_app()) as client:
        response = client.get("/metrics", headers={"Origin": PREVIEW_ORIGIN})
        assert response.headers["access-control-allow-origin"] == PREVIEW_ORIGIN


def test_preflight_allows_post_from_preview_origin():
    with TestClient(create_app()) as client:
        response = client.options("/ussd", headers={
            "Origin": PREVIEW_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == PREVIEW_ORIGIN


def test_unknown_origin_gets_no_cors_allow_header():
    with TestClient(create_app()) as client:
        response = client.get("/metrics", headers={"Origin": "http://evil.example"})
        assert "access-control-allow-origin" not in response.headers
