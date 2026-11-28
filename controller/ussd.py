"""Server-driven USSD menus. The phone page is a dumb screen: it sends key
presses here and displays the returned text. All logic stays in the controller.

Menu item 3 (Scam Alerts) and 4 (Check a Number) are wired to the Track 4
community subsystem (controller/community/) -- real moderator-published
warnings and real community number-reputation, not the old static/canned
text. Item 6 (Scam Training) is new: one hardcoded training scenario with
real scoring. The payment flow (items 1, 2, and everything voice-check
related) is unchanged -- still the original Brain/pause-manager/GlancePlug
path, kept intact per the pivot decision.
"""

import re

MAIN_MENU = ("Welcome to MoMoGuard\n1 Send Money\n2 Report a Scam\n"
             "3 Scam Alerts\n4 Check a Number\n5 Language\n6 Scam Training")

VOICE_QUESTIONS = [
    ("who_asked", "Safety check. Who asked you to send this? "
                  "1 Called me 2 Messaged me 3 I chose myself"),
    ("purpose", "What is it for? 1 Return money 2 Fee, prize or job "
                "3 Goods I ordered 4 Family or friend"),
    ("claimed_official", "Did they say they are from MTN, a bank or the "
                         "government? 1 Yes 2 No"),
    ("hurry", "Did they tell you to hurry? 1 Yes 2 No"),
    ("knows", "Do you know this person? 1 Yes 2 No"),
]

TRICKS = {
    "1": "possible_fake_reversal",
    "2": "possible_impersonation",
    "3": "possible_advance_fee",
}


TRAINING_SCENARIO_ID = "mtn-pin-request"


def _format_question(question: dict) -> str:
    choices = " ".join(f"{key} {label}" for key, label in question["choices"].items())
    return f"{question['text']} {choices}"


