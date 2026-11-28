import pytest

from controller.community.store import CommunityStore


def make_store():
    return CommunityStore(db_path=":memory:")


def test_create_report_accepted_and_returns_row():
    store = make_store()
    result = store.create_report("0240000009", "possible_impersonation", "r1", detail="called me")
    assert result["accepted"] is True
    assert result["report"]["number"] == "0240000009"
    assert result["report"]["status"] == "pending"


def test_duplicate_report_same_reporter_same_day_is_rejected():
    store = make_store()
    store.create_report("0240000009", "possible_impersonation", "r1")
    second = store.create_report("0240000009", "possible_impersonation", "r1")
    assert second["accepted"] is False


def test_different_reporters_both_count_toward_number():
    store = make_store()
    store.create_report("0240000009", "possible_impersonation", "r1")
    store.create_report("0240000009", "possible_advance_fee", "r2")
    info = store.check_number("0240000009")
    assert info["report_count"] == 2
    assert info["risk"] == "single_source"  # 2 reports, effective < 3


def test_unreported_number_never_says_safe():
    store = make_store()
    info = store.check_number("0200000000")
    assert info["risk"] == "unreported"
    assert "not proof it is safe" in info["message"]


def test_unknown_trick_falls_back_to_other():
    store = make_store()
    result = store.create_report("0240000009", "not_a_real_trick", "r1")
    assert result["report"]["trick"] == "other"


def test_list_reports_filters_by_status_and_number():
    store = make_store()
    store.create_report("0240000009", "possible_impersonation", "r1")
    store.create_report("0240000005", "possible_advance_fee", "r1")
    pending = store.list_reports(status="pending")
    assert len(pending) == 2
    for_one_number = store.list_reports(number="0240000009")
    assert len(for_one_number) == 1
    assert for_one_number[0]["number"] == "0240000009"


def test_publishing_a_report_creates_a_warning_and_updates_risk():
    store = make_store()
    report = store.create_report("0240000009", "possible_impersonation", "r1")["report"]
    outcome = store.update_report_status(report["id"], "published")
    assert outcome["report"]["status"] == "published"
    assert outcome["warning"] is not None
    assert "not proof" in outcome["warning"]["message"]
    warnings = store.list_warnings(number="0240000009")
    assert len(warnings) == 1


def test_rejecting_a_report_creates_no_warning_and_drops_it_from_risk():
    store = make_store()
    report = store.create_report("0240000009", "possible_impersonation", "r1")["report"]
    outcome = store.update_report_status(report["id"], "rejected")
    assert outcome["warning"] is None
    info = store.check_number("0240000009")
    assert info["report_count"] == 0
    assert info["risk"] == "unreported"


def test_update_status_unknown_report_returns_none():
    store = make_store()
    assert store.update_report_status(999, "published") is None


def test_update_status_rejects_invalid_status_value():
    store = make_store()
    report = store.create_report("0240000009", "possible_impersonation", "r1")["report"]
    try:
        store.update_report_status(report["id"], "approved")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_enough_distinct_reporters_push_risk_to_high():
    store = make_store()
    # 4 comfortably clears the >=3-effective-reports threshold even after
    # the microseconds of real decay that pass between insert and check
    # (same margin GlancePlug's own canned "0240000009": reports=4 uses).
    for reporter in ("r1", "r2", "r3", "r4"):
        store.create_report("0240000009", "possible_impersonation", reporter)
    info = store.check_number("0240000009")
    assert info["risk"] == "high"


def test_reports_fade_and_expire():
    store = make_store()
    store.create_report("0240000005", "possible_fake_reversal", "r1", age_days=0)
    assert store._effective_reports("0240000005") == pytest.approx(1.0, abs=1e-4)
    store2 = make_store()
    store2.create_report("0240000005", "possible_fake_reversal", "r1", age_days=30)
    assert abs(store2._effective_reports("0240000005") - 0.5) < 1e-4
    store3 = make_store()
    store3.create_report("0240000005", "possible_fake_reversal", "r1", age_days=91)
    assert store3._effective_reports("0240000005") == 0.0


def test_check_number_includes_published_warnings_for_that_number():
    store = make_store()
    report = store.create_report("0240000009", "possible_fake_reversal", "r1")["report"]
    store.update_report_status(report["id"], "published")
    info = store.check_number("0240000009")
    assert len(info["warnings"]) == 1
    assert info["warnings"][0]["trick"] == "possible_fake_reversal"


def test_reset_clears_everything():
    store = make_store()
    report = store.create_report("0240000009", "possible_impersonation", "r1")["report"]
    store.update_report_status(report["id"], "published")
    store.record_training_attempt("mtn-pin-request", 2, 3, True)
    store.reset()
    assert store.list_reports() == []
    assert store.list_warnings() == []
    assert store.check_number("0240000009")["risk"] == "unreported"


def test_record_training_attempt_returns_row():
    store = make_store()
    attempt = store.record_training_attempt("mtn-pin-request", 3, 3, True, user_id="u1")
    assert attempt["score"] == 3
    assert attempt["passed"] is True
    assert attempt["user_id"] == "u1"
