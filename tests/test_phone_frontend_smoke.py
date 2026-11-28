"""Smoke paths the phone-page api.js expects from the FastAPI controller."""

from controller.seed import DEMO_SCAM_NUMBER


def test_phone_check_number(client):
    r = client.get(f"/numbers/check/{DEMO_SCAM_NUMBER}")
    assert r.status_code == 200
    data = r.json()
    assert data["result"] in (
        "WARNING_AVAILABLE",
        "REPORTS_FOUND",
        "NO_REPORTS_FOUND",
        "INVALID",
        "UNDER_REVIEW",
    )
    assert data["phone_number"] == DEMO_SCAM_NUMBER
    assert data["source"] == "walo_db"


def test_phone_report_scam_201(client):
    body = {
        "reporter_id": "phone-user-1",
        "scam_type": "reversal_scam",
        "description": "Phone-page smoke test",
        "phone_number": "0244777666",
    }
    r = client.post("/reports", json=body)
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "UNVERIFIED"
    assert data["reporter_id"] == "[hidden]"


def test_phone_warnings(client):
    r = client.get("/warnings", params={"status": "published"})
    assert r.status_code == 200
    assert "warnings" in r.json()


def test_phone_training_flow(client):
    scenarios = client.get("/training/scenarios").json()["scenarios"]
    assert len(scenarios) >= 1
    sid = scenarios[0]["id"]
    assert client.get(f"/training/scenarios/{sid}").status_code == 200

    questions = client.get("/training/questions", params={"assessment_type": "pre"}).json()["questions"]
    assert questions
    q0 = questions[0]
    attempt = client.post(
        "/training/attempts",
        json={
            "user_id": "phone-user-1",
            "assessment_type": "pre",
            "answers": [{"question_id": q0["id"], "selected_answer": q0["correct_answer"]}],
        },
    )
    assert attempt.status_code == 200

    results = client.get("/training/results/phone-user-1")
    assert results.status_code == 200
    assert results.json()["user_id"] == "phone-user-1"


def test_phone_stk_push_poll(client):
    enq = client.post(
        "/stk/push",
        json={"text": "Walɔ tip", "more": True, "report": False},
    )
    assert enq.status_code == 200
    msg_id = enq.json()["id"]

    first = client.get("/stk/push", params={"consumer": "phone-user-1"}).json()
    assert first.get("pending") is True
    assert first.get("id") == msg_id

    again = client.get("/stk/push", params={"consumer": "phone-user-1"}).json()
    assert again.get("pending") is False