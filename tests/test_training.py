from controller.community import training


def test_get_scenario_returns_the_hardcoded_scenario():
    scenario = training.get_scenario("mtn-pin-request")
    assert scenario is not None
    assert len(scenario["questions"]) == 3


def test_unknown_scenario_returns_none():
    assert training.get_scenario("does-not-exist") is None


def test_score_attempt_all_correct():
    result = training.score_attempt("mtn-pin-request", {"q1": "2", "q2": "2", "q3": "1"})
    assert result["score"] == 3
    assert result["total"] == 3
    assert result["passed"] is True


def test_score_attempt_all_wrong_fails():
    result = training.score_attempt("mtn-pin-request", {"q1": "1", "q2": "1", "q3": "2"})
    assert result["score"] == 0
    assert result["passed"] is False


def test_score_attempt_partial_still_passes_at_threshold():
    result = training.score_attempt("mtn-pin-request", {"q1": "2", "q2": "2", "q3": "2"})
    assert result["score"] == 2
    assert result["passed"] is True


def test_score_attempt_missing_answers_counts_as_wrong_not_an_error():
    result = training.score_attempt("mtn-pin-request", {"q1": "2"})
    assert result["score"] == 1
    assert result["total"] == 3
    assert result["passed"] is False


def test_score_attempt_unknown_scenario_raises():
    try:
        training.score_attempt("nope", {})
        assert False, "expected KeyError"
    except KeyError:
        pass
