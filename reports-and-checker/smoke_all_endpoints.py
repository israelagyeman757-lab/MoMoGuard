"""Smoke test: call every endpoint on a running controller and check the basics.

Start the server first:  python -m uvicorn controller.app:app --port 8000
Then run:                python reports-and-checker/smoke_all_endpoints.py
"""

import sys

import httpx

BASE = "http://127.0.0.1:8000"
AUNTY = "0240000001"
MUM = "0240000007"
KOFI = "0240000002"

INNOCENT = {"who_asked": "self", "purpose": "goods",
            "claimed_official": False, "hurry": False, "knows": True}


def main() -> int:
    # trust_env=False: local-only calls; some Windows NO_PROXY values break httpx parsing
    c = httpx.Client(base_url=BASE, timeout=10, trust_env=False)
    failures = []

    def check(name, cond):
        print(f"{'PASS' if cond else 'FAIL'}  {name}")
        if not cond:
            failures.append(name)

    c.post("/reset-demo", json={})

    r = c.post("/assess", json={"session_id": "sm1", "sender": AUNTY,
                                "recipient": MUM, "amount": 300,
                                "ts": "2026-11-27T12:00:00"}).json()
    check("assess pauses risky payment", r["decision"] == "hold" and r.get("reference"))
    ref = r.get("reference", "")

    r = c.post("/resume", json={"reference": ref, "sender": AUNTY}).json()
    check("resume shows pending", r["status"] == "pending")

    r = c.post("/voice-result", json={"reference": ref, "sender": AUNTY,
                                      "answers": INNOCENT}).json()
    check("innocent voice answers release", r["decision"] == "release")

    r = c.post("/assess", json={"session_id": "sm2", "sender": AUNTY,
                                "recipient": KOFI, "amount": 7000,
                                "ts": "2026-11-27T12:00:00"}).json()
    check("trusted big amount asks confirm", r["decision"] == "confirm")
    r = c.post("/confirm", json={"session_id": "sm2", "sender": AUNTY,
                                 "recipient": KOFI, "amount": 7000,
                                 "answer": "yes"}).json()
    check("confirm yes sends", r["decision"] == "allow")

    r = c.post("/report", json={"number": "0240000005",
                                "trick": "possible_fake_reversal",
                                "reporter_id": "smoke"}).json()
    check("report accepted", r["accepted"] is True)

    r = c.get("/check-number", params={"number": "0240000009"}).json()
    check("check-number returns reputation", r["risk"] == "high"
          and r["source"] == "simulated")

    r = c.post("/check-sms", json={"sender": "0240000005", "recipient": AUNTY,
                                   "text": "I have sent you GH₵300. Please return GH₵200 immediately.",
                                   "ts": "2026-11-27T10:00:00"}).json()
    check("check-sms warns on scam text", r["recommended_action"] == "warn")

    r = c.post("/check-otp", json={"number": MUM}).json()
    check("check-otp is stub", r["status"] == "not_implemented")

    r = c.post("/ussd", json={"session_id": "sm3", "key": "", "sender": AUNTY}).json()
    check("ussd main menu", "1 Send Money" in r["text"])

    r = c.get("/metrics").json()
    check("metrics shape", r["payments_checked"] >= 2
          and "avg" in r["seconds_added"] and "p95" in r["seconds_added"])

    r = c.get("/audit").json()
    check("audit newest first", len(r["events"]) > 0)

    r = c.post("/reset-demo", json={}).json()
    check("reset-demo ok", r["status"] == "ok")
    r = c.get("/metrics").json()
    check("reset clears metrics", r["payments_checked"] == 0)

    print(f"\n{len(failures)} failure(s)" if failures else "\nAll endpoints OK")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())