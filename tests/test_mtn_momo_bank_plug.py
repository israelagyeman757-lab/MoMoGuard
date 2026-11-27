"""Unit tests for MtnMomoBankPlug against a fake transport (no real network).

Both MoMo legs are asynchronous in the real sandbox (POST returns 202
"queued", then you must poll a GET .../{referenceId} status endpoint for the
real outcome -- see the plug's module docstring for the live bug this caught:
an earlier version treated the 202 itself as success). These tests mock both
the submit (POST) and the status-poll (GET) calls to make sure the plug only
ever reports "ok" after a real SUCCESSFUL status, never from the 202 alone.

A separate live smoke test (reports-and-checker/smoke_mtn_sandbox.py) checks
real connectivity and, optionally, a real transfer against the sandbox.
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


def _always_successful_handler(seen: dict):
    """POST (submit) -> 202 queued; GET (status poll) -> SUCCESSFUL on the
    very first poll, so tests never sleep."""

    def handler(request: httpx.Request) -> httpx.Response:
        seen.setdefault("urls", []).append(str(request.url))
        seen.setdefault("auth", []).append(request.headers.get("authorization"))
        if request.method == "POST":
            return httpx.Response(202, json={"status": "queued"})
        return httpx.Response(200, json={"status": "SUCCESSFUL"})

    return handler


def test_send_polls_status_and_only_reports_ok_once_successful():
    seen: dict = {}
    bank = _plug(_always_successful_handler(seen))

    result = bank.send(AUNTY, KOFI, 50, unique_key="k1")

    assert result["status"] == "ok"
    assert result["source"] == "mtn_sandbox"
    assert all(a.startswith("Basic ") for a in seen["auth"])
    assert any("/momo/mtn/collection/v1_0/requesttopay" in u for u in seen["urls"])
    assert any("/momo/mtn/disbursement/v1_0/transfer" in u for u in seen["urls"])


def test_a_202_alone_is_never_enough_without_a_successful_poll():
    """The exact bug this plug had live: 202 on submit, but the real status
    never reaches SUCCESSFUL (e.g. it expires). Must be refused, not ok."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(202, json={"status": "queued"})
        return httpx.Response(200, json={"status": "FAILED", "reason": "EXPIRED"})

    bank = _plug(handler)
    result = bank.send(AUNTY, KOFI, 50, unique_key="k-expired")

    assert result["status"] == "refused"
    assert "EXPIRED" in result["reason"]


def test_send_stops_before_disbursement_when_collection_fails():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(403, json={"error": "This partner has no merchant wallet."})

    bank = _plug(handler)
    result = bank.send(AUNTY, KOFI, 50, unique_key="k-no-wallet")

    assert result["status"] == "refused"
    assert "collection" in result["reason"]
    assert len(calls) == 1  # submit failed outright, never even polled or tried leg 2


def test_disbursement_failure_after_successful_collection_is_still_refused():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(202, json={"status": "queued"})
        if "requesttopay" in str(request.url):
            return httpx.Response(200, json={"status": "SUCCESSFUL"})
        return httpx.Response(200, json={"status": "FAILED", "reason": "You cannot send to yourself"})

    bank = _plug(handler)
    result = bank.send(AUNTY, AUNTY, 50, unique_key="k-self")

    assert result["status"] == "refused"
    assert "disbursement" in result["reason"]


def test_duplicate_key_is_refused_without_a_second_send_attempt():
    seen: dict = {}
    bank = _plug(_always_successful_handler(seen))

    bank.send(AUNTY, KOFI, 50, unique_key="k1")
    calls_after_first_send = len(seen["urls"])
    again = bank.send(AUNTY, KOFI, 50, unique_key="k1")

    assert again["status"] == "refused"
    assert len(seen["urls"]) == calls_after_first_send  # no new requests at all


def test_pair_max_safe_tracks_local_successful_sends():
    bank = _plug(_always_successful_handler({}))
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
