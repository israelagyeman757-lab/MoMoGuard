from controller.plugs.glance_plug import GlancePlug
import pytest


def test_canned_reputation_is_simulated():
    glance = GlancePlug()
    result = glance.check("0240000009")
    assert result["risk"] == "high"
    assert result["reports"] >= 3
    assert result["source"] == "simulated"


def test_unreported_never_means_safe():
    glance = GlancePlug()
    result = glance.check("0240000006")
    assert result["risk"] == "unreported"
    assert "safe" not in result["message"].lower() or "not proof" in result["message"].lower()


def test_local_report_dedup_per_reporter_per_number_per_day():
    glance = GlancePlug()
    first = glance.report("0240000005", "possible_fake_reversal", reporter_id="s1")
    assert first["accepted"] is True
    again = glance.report("0240000005", "possible_fake_reversal", reporter_id="s1")
    assert again["accepted"] is False
    other = glance.report("0240000005", "possible_fake_reversal", reporter_id="s2")
    assert other["accepted"] is True


def test_reporter_id_is_pseudonymous():
    glance = GlancePlug()
    glance.report("0240000005", "possible_impersonation", reporter_id="s1")
    stored = glance.local_reports()
    assert all(r["reporter_id"] != "s1" for r in stored)
    assert all(len(r["reporter_id"]) == 16 for r in stored)


def test_reports_fade_and_expire():
    glance = GlancePlug()
    glance.report("0240000005", "possible_fake_reversal", reporter_id="s1", age_days=0)
    assert glance.effective_reports("0240000005") == pytest.approx(1.0, abs=1e-4)
    glance2 = GlancePlug()
    glance2.report("0240000005", "possible_fake_reversal", reporter_id="s1", age_days=30)
    assert abs(glance2.effective_reports("0240000005") - 0.5) < 1e-4
    glance3 = GlancePlug()
    glance3.report("0240000005", "possible_fake_reversal", reporter_id="s1", age_days=91)
    assert glance3.effective_reports("0240000005") == 0.0


def test_reset_clears_local_reports():
    glance = GlancePlug()
    glance.report("0240000005", "possible_fake_reversal", reporter_id="s1")
    glance.reset()
    assert glance.local_reports() == []


def test_demo_unavailable_is_not_safe_nor_fraud():
    result = GlancePlug().check("DEMO-004")
    assert result["risk"] == "unavailable"
    assert result["reports"] == 0
    assert "could not be checked" in result["message"]


def test_unknown_demo_scenario_is_error():
    result = GlancePlug().check("DEMO-999")
    assert result["risk"] == "error"
    assert result["reports"] == 0