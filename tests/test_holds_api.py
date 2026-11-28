import time

MOD = {"Authorization": "Bearer demo-mod-token"}


def test_evaluate_new_pair_creates_hold(client):
    r = client.post(
        "/holds/evaluate",
        json={
            "payer": "0244999001",
            "payee": "0244888777",
            "amount": 120,
            "payments_from_payer_before": 0,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["hold"] is True
    assert data["minutes"] == 30
    assert data["hold_id"]


def test_withdraw_check_blocks_active_hold(client):
    client.post(
        "/holds/evaluate",
        json={
            "payer": "0244999002",
            "payee": "0244777666",
            "amount": 50,
            "payments_from_payer_before": 0,
        },
    )
    check = client.get("/holds/withdraw-check/0244777666")
    assert check.status_code == 200
    body = check.json()
    assert body["allow"] is False
    assert body["release_at"]
    assert "reason_labels" in body
    assert "new_number_pair" not in body["reason_labels"]["en"]


def test_sandbox_plugin_receive_and_authorize(client):
    client.post(
        "/holds/evaluate",
        json={
            "payer": "0244999003",
            "payee": "0244666555",
            "amount": 40,
            "payments_from_payer_before": 0,
        },
    )
    recv = client.post(
        "/sandbox/plugin",
        json={
            "point": "payment.receive",
            "payer": {"msisdn": "0244999004"},
            "payee": {"msisdn": "0244555444"},
            "amount": 10,
            "paymentsFromThisPayerBefore": 0,
        },
    )
    assert recv.json()["decision"] == "allow"
    start = time.monotonic()
    auth = client.post(
        "/sandbox/plugin",
        json={
            "point": "payment.authorize",
            "payer": {"msisdn": "0244666555"},
            "payee": {"msisdn": "0244000000"},
            "amount": 5,
        },
    )
    assert time.monotonic() - start < 2.0
    body = auth.json()
    assert body["decision"] == "delay"
    assert body["minutes"] >= 1


def test_rep_list_and_release_masked(client):
    ev = client.post(
        "/holds/evaluate",
        json={
            "payer": "0244111222",
            "payee": "0244333444",
            "amount": 75,
            "payments_from_payer_before": 0,
        },
    )
    hold_id = ev.json()["hold_id"]
    listed = client.get("/holds", headers=MOD)
    assert listed.status_code == 200
    holds = listed.json()["holds"]
    row = next(h for h in holds if h["id"] == hold_id)
    assert "payer_masked" in row
    assert "024" in row["payer_masked"]
    assert "****" in row["payer_masked"]
    assert "reasons" not in row
    assert "reason_labels" in row


def test_seed_demo_holds_present(client):
    listed = client.get("/holds", headers=MOD)
    holds = listed.json()["holds"]
    assert len(holds) == 2
    mins = {h["hold_minutes"] for h in holds}
    assert mins == {30, 1440}
    for h in holds:
        assert h["reason_labels"]["en"]
        assert "new_number_pair" not in h["reason_labels"]["en"]


def test_holds_recent_after_reverse(client):
    listed = client.get("/holds", headers=MOD).json()["holds"]
    hold_id = listed[0]["id"]
    client.post(f"/holds/{hold_id}/reverse", headers=MOD)
    recent = client.get("/holds?status=recent", headers=MOD).json()["holds"]
    assert len(recent) >= 2
    statuses = {h["status"] for h in recent}
    assert "reversed" in statuses
    assert "held" in statuses


def test_sandbox_plugin_nested_data_receive_and_cashout_authorize(client):
    """Live Innofemme webhooks nest the payment under `data`."""
    payee_msisdn = "0244999777"
    recv = client.post(
        "/sandbox/plugin",
        json={
            "point": "payment.receive",
            "data": {
                "payer": {"msisdn": "0244999005"},
                "payee": {"msisdn": payee_msisdn, "walletOpenedAt": "2020-01-01T00:00:00Z"},
                "amount": 25,
                "paymentsFromThisPayerBefore": 0,
                "transactionId": "nested-txn-1",
            },
        },
    )
    assert recv.status_code == 200
    assert recv.json()["decision"] == "allow"
    check = client.get(f"/holds/withdraw-check/{payee_msisdn}")
    assert check.json()["allow"] is False

    start = time.monotonic()
    auth = client.post(
        "/sandbox/plugin",
        json={
            "point": "payment.authorize",
            "type": "cashout",
            "data": {
                "payer": {"msisdn": payee_msisdn},
                "payee": {"msisdn": "0000000000"},
                "amount": 20,
            },
        },
    )
    assert time.monotonic() - start < 2.0
    body = auth.json()
    assert body["decision"] == "delay"
    assert body["minutes"] >= 1


def test_sandbox_plugin_receive_skips_agent_and_cashout(client):
    agent = client.post(
        "/sandbox/plugin",
        json={
            "point": "payment.receive",
            "payee": {"msisdn": "0244000001", "walletType": "agent"},
            "payer": {"msisdn": "0244999011"},
            "amount": 10,
            "paymentsFromThisPayerBefore": 0,
        },
    )
    assert agent.json()["decision"] == "allow"
    assert client.get("/holds/withdraw-check/0244000001").json()["allow"] is True

    cashout = client.post(
        "/sandbox/plugin",
        json={
            "point": "payment.receive",
            "type": "cashout",
            "payer": {"msisdn": "0244999012"},
            "payee": {"msisdn": "0244000002"},
            "amount": 10,
            "paymentsFromThisPayerBefore": 0,
        },
    )
    assert cashout.json()["decision"] == "allow"
    assert client.get("/holds/withdraw-check/0244000002").json()["allow"] is True


def test_flagged_payee_24h(client):
    client.post(
        "/reports",
        json={
            "reporter_id": "reporter-1",
            "phone_number": "0244123499",
            "scam_type": "reversal_scam",
            "description": "corroborated demo",
        },
    )
    reports = client.get("/reports", headers=MOD).json()["reports"]
    rid = next(r["id"] for r in reports if r["phone_number"] == "0244123499")
    client.patch(f"/reports/{rid}/status", headers=MOD, json={"status": "CORROBORATED"})
    r = client.post(
        "/holds/evaluate",
        json={
            "payer": "0244999010",
            "payee": "0244123499",
            "amount": 20,
            "payments_from_payer_before": 5,
        },
    )
    assert r.json()["minutes"] == 1440