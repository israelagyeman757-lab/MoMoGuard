# MoMoGuard — controller, brain, and agents

Prototype fraud check for mobile money (MoMo) payments. Track 3: "Slow it down, just enough."
InnoFemme Hack for Equity, KNUST, 26–28 Nov 2026.

Safe payments go through untouched. Risky ones are paused just long enough for a safety check.
Nothing here moves real money — the bank, network, call-log and reputation data are **simulated** and labelled as such until the organisers' sandbox arrives.

**Read [CONTRACT.md](CONTRACT.md) first** if you are building the phone page or scoreboard against this controller.

## Start (3 commands)

```bash
pip install -r requirements.txt        # 1. install (most deps may already be present)
python -m controller.message_agent.train  # 2. train the small SMS model (seconds)
python -m uvicorn controller.app:app --port 8000   # 3. run the controller
```

Then open http://127.0.0.1:8000/docs for the interactive API.

## Run the tests

```bash
python -m pytest tests/ -v
```

## Use the real MTN MoMo sandbox instead of the pretend bank

By default the controller uses the simulated in-memory bank. To talk to the
InnoFemme hackathon's real MTN MoMo sandbox (https://hackathon.innofemme.org/t/team-08)
instead:

1. In the sandbox's MTN back office (`/t/team-08/telco/mtn`), issue API
   credentials via "Give a company API access".
2. `cp .env.example .env` and fill in `MTN_MOMO_CLIENT_ID`, `MTN_MOMO_API_KEY`,
   and set `BANK_PLUG_MODE=mtn_sandbox`. `.env` is gitignored — never commit it.
3. `python reports-and-checker/smoke_mtn_sandbox.py` to confirm connectivity.
4. Run the controller as usual; it now sends real sandbox transfers through
   `controller/plugs/mtn_momo_bank_plug.py` while keeping the exact same plug
   interface (`account`/`balance`/`history`/`send`/`pair_max_safe`/...), so
   nothing else in the controller changes.

## Sanity-check the brain

```bash
python reports-and-checker/score_checker.py reports-and-checker/sample_payments.json
```

## Layout

```
controller/            FastAPI controller (all logic lives here)
  app.py               endpoints + wiring
  ussd.py              server-driven menus (the phone page is a dumb screen)
  pause_manager.py     single-use paused-payment references, asyncio expiry
  metrics.py           scoreboard metrics + audit log
  brain/               risk scoring (settings.json holds all tunable numbers)
  plugs/               BankPlug (pretend bank), DataPlug/GlancePlug/NetworkPlug stubs
                       MtnMomoBankPlug (real MTN MoMo hackathon sandbox, opt-in)
  message_agent/       SMS check: TF-IDF + Logistic Regression, warn-only
reports-and-checker/   score checker + sample payments
tests/                 pytest suite
```

## Demo timing note

The canned stranger call to Aunty is at `2026-11-27T09:45:00` (simulated). Call
signals are time-windowed: `/assess` with `ts` within 60 minutes after the call
sees them; payments before the call or outside the window do not. USSD sessions
use the current time. Demo accounts and the exact cheat-sheet times are the
project owner's job; `POST /reset-demo` restores the starting state.

## Hard rules

- Never collect, store, or log a PIN or OTP.
- A failed or timed-out request never reports success.
- User-facing text says "pause before sending" — never "freeze" or "scammer".
- Everything simulated is labelled `source: "simulated"`.
- `/check-otp` is a stub only (on hold by project decision).