def test_stk_push_enqueue_and_poll(client):
    enqueued = client.post(
        "/stk/push",
        json={
            "text": "Watch for fake reversal calls today.",
            "more": True,
            "report": True,
        },
    )
    assert enqueued.status_code == 200
    body = enqueued.json()
    assert body["text"].startswith("Watch")
    assert body["more"] is True

    first = client.get("/stk/push", params={"consumer": "demo-phone-a"}).json()
    assert first["pending"] is True
    assert first["id"] == body["id"]

    again = client.get("/stk/push", params={"consumer": "demo-phone-a"}).json()
    assert again["pending"] is False

    other = client.get("/stk/push", params={"consumer": "demo-phone-b"}).json()
    assert other["pending"] is True


def test_stk_push_cleared_on_reset(client):
    client.post("/stk/push", json={"text": "temp"})
    assert client.get("/stk/push").json()["pending"] is True
    client.post("/reset-demo")
    assert client.get("/stk/push").json()["pending"] is False