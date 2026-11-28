# MoMoGuard — controller, brain, agents, and the community pivot

InnoFemme Hack for Equity, KNUST, 26–28 Nov 2026.

**Pivot note:** the team is temporarily setting aside the Track 3 fraud-blocking/scoring pitch
(partly over Ghana Data Protection Act concerns with that framing) to focus on **Track 4:
community reporting, number lookup, and scam education**, with Track 1 ("spot the scam") as a
bonus. The original Track 3 build — Brain, pause manager, OTP stub, MTN sandbox bank plug,
Message Intelligence Agent — is **kept intact and untouched below**: it still works, it's just no
longer the headline. The new community subsystem (`controller/community/`, `community-console/`)
is additive, built alongside it, not a replacement.

Nothing here moves real money by default — the bank, network, call-log and payment-risk
reputation data are **simulated** and labelled as such. The community reports/warnings below are
real (SQLite-backed), because this piece of the demo needs a moderator review step and to survive
a restart.

**Read [CONTRACT.md](CONTRACT.md) first** if you are building against this controller — it now covers both the original payment-risk endpoints and the new community endpoints (v0.3).

## Start (3 commands)

```bash
pip install -r requirements.txt        # 1. install (most deps may already be present)
python -m controller.message_agent.train  # 2. train the small SMS model (seconds)
python -m uvicorn controller.app:app --port 8000   # 3. run the controller
```

Then open http://127.0.0.1:8000/docs for the interactive API.

To try the feature-phone preview, the demo-control console, and the new
community console together, serve the repo root as static files (e.g.
`python3 -m http.server 5500`) and open:

- `http://127.0.0.1:5500/phone-page/index.html` — the feature phone itself.
  Menu item **6 Scam Training** is new; **3 Scam Alerts** and **4 Check a
  Number** now show real community data instead of static/canned text.
- `http://127.0.0.1:5500/demo-control/index.html` — a separate operator
  console that feeds simulated SMS/calls into the open phone tab (see
  [demo-control/README.md](demo-control/README.md)).
- `http://127.0.0.1:5500/community-console/index.html` — submit a community
  report, moderate the review queue (publish/reject), see published
  warnings, and look up a number — the Track 4 pivot's main new surface.
  No login: anyone with the URL can moderate, a deliberate hackathon-scope
  cut (see CONTRACT.md's community-endpoints section).

## Run the tests

```bash
python -m pytest tests/ -v
```

## Use the real MTN MoMo sandbox instead of the pretend bank

By default the controller uses the simulated in-memory bank. To talk to the
InnoFemme hackathon's real MTN MoMo sandbox (https://hackathon.innofemme.org/t/team-08)
instead:

1. In the sandbox's MTN back office, onboard a merchant (Merchants tab ->
   "Onboard merchant" — needs a registered MTN line with no wallet on it
   yet), then issue API credentials via "Give a company API access"
   (`/t/team-08/telco/mtn`) with that merchant selected in the dropdown.
   Skipping the merchant gets you working subscriber lookups but
   `requesttopay`/`transfer` will fail with a "no merchant wallet" error.
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
  brain/               risk scoring (settings.json holds all tunable numbers) -- Track 3, untouched
  plugs/               BankPlug (pretend bank), DataPlug/GlancePlug/NetworkPlug stubs -- untouched
                       MtnMomoBankPlug (real MTN MoMo hackathon sandbox, opt-in) -- untouched
  message_agent/       SMS check: TF-IDF + Logistic Regression, warn-only -- untouched
  community/           NEW (Track 4 pivot): SQLite-backed reports/numbers/warnings
                       + the one hardcoded training scenario and its scoring
reports-and-checker/   score checker + sample payments
tests/                 pytest suite
phone-page/            feature-phone preview (static, controller-mode by default)
demo-control/          separate operator console that feeds scenarios into phone-page
community-console/     NEW: submit/moderate community reports, publish warnings, check a number
```

## Community reporting, warnings, and training (Track 4 pivot)

```
POST /reports              -- submit a community report (pseudonymous, 1/reporter/number/day)
GET  /reports?status=      -- moderator review queue (pending|published|rejected)
PATCH /reports/{id}/status -- moderator publishes (creates a warning) or rejects
GET  /numbers/check/{num}  -- real community reputation; "unreported" never means "safe"
GET  /warnings?number=     -- moderator-published warnings only
GET  /training/scenarios/{id}  -- the one hardcoded scenario ("mtn-pin-request")
POST /training/attempts    -- score an attempt, persisted to training_attempts
```

A **report** decays automatically (never proof on its own); a **warning** only exists once a
moderator publishes a report, and does not decay — keep the two apart. See
[CONTRACT.md](CONTRACT.md)'s "Community endpoints (v0.3)" section for exact shapes. `POST
/reset-demo` wipes this data too.

Cut for time, intentionally: moderator auth/roles (anyone with the console URL can moderate),
adaptive `training_recommendations`, multiple training scenarios, and persisted per-question quiz
history beyond the attempt summary.

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