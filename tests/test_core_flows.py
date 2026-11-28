from controller.seed import DEMO_SCAM_NUMBER

MOD = {"Authorization": "Bearer demo-mod-token"}


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_report_submit_hidden_reporter(client):
    r = client.post(
        "/reports",
        json={
            "reporter_id": "hidden-test",
            "phone_number": "0244999888",
            "scam_type": "job_offer",
            "description": "Paid registration fee for fake job",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "UNVERIFIED"
    assert body["reporter_id"] == "[hidden]"


def test_moderator_list_and_status(client):
    listed = client.get("/reports", headers=MOD).json()["reports"]
    assert len(listed) >= 2
    rid = listed[0]["id"]
    updated = client.patch(
        f"/reports/{rid}/status",
        headers=MOD,
        json={"status": "UNDER_REVIEW"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "UNDER_REVIEW"


def test_lookup_demo_number(client):
    data = client.get(f"/numbers/check/{DEMO_SCAM_NUMBER}").json()
    assert data["result"] in ("UNDER_REVIEW", "MULTIPLE_REPORTS", "WARNING_AVAILABLE", "NO_REPORTS_FOUND")
    assert "No reports found does not mean safe" in data["disclaimer"]


def test_warning_publish_and_lookup(client):
    w = client.post(
        "/warnings",
        headers=MOD,
        json={
            "title": "Fake MTN agents asking for PIN",
            "description": f"Reports mention {DEMO_SCAM_NUMBER} and similar tactics.",
            "scam_type": "fake_mtn_rep",
        },
    ).json()
    client.patch(f"/warnings/{w['id']}", headers=MOD, json={"status": "published"})
    warnings = client.get("/warnings").json()["warnings"]
    assert any(x["status"] == "published" for x in warnings)


def test_training_pre_post(client):
    pre_q = client.get("/training/questions?assessment_type=pre").json()["questions"]
    assert len(pre_q) >= 10
    answers = [
        {"question_id": q["id"], "selected_answer": q["correct_answer"]}
        for q in pre_q[:10]
    ]
    pre = client.post(
        "/training/attempts",
        json={"user_id": "train-user-1", "assessment_type": "pre", "answers": answers},
    ).json()
    assert pre["score"] == 100.0
    post_q = client.get("/training/questions?assessment_type=post").json()["questions"]
    post_answers = [
        {"question_id": q["id"], "selected_answer": q["correct_answer"]}
        for q in post_q[:10]
    ]
    post = client.post(
        "/training/attempts",
        json={"user_id": "train-user-1", "assessment_type": "post", "answers": post_answers},
    ).json()
    assert post["score"] == 100.0
    recs = client.get("/training/recommendations/train-user-1").json()["recommendations"]
    assert isinstance(recs, list)


def test_ussd_menu_simulated(client):
    sid = "test-session"
    start = client.post("/ussd", json={"session_id": sid, "sender": "0240000001", "key": "start"}).json()
    assert "SIMULATED" in start["text"]
    assert "1 Check suspicious number" in start["text"]
    pick = client.post("/ussd", json={"session_id": sid, "sender": "0240000001", "key": "1"}).json()
    assert "Enter phone number" in pick["text"]


def test_similar_reports(client):
    reports = client.get("/reports", headers=MOD).json()["reports"]
    rid = next(r["id"] for r in reports if r["phone_number"] == DEMO_SCAM_NUMBER)
    detail = client.get(f"/reports/{rid}", headers=MOD).json()
    assert len(detail.get("similar_reports", [])) >= 1


def test_reset_demo(client):
    assert client.post("/reset-demo").json()["status"] == "ok"