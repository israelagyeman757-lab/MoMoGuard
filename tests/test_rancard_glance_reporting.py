import json
from unittest import mock

import pytest

from controller.plugs.rancard_glance_plug import (
    RancardGlancePlug,
    build_idempotency_key,
    map_report_reason,
    normalize_aggregates_response,
    phone_to_sandbox_msisdn,
)

SAMPLE_AGGREGATE = {
    "success": True,
    "code": "00",
    "requestId": "req-lookup-1",
    "data": {
        "items": [{
            "msisdn": "SYN-0042",
            "timesReported": 2,
            "riskColor": "YELLOW",
            "riskDescription": "Only one simulated source reported this subject.",
            "severity": 1,
            "firstReported": "2026-11-28T06:11:57Z",
            "lastReported": "2026-11-28T06:15:10Z",
            "riskScore": 2,
            "explanation": {
                "status": "INSUFFICIENT_EVIDENCE",
                "riskLevel": "LOW",
                "reasons": ["SINGLE_SIMULATED_SOURCE"],
            },
        }],
        "total": 1,
    },
}


def test_phone_to_sandbox_msisdn_uses_last_four_digits():
    assert phone_to_sandbox_msisdn("0240000009") == "SYN-0009"


def test_idempotency_key_is_stable_per_day():
    a = build_idempotency_key("rep1", "0240000005", "2026-11-28")
    b = build_idempotency_key("rep1", "0240000005", "2026-11-28")
    c = build_idempotency_key("rep1", "0240000005", "2026-11-29")
    assert a == b
    assert a != c


def test_map_report_reason_impersonation_trick():
    assert map_report_reason(trick="possible_impersonation") == "IMPERSONATION"


def test_normalize_aggregates_never_implies_confirmed_fraud():
    result = normalize_aggregates_response("0240000042", SAMPLE_AGGREGATE)
    assert result["status"] == "watch"
    assert result["times_reported"] == 2
    assert "not a confirmed fraud finding" in result["message"].lower()
    assert result["source"] == "rancard_live"
    assert result["glance_request_id"] == "req-lookup-1"


def test_normalize_aggregates_empty_items_is_no_results():
    result = normalize_aggregates_response("0240000009", {
        "success": True,
        "code": "00",
        "data": {"items": [], "total": 0},
    })
    assert result["status"] == "no_results"
    assert "not proof" in result["message"].lower()


@mock.patch("urllib.request.urlopen")
def test_live_reverse_lookup_uses_aggregates_endpoint(mock_urlopen, monkeypatch):
    monkeypatch.setenv("RANCARD_GLANCE_MODE", "live")
    monkeypatch.setenv("RANCARD_GLANCE_API_KEY", "test-key")

    class Resp:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps(SAMPLE_AGGREGATE).encode()

    mock_urlopen.return_value = Resp()
    result = RancardGlancePlug().reverse_lookup("0240000042")
    assert result["times_reported"] == 2
    req = mock_urlopen.call_args[0][0]
    assert "msisdn/aggregates" in req.full_url
    assert "msisdn=SYN-0042" in req.full_url


@mock.patch("urllib.request.urlopen")
def test_live_report_submission_success(mock_urlopen, monkeypatch):
    monkeypatch.setenv("RANCARD_GLANCE_REPORT_MODE", "live")
    monkeypatch.setenv("RANCARD_GLANCE_API_KEY", "test-key")

    class Resp:
        status = 201

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({
                "code": "00",
                "success": True,
                "message": "Flagged MSISDN reported successfully",
                "requestId": "req-1",
            }).encode()

    mock_urlopen.return_value = Resp()
    plug = RancardGlancePlug()
    result = plug.submit_sandbox_report(
        number="0240000009",
        reporter_id="rep-1",
        report_day="2026-11-28",
        trick="possible_impersonation",
        channel="innovate_reps",
    )
    assert result["submitted"] is True
    assert result["source"] == "rancard_live"
    assert result["sandbox_msisdn"] == "SYN-0009"
    assert result["reason"] == "IMPERSONATION"
    req = mock_urlopen.call_args[0][0]
    assert req.get_header("Idempotency-key")
    assert req.get_header("X-api-key") == "test-key"
    body = json.loads(req.data.decode())
    assert body["msisdn"] == "SYN-0009"
    assert body["reason"] == "IMPERSONATION"


@mock.patch("urllib.request.urlopen")
def test_live_report_http_error_is_non_fatal(mock_urlopen, monkeypatch):
    monkeypatch.setenv("RANCARD_GLANCE_REPORT_MODE", "live")
    monkeypatch.setenv("RANCARD_GLANCE_API_KEY", "test-key")
    import io
    import urllib.error

    mock_urlopen.side_effect = urllib.error.HTTPError(
        "https://example", 429, "Too Many", hdrs=None,
        fp=io.BytesIO(json.dumps({"message": "rate"}).encode()),
    )
    plug = RancardGlancePlug()
    result = plug.submit_sandbox_report(
        number="0240000005",
        reporter_id="rep-1",
        report_day="2026-11-28",
        trick="community_reported",
        request_type="reversal",
    )
    assert result["submitted"] is False
    assert result["http_status"] == 429