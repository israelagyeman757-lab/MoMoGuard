def test_health_alias(client):
    assert client.get("/health").json()["status"] == "ok"