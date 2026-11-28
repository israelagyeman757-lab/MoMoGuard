from controller.hold_reasons import join_labels, reason_labels_payload


def test_no_raw_codes_in_labels():
    payload = reason_labels_payload(["new_number_pair", "amount_above_500_ghs"])
    assert "new_number_pair" not in payload["en"]
    assert "First payment" in payload["en"]
    assert "500" in payload["en"]


def test_join_fallback():
    assert "Walɔ" in join_labels([], locale="en")