class UssdRouter:
    def __init__(self, assess, confirm, voice_result, report, check_number,
                list_warnings=None, training_attempt=None, training_scenario=None):
        self._assess = assess
        self._confirm = confirm
        self._voice_result = voice_result
        self._report = report
        self._check_number = check_number
        # Community subsystem callbacks (optional so older callers/tests
        # that only pass the first five args still work; app.py always
        # supplies them).
        self._list_warnings = list_warnings
        self._training_attempt = training_attempt
        self._training_scenario = training_scenario
        self.sessions: dict[str, dict] = {}

    def reset(self) -> None:
        self.sessions.clear()

    async def handle(self, session_id: str, key: str, sender: str) -> dict:
        key = (key or "").strip()
        if key == "end":
            self.sessions.pop(session_id, None)
            return {"text": "Session ended.", "state": "ended", "done": True}
        if key in ("", "start") or session_id not in self.sessions:
            self.sessions[session_id] = {"state": "main_menu", "sender": sender}
            return self._screen(session_id, MAIN_MENU)

        session = self.sessions[session_id]
        session["sender"] = sender
        state = session["state"]

        if state == "main_menu":
            return await self._main_menu(session_id, session, key)
        if state == "send_recipient":
            if re.fullmatch(r"\+?\d{7,15}", key):
                session["recipient"] = key
                session["state"] = "send_amount"
                return self._screen(session_id, "Enter amount (GH₵):")
            return self._screen(session_id, "Invalid number. Enter recipient number:")
        if state == "send_amount":
            return await self._send_amount(session_id, session, key)
        if state == "confirm_screen":
            return await self._confirm_screen(session_id, session, key)
        if state.startswith("voice_q"):
            return await self._voice_question(session_id, session, key)
        if state == "training_intro":
            return await self._training_intro(session_id, session, key)
        if state.startswith("training_q"):
            return await self._training_question(session_id, session, key)
        if state == "retry":
            if key == "1":
                session["answers"] = {}
                session["state"] = "voice_q0"
                return self._screen(session_id, VOICE_QUESTIONS[0][1])
            if key == "2":
                result = await self._voice_result(
                    session["reference"], session["sender"],
                    session.get("answers", {}), force="cancel")
                session["state"] = "result"
                return self._screen(session_id, result["message"])
            return self._screen(session_id, "Press 1 to try again, 2 to cancel.")
        if state == "offer_report":
            if key == "1":
                session["state"] = "report_trick"
                return self._screen(session_id, "What happened? 1 Possible fake "
                                                "reversal 2 Possible impersonation "
                                                "3 Possible advance fee")
            session["state"] = "main_menu"
            return self._screen(session_id, MAIN_MENU)
        if state == "report_number":
            if re.fullmatch(r"\+?\d{7,15}", key):
                session["report_number"] = key
                session["state"] = "report_trick"
                return self._screen(session_id, "What happened? 1 Possible fake "
                                                "reversal 2 Possible impersonation "
                                                "3 Possible advance fee")
            return self._screen(session_id, "Invalid number. Enter the number:")
        if state == "report_trick":
            trick = TRICKS.get(key)
            if not trick:
                return self._screen(session_id, "Press 1, 2 or 3.")
            number = session.get("report_number") or session.get("recipient", "")
            result = await self._report(number, trick, session_id)
            session["state"] = "result"
            return self._screen(session_id, result["message"])
        if state == "check_number":
            if re.fullmatch(r"\+?\d{7,15}", key):
                result = await self._check_number(key)
                session["state"] = "result"
                return self._screen(session_id, result["message"])
            return self._screen(session_id, "Invalid number. Enter the number:")
        if state == "language":
            if key == "2":
                session["state"] = "result"
                return self._screen(session_id, "Twi is coming soon. English is active.")
            session["state"] = "main_menu"
            return self._screen(session_id, MAIN_MENU)
        if state == "alerts":
            session["state"] = "main_menu"
            return self._screen(session_id, MAIN_MENU)
        # result and any unknown state: back to the menu
        session["state"] = "main_menu"
        return self._screen(session_id, MAIN_MENU)

    async def _main_menu(self, session_id, session, key):
        if key == "1":
            session["state"] = "send_recipient"
            return self._screen(session_id, "Send Money. Enter recipient number:")
        if key == "2":
            session["state"] = "report_number"
            return self._screen(session_id, "Report a number. Enter the number:")
        if key == "3":
            session["state"] = "alerts"
            return self._screen(session_id, await self._alerts_text())
        if key == "4":
            session["state"] = "check_number"
            return self._screen(session_id, "Check a number. Enter the number:")
        if key == "5":
            session["state"] = "language"
            return self._screen(session_id, "Language: 1 English 2 Twi")
        if key == "6":
            return self._training_entry(session_id, session)
        return self._screen(session_id, MAIN_MENU)

    async def _alerts_text(self) -> str:
        if self._list_warnings is None:
            return ("Scam alerts: never share your PIN or code. Check your "
                    "balance yourself before sending money back.")
        warnings = await self._list_warnings()
        if not warnings:
            return ("No community scam alerts published yet. Never share "
                    "your PIN or code. Check back soon.")
        latest = warnings[0]
        more = f" ({len(warnings)} alerts total.)" if len(warnings) > 1 else ""
        return latest["message"] + more

    def _training_entry(self, session_id, session):
        scenario = (self._training_scenario(TRAINING_SCENARIO_ID)
                   if self._training_scenario else None)
        if scenario is None:
            session["state"] = "main_menu"
            return self._screen(session_id, "Scam training is not available right now.")
        session["training_scenario_id"] = scenario["id"]
        session["state"] = "training_intro"
        return self._screen(session_id,
                            scenario["scenario_text"] + " Press 1 to start, 2 to go back.")

    async def _training_intro(self, session_id, session, key):
        if key == "2":
            session["state"] = "main_menu"
            return self._screen(session_id, MAIN_MENU)
        if key != "1":
            return self._screen(session_id, "Press 1 to start, 2 to go back.")
        session["training_answers"] = {}
        scenario = self._training_scenario(session["training_scenario_id"])
        session["state"] = "training_q0"
        return self._screen(session_id, _format_question(scenario["questions"][0]))

    async def _training_question(self, session_id, session, key):
        index = int(session["state"][len("training_q"):])
        scenario = self._training_scenario(session["training_scenario_id"])
        questions = scenario["questions"]
        question = questions[index]
        if key not in question["choices"]:
            return self._screen(session_id, _format_question(question))
        session["training_answers"][question["id"]] = key
        if index + 1 < len(questions):
            session["state"] = f"training_q{index + 1}"
            return self._screen(session_id, _format_question(questions[index + 1]))
        result = await self._training_attempt(session["training_scenario_id"],
                                              session["training_answers"],
                                              session["sender"])
        session["state"] = "result"
        return self._screen(session_id,
                            f"Score: {result['score']}/{result['total']}. {result['message']}")

    async def _send_amount(self, session_id, session, key):
        try:
            amount = float(key)
            if amount <= 0:
                raise ValueError
        except ValueError:
            return self._screen(session_id, "Invalid amount. Enter amount (GH₵):")
        session["amount"] = amount
        result = await self._assess(session_id, session["sender"],
                                    session["recipient"], amount)
        decision = result["decision"]
        if decision == "confirm":
            session["state"] = "confirm_screen"
            return self._screen(session_id, result["message"])
        if decision == "hold":
            session["reference"] = result["reference"]
            session["answers"] = {}
            session["state"] = "voice_q0"
            return self._screen(session_id, VOICE_QUESTIONS[0][1])
        if decision == "block":
            session["state"] = "offer_report"
            return self._screen(session_id, result["message"] + " Report? 1 Yes 2 No")
        session["state"] = "result"
        return self._screen(session_id, result["message"])

    async def _confirm_screen(self, session_id, session, key):
        if key not in ("1", "2"):
            return self._screen(session_id, "Continue? 1 Yes 2 No")
        result = await self._confirm(session_id, session["sender"],
                                     session["recipient"], session["amount"],
                                     "yes" if key == "1" else "no")
        session["state"] = "result"
        return self._screen(session_id, result["message"])

    async def _voice_question(self, session_id, session, key):
        index = int(session["state"][-1])
        field, _ = VOICE_QUESTIONS[index]
        if field == "who_asked":
            mapping = {"1": "called", "2": "messaged", "3": "self"}
        elif field == "purpose":
            mapping = {"1": "reverse", "2": "fee_prize_job", "3": "goods", "4": "family"}
        elif field == "knows":
            mapping = {"1": True, "2": False}
        else:
            mapping = {"1": True, "2": False}
        if key not in mapping:
            return self._screen(session_id, VOICE_QUESTIONS[index][1])
        session["answers"][field] = mapping[key]
        if index + 1 < len(VOICE_QUESTIONS):
            session["state"] = f"voice_q{index + 1}"
            return self._screen(session_id, VOICE_QUESTIONS[index + 1][1])
        result = await self._voice_result(session["reference"], session["sender"],
                                          session["answers"])
        if result["decision"] == "hold":
            session["state"] = "retry"
            return self._screen(session_id, "This payment still looks unusual. "
                                            "1 Try the check again 2 Cancel payment")
        if result["decision"] == "cancel":
            session["state"] = "offer_report"
            return self._screen(session_id, result["message"] + " Report? 1 Yes 2 No")
        session["state"] = "result"
        return self._screen(session_id, result["message"])

    def _screen(self, session_id: str, text: str) -> dict:
        return {"text": text, "state": self.sessions[session_id]["state"], "done": False}