from controller.plugs.glance_plug import GlancePlug


def test_intelligence_no_reports_never_means_safe():
    g = GlancePlug()
    intel = g.intelligence("0201111222")
    assert intel["report_state"] == "no_reports"
    assert "not proof" in intel["message"].lower()


def test_intelligence_single_report_is_unverified():
    g = GlancePlug()
    g.report("0240000011", "community_reported", "r1")
    intel = g.intelligence("0240000011")
    assert intel["report_state"] == "unverified"
    assert intel["distinct_reporters"] == 1


def test_intelligence_two_reporters_is_corroborated():
    g = GlancePlug()
    g.report("0240000012", "community_reported", "r1")
    g.report("0240000012", "community_reported", "r2")
    intel = g.intelligence("0240000012")
    assert intel["report_state"] == "corroborated"


def test_report_response_includes_classification():
    g = GlancePlug()
    result = g.report("0240000013", "community_reported", "r1",
                      channel="customer_sim_toolkit", request_type="reversal")
    assert result["accepted"] is True
    assert result["report_state"] == "unverified"
    assert "classification_note" in result