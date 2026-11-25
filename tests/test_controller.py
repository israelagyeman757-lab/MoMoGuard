import time

import pytest
from fastapi.testclient import TestClient

from controller.app import create_app

AUNTY = "0240000001"
KOFI = "0240000002"
STRANGER = "0240000005"
SUPPLIER = "0240000006"
MUM = "0240000007"

INNOCENT = {"who_asked": "self", "purpose": "goods",
            "claimed_official": False, "hurry": False, "knows": True}
COACHED = {"who_asked": "called", "purpose": "reverse",
           "claimed_official": True, "hurry": True, "knows": False}


@pytest.fixture
def client():
    with TestClient(create_app(pause_timeout_s=180)) as c:
        yield c


def assess(client, sender, recipient, amount, session_id="s1", ts="2026-11-27T10:00:00"):
    return client.post("/assess", json={
        "session_id": session_id, "sender": sender, "recipient": recipient,
        "amount": amount, "ts": ts})


def test_low_payment_goes_through(client):
    before = client.app.state.bank.balance(AUNTY)
    # 09:00 is before the canned stranger call (09:45), so no call signals.
    r = assess(client, AUNTY, SUPPLIER, 50, ts="2026-11-27T09:00:00").json()
    assert r["decision"] == "allow"
    assert r["band"] == "low"
    assert client.app.state.bank.balance(AUNTY) == before - 50


def test_trusted_big_amount_asks_confirm(client):
    before = client.app.state.bank.balance(AUNTY)
    r = assess(client, AUNTY, KOFI, 7000).json()
    assert r["decision"] == "confirm"
    assert r["confirm"]["usual"] == 100
    assert r["confirm"]["new"] == 7000
    assert r["confirm"]["in_words"] == "seven thousand cedis"
    assert client.app.state.bank.balance(AUNTY) == before


def test_confirm_no_cancels_yes_sends(client):
    assess(client, AUNTY, KOFI, 7000)
    before = client.app.state.bank.balance(AUNTY)
    no = client.post("/confirm", json={
        "session_id": "s1", "sender": AUNTY, "recipient": KOFI,
        "amount": 7000, "answer": "no"}).json()
    assert no["decision"] == "cancelled"
    assert client.app.state.bank.balance(AUNTY) == before

    assess(client, AUNTY, KOFI, 7000, session_id="s2")
    yes = client.post("/confirm", json={
        "session_id": "s2", "sender": AUNTY, "recipient": KOFI,
        "amount": 7000, "answer": "yes"}).json()
    assert yes["decision"] == "allow"
    assert client.app.state.bank.balance(AUNTY) == before - 7000


def test_risky_payment_pauses_with_reference(client):
    before = client.app.state.bank.balance(AUNTY)
    # 12:00 is outside the call window: only new+unusual+SIM-change fire.
    r = assess(client, AUNTY, MUM, 300, ts="2026-11-27T12:00:00").json()
    assert r["decision"] == "hold"
    assert r["band"] == "high"
    assert r["reference"]
    assert r["voice_script_id"] == "voice_check_en"
    assert client.app.state.bank.balance(AUNTY) == before


def test_innocent_voice_answers_release_once(client):
    ref = assess(client, AUNTY, MUM, 300, ts="2026-11-27T12:00:00").json()["reference"]
    before = client.app.state.bank.balance(AUNTY)
    r = client.post("/voice-result", json={
        "reference": ref, "sender": AUNTY, "answers": INNOCENT}).json()
    assert r["decision"] == "release"
    assert client.app.state.bank.balance(AUNTY) == before - 300
    replay = client.post("/voice-result", json={
        "reference": ref, "sender": AUNTY, "answers": INNOCENT}).json()
    assert replay["decision"] != "release"
    assert client.app.state.bank.balance(AUNTY) == before - 300


def test_coached_voice_answers_cancel_and_offer_report(client):
    ref = assess(client, AUNTY, MUM, 300, ts="2026-11-27T12:00:00").json()["reference"]
    before = client.app.state.bank.balance(AUNTY)
    r = client.post("/voice-result", json={
        "reference": ref, "sender": AUNTY, "answers": COACHED}).json()
    assert r["decision"] == "cancel"
    assert r["offer_report"] is True
    assert client.app.state.bank.balance(AUNTY) == before


