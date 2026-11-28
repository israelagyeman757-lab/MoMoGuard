"""End-to-end API tests for the Track 4 community pivot: reports -> numbers
-> moderator review -> warnings -> training, all through the real FastAPI
app, alongside the untouched payment-risk endpoints."""

import pytest
from fastapi.testclient import TestClient

from controller.app import create_app

STRANGER = "0240000005"
REPORTED = "0240000009"


@pytest.fixture
def client():
    with TestClient(create_app(pause_timeout_s=180)) as c:
        yield c


def test_create_report_then_list_pending(client):
    r = client.post("/reports", json={
        "number": STRANGER, "trick": "possible_impersonation", "reporter_id": "u1"})
    assert r.status_code == 200
    assert r.json()["accepted"] is True

    pending = client.get("/reports", params={"status": "pending"}).json()["reports"]
    assert len(pending) == 1
    assert pending[0]["number"] == STRANGER
    assert pending[0]["status"] == "pending"


def test_duplicate_report_same_day_is_rejected(client):
    body = {"number": STRANGER, "trick": "possible_impersonation", "reporter_id": "u1"}
    assert client.post("/reports", json=body).json()["accepted"] is True
    assert client.post("/reports", json=body).json()["accepted"] is False


def test_second_report_from_different_reporter_shows_up_in_dashboard(client):
    client.post("/reports", json={"number": STRANGER, "trick": "possible_impersonation",
                                  "reporter_id": "u1"})
    client.post("/reports", json={"number": STRANGER, "trick": "possible_advance_fee",
                                  "reporter_id": "u2"})
    reports = client.get("/reports").json()["reports"]
    assert len(reports) == 2
    info = client.get(f"/numbers/check/{STRANGER}").json()
    assert info["report_count"] == 2


def test_full_loop_report_moderate_publish_lookup(client):
    created = client.post("/reports", json={
        "number": STRANGER, "trick": "possible_impersonation", "reporter_id": "u1"}).json()
    report_id = created["report"]["id"]

    before = client.get(f"/numbers/check/{STRANGER}").json()
    assert before["warnings"] == []

    published = client.patch(f"/reports/{report_id}/status", json={"status": "published"}).json()
    assert published["report"]["status"] == "published"
    assert published["warning"] is not None

    warnings = client.get("/warnings").json()["warnings"]
    assert len(warnings) == 1
    assert warnings[0]["number"] == STRANGER

    after = client.get(f"/numbers/check/{STRANGER}").json()
    assert len(after["warnings"]) == 1
    assert "not proof" in after["warnings"][0]["message"]


def test_rejecting_a_report_publishes_no_warning(client):
    created = client.post("/reports", json={
        "number": STRANGER, "trick": "possible_impersonation", "reporter_id": "u1"}).json()
    report_id = created["report"]["id"]
    rejected = client.patch(f"/reports/{report_id}/status", json={"status": "rejected"}).json()
    assert rejected["warning"] is None
    assert client.get("/warnings").json()["warnings"] == []


def test_patch_unknown_report_is_404(client):
    r = client.patch("/reports/9999/status", json={"status": "published"})
    assert r.status_code == 404


def test_check_number_never_says_safe_when_unreported(client):
    info = client.get("/numbers/check/0200000000").json()
    assert info["risk"] == "unreported"
    assert "not proof it is safe" in info["message"]


def test_reset_demo_also_clears_community_data(client):
    client.post("/reports", json={"number": STRANGER, "trick": "possible_impersonation",
                                  "reporter_id": "u1"})
    client.post("/reset-demo", json={})
    assert client.get("/reports").json()["reports"] == []
    assert client.get("/warnings").json()["warnings"] == []


def test_training_scenario_is_fetchable(client):
    r = client.get("/training/scenarios/mtn-pin-request")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "mtn-pin-request"
    assert len(body["questions"]) == 3


def test_training_attempt_scores_and_passes(client):
    r = client.post("/training/attempts", json={
        "scenario_id": "mtn-pin-request",
        "answers": {"q1": "2", "q2": "2", "q3": "1"},
        "user_id": "u1"})
    body = r.json()
    assert body["score"] == 3
    assert body["passed"] is True


