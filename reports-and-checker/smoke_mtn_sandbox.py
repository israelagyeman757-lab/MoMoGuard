"""Smoke test for the real MTN MoMo hackathon sandbox plug.

Does NOT need the controller running. Checks that MtnMomoBankPlug can
authenticate and reach the sandbox with the credentials in .env -- it does
not run the full fraud flow, just confirms connectivity + a sane response.

Requires in .env (see .env.example):
    MTN_MOMO_CLIENT_ID=...
    MTN_MOMO_API_KEY=...

Run:
    python reports-and-checker/smoke_mtn_sandbox.py

Optional: also prove a real transfer succeeds (not just reachability), by
setting MTN_SMOKE_TEST_MSISDN in .env to a real MSISDN whose wallet is
linked to these credentials' merchant (e.g. the merchant's own line) --
this does a real 1 GHS self-transfer against the sandbox, so only set it
when you mean to. Left unset, this extra check is skipped.
"""

import os
import sys
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
        print("SKIP  MTN_SMOKE_TEST_MSISDN not set -- not attempting a real transfer "
              "(reachability + auth already confirmed above).")
        return 0

    send_result = bank.send(msisdn, msisdn, 1, unique_key=f"smoke-{msisdn}-selftest")
    if send_result.get("status") == "ok":
        print(f"PASS  real 1 GHS self-transfer for {msisdn} succeeded "
              "(requesttopay + transfer both accepted by the sandbox).")
        return 0
    print(f"FAIL  real transfer did not succeed: {send_result}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
