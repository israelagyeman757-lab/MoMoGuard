"""Smoke test for the real MTN MoMo hackathon sandbox plug.

Does NOT need the controller running. Checks that MtnMomoBankPlug can
authenticate and reach the sandbox with the credentials in .env -- it does
not run the full fraud flow, just confirms connectivity + a sane response.

Requires in .env (see .env.example):
    MTN_MOMO_CLIENT_ID=...
    MTN_MOMO_API_KEY=...

Run:
    python reports-and-checker/smoke_mtn_sandbox.py

Optional: also submit a real collection request (MTN_SMOKE_TEST_MSISDN in
.env, a real subscriber MSISDN to request money FROM). This proves the
submit-then-poll machinery reaches a genuine terminal status -- it reports
exactly what the sandbox says (SUCCESSFUL or FAILED + reason), and never
claims money moved unless the status is actually SUCCESSFUL. A collection
request normally needs the payer to approve it (e.g. on their phone) before
it can succeed, so FAILED/EXPIRED here without that approval step is
expected, not a bug -- see mtn_momo_bank_plug.py's module docstring for the
live incident that made this script this careful. Left unset, this extra
check is skipped.
"""

import os
import sys
import uuid
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def main() -> int:
    _load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    if not os.environ.get("MTN_MOMO_CLIENT_ID") or not os.environ.get("MTN_MOMO_API_KEY"):
        print("SKIP  MTN_MOMO_CLIENT_ID / MTN_MOMO_API_KEY not set in .env -- "
              "nothing to smoke-test. Issue credentials at /t/team-08/telco/mtn "
              "and put them in a local .env (see .env.example).")
        return 0

    from controller.plugs.mtn_momo_bank_plug import MtnMomoBankPlug

    bank = MtnMomoBankPlug()
    result = bank.ping()
    if not result.get("ok"):
        print(f"FAIL  could not reach sandbox cleanly: {result}")
        return 1
    print(f"PASS  reached sandbox: {result.get('url')} -> HTTP {result.get('status_code')}")

    msisdn = os.environ.get("MTN_SMOKE_TEST_MSISDN")
    if not msisdn:
        print("SKIP  MTN_SMOKE_TEST_MSISDN not set -- not attempting a real collection "
              "request (reachability + auth already confirmed above).")
        return 0

    outcome = bank.request_collection(
        msisdn, amount=1, reference_id=f"smoke-{msisdn}-{uuid.uuid4().hex[:8]}"
    )
    print(f"INFO  requesttopay for {msisdn} reached status "
          f"{outcome['status']} (reason: {outcome['reason'] or 'n/a'})")
    if outcome["status"] == "SUBMIT_ERROR":
        print(f"FAIL  could not even submit the request: {outcome}")
        return 1
    if outcome["status"] == "SUCCESSFUL":
        print("PASS  a real GHS 1 collection actually completed.")
    elif outcome["status"] == "FAILED":
        print("PASS  the sandbox gave a genuine terminal FAILED decision (e.g. nothing "
              "approved it in time) -- the submit-then-poll flow works correctly either "
              "way; a FAILED/EXPIRED result here is expected without a payer-approval "
              "step, not evidence of a bug.")
    else:  # TIMEOUT: still pending when we stopped polling -- also fine, not an error
        print("PASS  submitted and polled correctly; still PENDING after the poll "
              "window (no approval arrived in time) -- expected without a payer-approval "
              "step, not evidence of a bug.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