def test_training_attempt_unknown_scenario_is_404(client):
    r = client.post("/training/attempts", json={"scenario_id": "nope", "answers": {}})
    assert r.status_code == 404


def test_old_report_and_check_number_endpoints_still_use_glance_untouched(client):
    """The pre-existing /report + /check-number (Brain/GlancePlug path) must
    keep working exactly as before -- the community pivot is additive."""
    body = {"number": REPORTED, "trick": "possible_fake_reversal", "reporter_id": "s1"}
    assert client.post("/report", json=body).json()["accepted"] is True
    old_check = client.get("/check-number", params={"number": REPORTED}).json()
    assert old_check["source"] == "simulated"
    assert old_check["risk"] == "high"  # GlancePlug's own canned reputation, unaffected


def test_ussd_scam_alerts_shows_no_alerts_message_when_none_published(client):
    client.post("/ussd", json={"session_id": "w1", "key": "", "sender": "0240000001"})
    r = client.post("/ussd", json={"session_id": "w1", "key": "3", "sender": "0240000001"}).json()
    assert "no community scam alerts published yet" in r["text"].lower()


def test_ussd_scam_alerts_shows_published_warning(client):
    created = client.post("/reports", json={
        "number": STRANGER, "trick": "possible_impersonation", "reporter_id": "u1"}).json()
    client.patch(f"/reports/{created['report']['id']}/status", json={"status": "published"})

    client.post("/ussd", json={"session_id": "w2", "key": "", "sender": "0240000001"})
    r = client.post("/ussd", json={"session_id": "w2", "key": "3", "sender": "0240000001"}).json()
    assert "scam alert" in r["text"].lower()


def test_ussd_check_a_number_uses_community_data_not_glance(client):
    created = client.post("/reports", json={
        "number": STRANGER, "trick": "possible_impersonation", "reporter_id": "u1"}).json()
    client.patch(f"/reports/{created['report']['id']}/status", json={"status": "published"})

    client.post("/ussd", json={"session_id": "w3", "key": "", "sender": "0240000001"})
    client.post("/ussd", json={"session_id": "w3", "key": "4", "sender": "0240000001"})
    r = client.post("/ussd", json={
        "session_id": "w3", "key": STRANGER, "sender": "0240000001"}).json()
    assert "community report" in r["text"].lower()


def test_ussd_training_flow_end_to_end_with_correct_answers(client):
    sender = "0240000001"
    client.post("/ussd", json={"session_id": "t1", "key": "", "sender": sender})
    r = client.post("/ussd", json={"session_id": "t1", "key": "6", "sender": sender}).json()
    assert "mtn customer care" in r["text"].lower()
    r = client.post("/ussd", json={"session_id": "t1", "key": "1", "sender": sender}).json()
    assert "is this really how mtn verifies you" in r["text"].lower()
    for key in ["2", "2", "1"]:  # the three correct answers
        r = client.post("/ussd", json={"session_id": "t1", "key": key, "sender": sender}).json()
    assert "score: 3/3" in r["text"].lower()


def test_ussd_training_flow_wrong_answer_still_scores(client):
    sender = "0240000001"
    client.post("/ussd", json={"session_id": "t2", "key": "", "sender": sender})
    client.post("/ussd", json={"session_id": "t2", "key": "6", "sender": sender})
    client.post("/ussd", json={"session_id": "t2", "key": "1", "sender": sender})
    for key in ["1", "1", "2"]:  # all wrong
        r = client.post("/ussd", json={"session_id": "t2", "key": key, "sender": sender}).json()
    assert "score: 0/3" in r["text"].lower()


def test_ussd_training_can_be_skipped_from_intro(client):
    sender = "0240000001"
    client.post("/ussd", json={"session_id": "t3", "key": "", "sender": sender})
    client.post("/ussd", json={"session_id": "t3", "key": "6", "sender": sender})
    r = client.post("/ussd", json={"session_id": "t3", "key": "2", "sender": sender}).json()
    assert "1 send money" in r["text"].lower()
