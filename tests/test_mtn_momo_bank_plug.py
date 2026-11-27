"""Unit tests for MtnMomoBankPlug against a fake transport (no real network).

Confirms the plug honours the same interface as the simulated BankPlug and
sends sane auth headers / request shapes to the sandbox. A separate live
smoke test (reports-and-checker/smoke_mtn_sandbox.py) checks real
connectivity with issued credentials.
"""

import httpx

from controller.plugs.mtn_momo_bank_plug import MtnMomoBankPlug

AUNTY = "0240000001"
KOFI = "0240000002"


def _plug(handler) -> MtnMomoBankPlug:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return MtnMomoBankPlug(
        base_url="https://hackathon.innofemme.org/api/w/team-08",
        client_id="test-client",
        api_key="test-key",
        client=client,
    )


def test_send_uses_basic_auth_and_returns_ok():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        seen["url"] = str(request.url)
        return httpx.Response(202, json={"status": "accepted"})

    bank = _plug(handler)
    result = bank.send(AUNTY, KOFI, 50, unique_key="k1")

    assert result["status"] == "ok"
    assert result["source"] == "mtn_sandbox"
    assert seen["auth"].startswith("Basic ")
    assert "/momo/mtn/v1_0/transfer" in seen["url"]


def test_duplicate_key_is_refused_without_a_second_call():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(202, json={"status": "accepted"})

    bank = _plug(handler)
    bank.send(AUNTY, KOFI, 50, unique_key="k1")
    again = bank.send(AUNTY, KOFI, 50, unique_key="k1")

    assert again["status"] == "refused"
    assert calls["n"] == 1


def test_failed_sandbox_response_is_refused_not_ok():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid"})

    bank = _plug(handler)
    result = bank.send(AUNTY, KOFI, 50, unique_key="k2")
    assert result["status"] == "refused"


def test_pair_max_safe_tracks_local_sends():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(202, json={"status": "accepted"})

    bank = _plug(handler)
    bank.send(AUNTY, KOFI, 50, unique_key="k1")
    bank.send(AUNTY, KOFI, 100, unique_key="k2")
    assert bank.pair_max_safe(AUNTY, KOFI) == 100
    assert bank.has_safe_history(AUNTY, KOFI) is True


def test_balance_parses_available_balance_field():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"availableBalance": "123.45", "currency": "GHS"})

    bank = _plug(handler)
    assert bank.balance(AUNTY) == 123.45


def test_missing_credentials_raise_clear_error():
    try:
        MtnMomoBankPlug(base_url="https://example.com", client_id="", api_key="")
    except RuntimeError as exc:
        assert "MTN_MOMO_CLIENT_ID" in str(exc)
    else:
        raise AssertionError("expected RuntimeError for missing credentials")
