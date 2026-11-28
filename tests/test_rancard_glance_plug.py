import os

import pytest

from controller.plugs.rancard_glance_plug import RancardGlancePlug


def test_stub_mode_by_default():
    plug = RancardGlancePlug()
    assert plug.mode == "stub"


def test_stub_flags_known_demo_number():
    plug = RancardGlancePlug()
    result = plug.reverse_lookup("0240000009")
    assert result["status"] == "flagged"
    assert result["risk"] == "high"
    assert result["source"] == "rancard_stub"
    assert "not proof" in result["message"].lower()


def test_stub_clears_known_clean_number():
    plug = RancardGlancePlug()
    result = plug.reverse_lookup("0240000001")
    assert result["status"] == "clear"
    assert "not proof" in result["message"].lower()  # clear is not proof of safety either


def test_stub_reports_error_for_the_demo_error_number():
    plug = RancardGlancePlug()
    result = plug.reverse_lookup("0000000000")
    assert result["status"] == "error"
    assert result["risk"] == "unavailable"


def test_stub_defaults_to_no_results_for_unknown_numbers():
    plug = RancardGlancePlug()
    result = plug.reverse_lookup("0209999999")
    assert result["status"] == "no_results"
    assert result["number"] == "0209999999"
    assert "not proof" in result["message"].lower()


def test_reset_does_not_raise():
    plug = RancardGlancePlug()
    plug.reset()  # stateless stub; just must not blow up


def test_live_mode_without_docs_falls_back_to_stub(monkeypatch):
    monkeypatch.setenv("RANCARD_GLANCE_MODE", "live")
    monkeypatch.delenv("RANCARD_GLANCE_BASE_URL", raising=False)
    monkeypatch.delenv("RANCARD_GLANCE_LOOKUP_PATH", raising=False)
    plug = RancardGlancePlug()
    result = plug.reverse_lookup("0240000009")
    assert result["status"] == "flagged"
    assert result["live_attempted"] is False
    assert "live_note" in result


def test_live_mode_http_failure_falls_back_with_error_status(monkeypatch):
    monkeypatch.setenv("RANCARD_GLANCE_MODE", "live")
    monkeypatch.setenv("RANCARD_GLANCE_BASE_URL", "https://invalid.example.test")
    monkeypatch.setenv("RANCARD_GLANCE_LOOKUP_PATH", "/v1/lookup/{number}")
    monkeypatch.setenv("RANCARD_GLANCE_API_KEY", "test-key-not-real")
    plug = RancardGlancePlug()
    result = plug.reverse_lookup("0240000001")
    assert result["live_attempted"] is True
    assert result["source"] == "rancard_stub"
    assert result["status"] == "error"
