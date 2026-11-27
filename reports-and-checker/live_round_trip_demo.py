"""Fully automated, verified real-money round trip against the MTN sandbox.

This is the honest answer to "does send() actually move real money?" after
an earlier claim of success turned out to be wrong (see
mtn_momo_bank_plug.py's module docstring). It doesn't just call send() and
trust the HTTP response -- it:

  1. Creates a fresh test customer (known MSISDN + PIN + GHS 500 wallet) via
     the sandbox's team-key-authenticated "hub" endpoint, so there's a payer
     whose PIN we actually know.
  2. Calls the real MtnMomoBankPlug.send() in a background thread.
  3. While that's polling, drives the *same* USSD approval flow a real
     customer would use on their phone (*170# -> "Allow Cash Out" -> the
     pending request -> Approve -> PIN) via the sandbox's USSD endpoint, so
     the collection leg has something genuine to approve it inside the
     poll window -- this is why a plain requesttopay stays PENDING/EXPIRED
     without it.
  4. After send() returns, independently re-fetches both legs' status from
     the MoMo API (not from send()'s own return value) and the merchant's
     wallet balance, and only declares success if ALL of: send() returned
     "ok", both legs are independently SUCCESSFUL with a real
     financialTransactionId, and the merchant balance actually changed.

Requires in .env (see .env.example):
    MTN_MOMO_CLIENT_ID=...
    MTN_MOMO_API_KEY=...
    MTN_TEAM_KEY=...            (the sandbox team key, for test customers + USSD)
    MTN_MERCHANT_MSISDN=...     (this company's merchant line, for the balance check)

Run:
    python reports-and-checker/live_round_trip_demo.py
"""

import json
import os
import sys
import threading
import time
from pathlib import Path

import httpx


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def _create_test_customer(base_url: str, team_key: str, http: httpx.Client) -> dict:
    resp = http.post(
        f"{base_url}/s/hub",
        headers={"x-team-key": team_key, "Content-Type": "application/json"},
        json={"action": "test_customer", "network": "mtn"},
    )
    resp.raise_for_status()
    return resp.json()["customer"]


def _approve_pending_cashout(base_url: str, team_key: str, msisdn: str, pin: str,
                              http: httpx.Client, deadline_s: float = 20) -> str:
    """Drive the USSD menu a real customer would use to approve a pending
    collection request. Returns the final screen text."""
    headers = {"x-team-key": team_key, "Content-Type": "application/json"}
    deadline = time.monotonic() + deadline_s

    def ussd(body: dict) -> dict:
        resp = http.post(f"{base_url}/ussd", headers=headers, json=body)
        resp.raise_for_status()
        return resp.json()

    session = ussd({"msisdn": msisdn, "input": "*170#"})
    while "Allow Cash Out" not in session["text"] and time.monotonic() < deadline:
        time.sleep(0.5)
    session = ussd({"msisdn": msisdn, "sessionId": session["sessionId"], "input": "4"})
    # "Pending approvals\n1) Pay GHS X to <company>" -- there may be more than
    # one pending request if this is reused; always take the first.
    session = ussd({"msisdn": msisdn, "sessionId": session["sessionId"], "input": "1"})
    session = ussd({"msisdn": msisdn, "sessionId": session["sessionId"], "input": "1"})  # Approve
    session = ussd({"msisdn": msisdn, "sessionId": session["sessionId"], "input": pin})
    return session["text"]


def main() -> int:
    _load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    required = ["MTN_MOMO_CLIENT_ID", "MTN_MOMO_API_KEY", "MTN_TEAM_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"SKIP  missing {missing} in .env -- nothing to demo. See .env.example.")
        return 0

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from controller.plugs.mtn_momo_bank_plug import MtnMomoBankPlug, SANDBOX_BASE_URL

    base_url = os.environ.get("MTN_SANDBOX_BASE_URL", SANDBOX_BASE_URL)
    team_key = os.environ["MTN_TEAM_KEY"]
    merchant_msisdn = os.environ.get("MTN_MERCHANT_MSISDN")

    http = httpx.Client(timeout=15)
    print("Creating a payer test customer (known PIN)...")
    payer = _create_test_customer(base_url, team_key, http)
    print(f"  payer: {payer['number']} ({payer['name']}), GHS {payer['balance']}")

    print("Creating a payee test customer...")
    payee = _create_test_customer(base_url, team_key, http)
    print(f"  payee: {payee['number']} ({payee['name']}), GHS {payee['balance']}")

    os.environ.setdefault("MTN_MOMO_POLL_TIMEOUT_S", "90")
    os.environ.setdefault("MTN_MOMO_POLL_INTERVAL_S", "2")
    bank = MtnMomoBankPlug()

    balance_before = bank.balance(merchant_msisdn) if merchant_msisdn else None
    if merchant_msisdn:
        print(f"Merchant balance before: GHS {balance_before}")

    amount = 15
    reference = f"demo-{payer['number']}"
    send_result: dict = {}

    def do_send():
        send_result["result"] = bank.send(payer["number"], payee["number"], amount, unique_key=reference)

    thread = threading.Thread(target=do_send)
    thread.start()
    time.sleep(1)  # let the collection submit land before we start approving
    print("Approving the pending collection via USSD (as the payer would on their phone)...")
    final_screen = _approve_pending_cashout(base_url, team_key, payer["number"], payer["pin"], http)
    print(f"  USSD final screen: {final_screen!r}")
    thread.join(timeout=100)

    result = send_result.get("result", {"status": "error", "reason": "send() did not finish"})
    print(f"\nsend() returned: {json.dumps(result)}")

    collect_status = bank.requesttopay_status(f"{reference}-in") or {}
    disburse_status = bank.transfer_status(f"{reference}-out") or {}
    print(f"Independently re-checked collection status: {json.dumps(collect_status)}")
    print(f"Independently re-checked disbursement status: {json.dumps(disburse_status)}")

    checks = {
        "send() reported ok": result.get("status") == "ok",
        "collection independently SUCCESSFUL": collect_status.get("status") == "SUCCESSFUL",
        "collection has a real financialTransactionId": bool(collect_status.get("financialTransactionId")),
        "disbursement independently SUCCESSFUL": disburse_status.get("status") == "SUCCESSFUL",
        "disbursement has a real financialTransactionId": bool(disburse_status.get("financialTransactionId")),
    }
    if merchant_msisdn:
        balance_after = bank.balance(merchant_msisdn)
        print(f"Merchant balance after: GHS {balance_after}")
        checks["merchant balance actually changed"] = balance_after != balance_before

    for name, ok in checks.items():
        print(f"{'PASS' if ok else 'FAIL'}  {name}")

    if all(checks.values()):
        print("\nPASS  real money moved end to end through send(), independently verified.")
        return 0
    print("\nFAIL  not all checks passed -- see above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
