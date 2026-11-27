"""Smoke test for the real MTN MoMo hackathon sandbox plug.

Does NOT need the controller running. Checks that MtnMomoBankPlug can
authenticate and reach the sandbox with the credentials in .env -- it does
not run the full fraud flow, just confirms connectivity + a sane response.

Requires in .env (see .env.example):
    MTN_MOMO_CLIENT_ID=...
    MTN_MOMO_API_KEY=...

Run:
    python reports-and-checker/smoke_mtn_sandbox.py
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
    if result.get("ok"):
        print(f"PASS  reached sandbox: {result.get('url')} -> HTTP {result.get('status_code')}")
        return 0
    print(f"FAIL  could not reach sandbox cleanly: {result}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
