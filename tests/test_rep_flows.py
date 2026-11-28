REP = {"Authorization": "Bearer demo-rep-token"}
MOD = {"Authorization": "Bearer demo-mod-token"}


def test_rep_demo_login(client):
    data = client.post("/auth/demo-login", json={"role": "rep"}).json()
    assert data["token"] == "demo-rep-token"
    assert data["role"] == "rep"


def test_assisted_report_anonymous(client):
    res = client.post(
        "/rep/assisted-reports",
        headers=REP,
        json={
            "phone_number": "0244111222",
            "scam_type": "fake_mtn_rep",
            "description": "Caller asked neighbour for PIN.",
            "loss_reported": False,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["reporter_id"] == "[hidden]"
    assert "assisted-by-rep" in body["tags"]
    mod_view = client.get("/reports", headers=MOD).json()["reports"]
    assisted = [r for r in mod_view if "assisted-by-rep" in (r.get("tags") or [])]
    assert len(assisted) >= 1
    assert all(r["reporter_id"] == "[hidden]" for r in assisted)


def test_rep_stk_tip_requires_moderator_approval(client):
    queued = client.post(
        "/rep/stk-tips",
        headers=REP,
        json={"text": "Watch fake job fees this week.", "more": True, "report": False},
    )
    assert queued.status_code == 200
    tip_id = queued.json()["id"]

    pending = client.get("/moderator/stk-tips", headers=MOD).json()["tips"]
    assert any(t["id"] == tip_id and t["status"] == "pending" for t in pending)

    assert client.get("/stk/push").json()["pending"] is False

    approved = client.post(f"/moderator/stk-tips/{tip_id}/approve", headers=MOD)
    assert approved.status_code == 200

    poll = client.get("/stk/push", params={"consumer": "rep-test-phone"}).json()
    assert poll["pending"] is True
    assert "fake job" in poll["text"].lower()


def test_rep_dashboard_and_training_facilitation(client):
    pre_q = client.get("/training/questions?assessment_type=pre").json()["questions"][:10]
    client.post(
        "/training/attempts",
        headers=REP,
        json={
            "user_id": "train-kwame",
            "display_name": "Kwame",
            "assessment_type": "pre",
            "answers": [
                {"question_id": q["id"], "selected_answer": q["correct_answer"]} for q in pre_q
            ],
        },
    )
    dash = client.get("/rep/dashboard", headers=REP).json()
    assert dash["people_trained"] >= 1

    overview = client.get("/moderator/overview", headers=MOD).json()
    assert overview.get("assisted_reports", 0) >= 0
    assert "stk_tips_pending" in overview