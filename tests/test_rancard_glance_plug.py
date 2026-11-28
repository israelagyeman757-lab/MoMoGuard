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


def test_live_mode_raises_a_clear_not_implemented_error(monkeypatch):
    monkeypatch.setenv("RANCARD_GLANCE_MODE", "live")
    plug = RancardGlancePlug()
    with pytest.raises(NotImplementedError, match="RANCARD_GLANCE_MODE=live"):
        plug.reverse_lookup("0240000009")