def test_very_high_is_blocked(client):
    before = client.app.state.bank.balance(AUNTY)
    r = assess(client, AUNTY, STRANGER, 300).json()
    assert r["decision"] == "block"
    assert r["band"] == "very_high"
    assert client.app.state.bank.balance(AUNTY) == before


def test_check_otp_is_stub_only(client):
    r = client.post("/check-otp", json={"number": MUM}).json()
    assert r["status"] == "not_implemented"
    assert r["checker_status"] == "not_checked"


def test_check_sms_warns_via_api(client):
    r = client.post("/check-sms", json={
        "sender": STRANGER, "recipient": AUNTY,
        "text": "I have sent you GH₵300. Please return GH₵200 immediately.",
        "ts": "2026-11-27T10:00:00"}).json()
    assert r["recommended_action"] == "warn"
    assert r["checker_status"] == "complete"


def test_metrics_and_audit_shape(client):
    assess(client, AUNTY, SUPPLIER, 50)
    assess(client, AUNTY, STRANGER, 300)
    m = client.get("/metrics").json()
    assert m["payments_checked"] == 2
    assert m["scams_stopped"] == 1
    assert "avg" in m["seconds_added"] and "p95" in m["seconds_added"]
    a = client.get("/audit").json()
    assert a["events"][0]["type"] == "assess"
    assert a["events"][0]["recipient"] == STRANGER


def test_timeout_cancels_and_counts_in_metrics():
    with TestClient(create_app(pause_timeout_s=0.05)) as c:
        r = assess(c, AUNTY, MUM, 300, ts="2026-11-27T12:00:00").json()
        assert r["decision"] == "hold"
        time.sleep(0.2)
        resumed = c.post("/resume", json={
            "reference": r["reference"], "sender": AUNTY}).json()
        assert resumed["status"] == "expired"
        m = c.get("/metrics").json()
        assert m["scams_stopped"] == 1


def test_reset_demo_restores_starting_state(client):
    assess(client, AUNTY, SUPPLIER, 50)
    r = client.post("/reset-demo", json={}).json()
    assert r["status"] == "ok"
    assert client.app.state.bank.balance(AUNTY) == 8000
    assert client.get("/metrics").json()["payments_checked"] == 0


def test_failed_send_never_reports_success(client):
    assess(client, AUNTY, KOFI, 99999)
    r = client.post("/confirm", json={
        "session_id": "s1", "sender": AUNTY, "recipient": KOFI,
        "amount": 99999, "answer": "yes"}).json()
    assert r["decision"] == "cancelled"
    assert client.app.state.bank.balance(AUNTY) == 8000


def test_report_dedup_via_api(client):
    body = {"number": STRANGER, "trick": "possible_fake_reversal", "reporter_id": "s1"}
    assert client.post("/report", json=body).json()["accepted"] is True
    assert client.post("/report", json=body).json()["accepted"] is False


def test_ussd_main_menu_and_send_flow(client):
    r = client.post("/ussd", json={"session_id": "u1", "key": "", "sender": AUNTY}).json()
    assert "1 Send Money" in r["text"]
    client.post("/ussd", json={"session_id": "u1", "key": "1", "sender": AUNTY})
    client.post("/ussd", json={"session_id": "u1", "key": SUPPLIER, "sender": AUNTY})
    r = client.post("/ussd", json={"session_id": "u1", "key": "50", "sender": AUNTY}).json()
    assert "sent" in r["text"].lower()
    assert client.app.state.bank.balance(AUNTY) == 7950


def test_ussd_hold_flow_voice_questions(client):
    client.post("/ussd", json={"session_id": "u2", "key": "", "sender": AUNTY})
    client.post("/ussd", json={"session_id": "u2", "key": "1", "sender": AUNTY})
    client.post("/ussd", json={"session_id": "u2", "key": MUM, "sender": AUNTY})
    r = client.post("/ussd", json={"session_id": "u2", "key": "300", "sender": AUNTY}).json()
    assert "who asked" in r["text"].lower()
    for key in ["3", "3", "2", "2", "1"]:  # self, goods, not official, no hurry, knows
        r = client.post("/ussd", json={"session_id": "u2", "key": key, "sender": AUNTY}).json()
    assert "sent" in r["text"].lower()
    assert client.app.state.bank.balance(AUNTY) == 7700