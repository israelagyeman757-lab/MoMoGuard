"""Community USSD simulator menu (not a live MTN connection)."""

from __future__ import annotations

import re

SIM_LABEL = "[SIMULATED USSD — not connected to MTN]"

MAIN_MENU = (
    f"{SIM_LABEL}\n"
    "Walo Community\n"
    "1 Check suspicious number\n"
    "2 Learn about scams\n"
    "3 Report suspicious activity\n"
    "4 Latest scam warnings\n"
    "5 Exit"
)

SCAM_TYPE_MENU = (
    "Scam type:\n"
    "1 Fake MTN rep\n"
    "2 PIN/OTP request\n"
    "3 Fake payment confirmation\n"
    "4 Reversal scam\n"
    "5 Suspicious call/message\n"
    "6 Job offer\n"
    "7 Other"
)

SCAM_TYPE_KEYS = {
    "1": "fake_mtn_rep",
    "2": "pin_otp_request",
    "3": "fake_payment_confirmation",
    "4": "reversal_scam",
    "5": "suspicious_call_message",
    "6": "job_offer",
    "7": "other",
}

LEARN_MENU = (
    "Learn about scams (open training app on smartphone)\n"
    "Visit /training-app/ for full lessons.\n"
    "0 Back"
)


class CommunityUssdRouter:
    def __init__(self, lookup_fn, submit_report_fn, list_warnings_fn):
        self._lookup = lookup_fn
        self._submit_report = submit_report_fn
        self._list_warnings = list_warnings_fn
        self.sessions: dict[str, dict] = {}

    def reset(self) -> None:
        self.sessions.clear()

    async def handle(self, session_id: str, key: str, sender: str) -> dict:
        key = (key or "").strip()
        if key == "end" or key == "5" and session_id in self.sessions and self.sessions[session_id].get("state") == "main_menu":
            self.sessions.pop(session_id, None)
            return {"text": f"{SIM_LABEL}\nSession ended. Thank you.", "state": "ended", "done": True}
        if key in ("", "start") or session_id not in self.sessions:
            self.sessions[session_id] = {"state": "main_menu", "sender": sender}
            return self._screen(session_id, MAIN_MENU)

        session = self.sessions[session_id]
        session["sender"] = sender
        state = session["state"]

        if state == "main_menu":
            return await self._main_menu(session_id, session, key)
        if state == "check_number":
            return await self._check_number(session_id, session, key)
        if state == "learn":
            if key == "0":
                session["state"] = "main_menu"
                return self._screen(session_id, MAIN_MENU)
            return self._screen(session_id, LEARN_MENU)
        if state == "report_number":
            return await self._report_number(session_id, session, key)
        if state == "report_type":
            return await self._report_type(session_id, session, key)
        if state == "report_description":
            return await self._report_description(session_id, session, key)
        if state == "warnings":
            session["state"] = "main_menu"
            return self._screen(session_id, MAIN_MENU)

        session["state"] = "main_menu"
        return self._screen(session_id, "Invalid input.\n" + MAIN_MENU)

    async def _main_menu(self, session_id, session, key):
        if key == "1":
            session["state"] = "check_number"
            return self._screen(session_id, f"{SIM_LABEL}\nEnter phone number to check:")
        if key == "2":
            session["state"] = "learn"
            return self._screen(session_id, LEARN_MENU)
        if key == "3":
            session["state"] = "report_number"
            return self._screen(session_id, f"{SIM_LABEL}\nReport: enter suspicious number (or 0 to skip):")
        if key == "4":
            session["state"] = "warnings"
            warnings = await self._list_warnings()
            pub = [w for w in warnings if w.get("status") == "published"]
            if not pub:
                text = f"{SIM_LABEL}\nNo published warnings yet.\n0 Back"
            else:
                lines = [f"{SIM_LABEL}", "Latest warnings:"]
                for w in pub[:5]:
                    lines.append(f"- {w['title']}")
                lines.append("0 Back")
                text = "\n".join(lines)
            return self._screen(session_id, text)
        if key == "5":
            self.sessions.pop(session_id, None)
            return {"text": f"{SIM_LABEL}\nSession ended.", "state": "ended", "done": True}
        return self._screen(session_id, "Invalid choice.\n" + MAIN_MENU)

    async def _check_number(self, session_id, session, key):
        if key == "0":
            session["state"] = "main_menu"
            return self._screen(session_id, MAIN_MENU)
        if not re.fullmatch(r"0\d{9}", re.sub(r"\D", "", key)):
            return self._screen(session_id, "Invalid number. Enter 10-digit number or 0 Back:")
        result = await self._lookup(key)
        session["state"] = "main_menu"
        text = (
            f"{SIM_LABEL}\n"
            f"Result: {result['result']}\n"
            f"{result['message']}\n"
            f"Reports in DB: {result.get('reports_count', 0)}\n"
            "0 Main menu"
        )
        return self._screen(session_id, text)

    async def _report_number(self, session_id, session, key):
        if key == "0":
            session["phone_number"] = ""
        elif re.fullmatch(r"0\d{9}", re.sub(r"\D", "", key)):
            session["phone_number"] = re.sub(r"\D", "", key)
            if session["phone_number"].startswith("233"):
                session["phone_number"] = "0" + session["phone_number"][3:]
        else:
            return self._screen(session_id, "Invalid number. Enter number or 0 to skip:")
        session["state"] = "report_type"
        return self._screen(session_id, SCAM_TYPE_MENU)

    async def _report_type(self, session_id, session, key):
        scam = SCAM_TYPE_KEYS.get(key)
        if not scam:
            return self._screen(session_id, "Press 1-7.\n" + SCAM_TYPE_MENU)
        session["scam_type"] = scam
        session["state"] = "report_description"
        return self._screen(session_id, "Short description (max 120 chars). We never ask for PIN/OTP:")

    async def _report_description(self, session_id, session, key):
        desc = (key or "")[:120]
        payload = {
            "reporter_id": session.get("sender", session_id),
            "phone_number": session.get("phone_number", ""),
            "scam_type": session["scam_type"],
            "description": desc,
        }
        result = await self._submit_report(payload)
        session["state"] = "main_menu"
        msg = (
            f"{SIM_LABEL}\n"
            f"Report submitted (ID {result['id']}). Status: {result['status']}.\n"
            "Moderators will review. Thank you.\n"
            + MAIN_MENU
        )
        return self._screen(session_id, msg)

    def _screen(self, session_id: str, text: str) -> dict:
        return {
            "text": text,
            "state": self.sessions[session_id]["state"],
            "done": False,
            "simulated": True,
        }