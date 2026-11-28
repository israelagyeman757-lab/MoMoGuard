import os
from unittest.mock import patch

import pytest

from controller.sandbox import complete_sandbox_reversal, register_sandbox_dispute_hold


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from controller.app import create_app
    from controller.momoguard_store import MoMoGuardStore
    from controller.seed import seed_demo

    store = MoMoGuardStore(":memory:")
    seed_demo(store)
    app = create_app(store=store, seed=False)
    return TestClient(app)


def test_cashout_authorize_delay_shape(client):
    client.post(
        "/holds/evaluate",
        json={
            "payer": "0245000999",
            "payee": "0244111222",
            "amount": 50,
            "payments_from_payer_before": 0,
        },
    )
    body = client.post(
        "/sandbox/plugin",
        json={
            "point": "payment.authorize",
            "type": "cashout",
            "payer": {"msisdn": "0244111222"},
            "payee": {"msisdn": "0000000000"},
            "paymentsToThisPayeeBefore": 0,
            "amount": 20,
        },
    ).json()
    assert set(body.keys()) == {"decision", "minutes", "message"}
    assert body["decision"] == "delay"
    assert body["minutes"] >= 1
    assert len(body["message"]) > 0
    assert "new_number_pair" not in body["message"]


@patch("controller.sandbox.httpx.Client")
def test_register_dispute_hold_sequence(mock_client_cls):
    os.environ["INNOFEMME_TEAM_KEY"] = "test-key"
    try:
        mock_resp = mock_client_cls.return_value.__enter__.return_value.post
        mock_resp.side_effect = [
            _mock_http_response({"ticket": "TK-42"}),
            _mock_http_response({"ok": True}),
        ]
        ticket = register_sandbox_dispute_hold(
            sender_msisdn="0244111111",
            txn_id="tx_123",
            amount=100.0,
        )
        assert ticket == "TK-42"
        assert mock_resp.call_count == 2
        open_body = mock_resp.call_args_list[0].kwargs["json"]
        hold_body = mock_resp.call_args_list[1].kwargs["json"]
        assert open_body["action"] == "open_ticket"
        assert open_body["txnId"] == "tx_123"
        assert open_body["verified"] == "yes"
        assert hold_body == {"action": "hold", "ticket": "TK-42", "amount": 100.0}
    finally:
        os.environ.pop("INNOFEMME_TEAM_KEY", None)


@patch("controller.sandbox.httpx.Client")
def test_complete_reversal_return_funds_then_fallback(mock_client_cls):
    os.environ["INNOFEMME_TEAM_KEY"] = "test-key"
    try:
        mock_resp = mock_client_cls.return_value.__enter__.return_value.post
        mock_resp.return_value = _mock_http_response({"ok": True})
        complete_sandbox_reversal(ticket="TK-9", txn_id="tx_1")
        body = mock_resp.call_args.kwargs["json"]
        assert body == {"action": "return_funds", "ticket": "TK-9"}

        mock_resp.reset_mock()
        mock_resp.return_value = _mock_http_response({"ok": True})
        complete_sandbox_reversal(ticket=None, txn_id="tx_77")
        body = mock_resp.call_args.kwargs["json"]
        assert body == {"action": "reverse", "txnId": "tx_77"}
        assert "telco/mtn" in mock_resp.call_args.args[0]
    finally:
        os.environ.pop("INNOFEMME_TEAM_KEY", None)


def test_sandbox_noop_without_key():
    os.environ.pop("INNOFEMME_TEAM_KEY", None)
    assert register_sandbox_dispute_hold(sender_msisdn="0244", txn_id="x", amount=1) is None
    assert complete_sandbox_reversal(ticket="T", txn_id="x") is None


def _mock_http_response(data: dict):
    from unittest.mock import MagicMock

    resp = MagicMock()
    resp.status_code = 200
    resp.content = True
    resp.json.return_value = data
    return resp