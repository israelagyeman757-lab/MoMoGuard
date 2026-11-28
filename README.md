# MoMoGuard — controller, brain, and agents

Prototype fraud check for mobile money (MoMo) payments. Track 3: "Slow it down, just enough."
InnoFemme Hack for Equity, KNUST, 26–28 Nov 2026.

Safe payments go through untouched. Risky ones are paused just long enough for a safety check.
Nothing here moves real money — the bank, network, call-log and reputation data are **simulated** and labelled as such until the organisers' sandbox arrives.

Community scam reports (`POST /report`, `GET /community/intelligence`) persist through `controller/community/`: **SQLite by default** (in-memory unless `COMMUNITY_SQLITE_PATH` is set). Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a local `.env` to use the hosted Supabase project (**Walo**, ref `ytukecpastecnvlikait`); apply `supabase/migrations/20261128100000_init.sql` via the Supabase connector. Never commit keys.

**Read [CONTRACT.md](CONTRACT.md) first** if you are building the phone page or scoreboard against this controller.

## Start (3 commands)

```bash
pip install -r requirements.txt        # 1. install (most deps may already be present)
python -m uvicorn controller.app:app --port 8000   # 2. run the controller
```

Then open http://127.0.0.1:8000/docs for the interactive API.

To try the feature-phone preview and the demo-control console together,
serve the repo root as static files (e.g. `python3 -m http.server 5500`)
and open:

- `http://127.0.0.1:5500/phone-page/index.html` — the customer feature-phone preview.
- `http://127.0.0.1:5500/innovate-reps/index.html` — the Innovate Reps smartphone simulator (Phone, Messages, reporting).
- `http://127.0.0.1:5500/demo-control/index.html` — operator console for simulated SMS/calls (see [demo-control/README.md](demo-control/README.md)).

## Run the tests

```bash
python -m pytest tests/ -v
cd phone-page && npm test
cd innovate-reps && npm test
cd demo-control && npm test
```

## Deploy on Vercel (single project)

This repo ships as **one Vercel project**: static UIs plus the FastAPI controller as a Python serverless function.

1. Import the GitHub repo in Vercel (root directory = repo root; `vercel.json` is already configured).
2. **Community reports on Vercel need Supabase.** Vercel’s filesystem is ephemeral; without Supabase the controller falls back to **in-memory SQLite**, which resets on cold starts and does **not** persist reports between invocations. Apply `supabase/migrations/20261128100000_init.sql` on your project, then set the Supabase variables below in the Vercel dashboard.
3. After deploy, open:
   - `/phone-page/` — customer SIM Toolkit preview
   - `/innovate-reps/` — Innovate Reps console
   - `/demo-control/` — operator demo console
   - `/api/docs` — interactive OpenAPI (controller under `/api/*`)

**Local vs production API base:** static pages call `http://127.0.0.1:8000` when served from `localhost` / `127.0.0.1` (or via `file:`); on Vercel they use same-origin **`/api`** (see `shared/controllerUrl.js`).

### Vercel environment variables (names only — never commit values)

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Hosted Postgres (community reports) — **required on Vercel for durable storage** |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side PostgREST access (service role only) |
| `SUPABASE_HTTP_TIMEOUT_S` | Optional HTTP timeout for Supabase calls (default `10`) |
| `COMMUNITY_SQLITE_PATH` | Optional local/ephemeral SQLite path (not for production on Vercel) |
| `PAUSE_TIMEOUT_S` | Payment pause window in seconds (default `180`) |
| `BANK_PLUG_MODE` | `simulated` (default) or `mtn_sandbox` |
| `MTN_SANDBOX_BASE_URL` | Hackathon sandbox API base |
| `MTN_MOMO_CLIENT_ID` | MoMo sandbox client id |
| `MTN_MOMO_API_KEY` | MoMo sandbox API key |
| `GLANCE_DEV_KEY` | Legacy Glance dev key name (optional) |
| `RANCARD_GLANCE_API_KEY` | Rancard Glance API key |
| `RANCARD_GLANCE_BASE_URL` | Glance API base URL |
| `RANCARD_GLANCE_TIMEOUT_S` | Glance HTTP timeout |
| `RANCARD_GLANCE_MODE` | `stub` or `live` (reverse lookup) |
| `RANCARD_GLANCE_REPORT_MODE` | `stub` or `live` (report forwarding) |
| `RANCARD_GLANCE_SIM_SOURCE_ID` | Sandbox simulated source id (optional) |
| `RANCARD_GLANCE_SIM_SOURCE_REP` | Sandbox rep source id (optional) |
| `RANCARD_GLANCE_SIM_SOURCE_CUSTOMER` | Sandbox customer source id (optional) |
| `SANDBOX_BASE_URL` | General sandbox base (if used) |
| `SANDBOX_API_KEY` | General sandbox key (if used) |

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
  brain/               risk scoring (settings.json holds all tunable numbers)
  community/           Community report persistence (SQLite default, Supabase opt-in)
  plugs/               BankPlug (pretend bank), DataPlug/GlancePlug/NetworkPlug stubs
                       MtnMomoBankPlug (real MTN MoMo hackathon sandbox, opt-in)
supabase/migrations/   SQL schema for Walo Supabase (applied outside CI)
reports-and-checker/   score checker + sample payments
tests/                 pytest suite
phone-page/            feature-phone preview (static, controller-mode by default);
                       SIM Toolkit option 3 is Community Fraud (simulated GH₵5 fee + PIN; no /report)
innovate-reps/         Innovate Reps smartphone simulator (reporting + Glance lookup)
demo-control/          operator console feeding simulated SMS/calls into open phone tabs
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