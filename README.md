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

To try the feature-phone preview and the demo-control console together,
serve the repo root as static files (e.g. `python3 -m http.server 5500`)
and open:

- `http://127.0.0.1:5500/phone-page/index.html` — the feature phone itself.
- `http://127.0.0.1:5500/demo-control/index.html` — a separate operator
  console that feeds simulated SMS/calls into the open phone tab (see
  [demo-control/README.md](demo-control/README.md)).

## Run the tests

```bash
python -m pytest tests/ -v
```

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
  message_agent/       SMS check: TF-IDF + Logistic Regression, warn-only
reports-and-checker/   score checker + sample payments
tests/                 pytest suite
phone-page/            feature-phone preview (static, controller-mode by default)
demo-control/          separate operator console that feeds scenarios into phone-page
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