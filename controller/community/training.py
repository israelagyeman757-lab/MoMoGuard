"""Scam-education training: one hardcoded scenario + scoring.

Content is plain Python data on purpose — the same "hand-written examples,
no content-authoring system" choice already made for
controller/message_agent/dataset.py. A real training-content admin tool
and adaptive training_recommendations are explicit future work (see
internal/community-pivot-review.md §5); this module is the minimum that
lets a person run one scenario and get a score.
"""

PASS_THRESHOLD = 0.6  # 2 of 3 correct

SCENARIOS: dict[str, dict] = {
    "mtn-pin-request": {
        "id": "mtn-pin-request",
        "title": "The \u201cMTN agent\u201d PIN request",
        "scenario_text": (
            "You get a call: \u201cThis is MTN customer care. Your SIM will be "
            "blocked in 10 minutes unless you confirm your MoMo PIN right now "
            "so we can protect your account.\u201d"
        ),
        "questions": [
            {
                "id": "q1",
                "text": "Is this really how MTN verifies you?",
                "choices": {
                    "1": "Yes, MTN staff can ask for your PIN to confirm your identity",
                    "2": "No \u2014 MTN and banks never ask for your PIN or OTP, ever",
                },
                "answer": "2",
            },
            {
                "id": "q2",
                "text": "What should you do?",
                "choices": {
                    "1": "Give the PIN quickly, before the 10 minutes run out",
                    "2": ("Hang up, and call MTN yourself using the number on your "
                          "SIM pack or the official app"),
                },
                "answer": "2",
            },
            {
                "id": "q3",
                "text": "Why is \u201cblocked in 10 minutes\u201d a warning sign on its own?",
                "choices": {
                    "1": "It creates urgency so you act before you think it through",
                    "2": "It is a normal thing MTN always says",
                },
                "answer": "1",
            },
        ],
    },
}


def get_scenario(scenario_id: str) -> dict | None:
    return SCENARIOS.get(scenario_id)


def list_scenarios() -> list[dict]:
    return list(SCENARIOS.values())


def score_attempt(scenario_id: str, answers: dict) -> dict:
    """answers: {question_id: chosen_choice_key}. Unknown/missing answers
    are simply marked wrong, never raise, so a partial attempt still scores."""
    scenario = get_scenario(scenario_id)
    if scenario is None:
        raise KeyError(f"unknown scenario: {scenario_id}")

    results = []
    score = 0
    for question in scenario["questions"]:
        given = answers.get(question["id"])
        correct = given == question["answer"]
        if correct:
            score += 1
        results.append({
            "id": question["id"],
            "given": given,
            "correct": correct,
            "correct_answer": question["answer"],
        })

    total = len(scenario["questions"])
    passed = total > 0 and (score / total) >= PASS_THRESHOLD
    if score == total:
        message = "Well done \u2014 you spotted every trick in this message."
    elif passed:
        message = ("Good \u2014 but look again at the trick you missed before "
                   "you trust a message like this next time.")
    else:
        message = ("This one is risky to miss. MTN and banks never ask for "
                   "your PIN or OTP, no matter how urgent it sounds.")

    return {
        "scenario_id": scenario_id,
        "score": score,
        "total": total,
        "passed": passed,
        "results": results,
        "message": message,
    }
