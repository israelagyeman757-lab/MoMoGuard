# Walo — Community fraud intelligence (hackathon)

Community-powered mobile money fraud intelligence, education, and early-warning prototype. Track 4 Community (supporting Track 1 Spot It Early). **Does not** block scams, intercept transactions, or recover money.

## What works

- Community report submit and moderation (SQLite default locally/CI; **Supabase** when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set)
- Number lookup against **Walo DB only** (no external Glance/MTN)
- Published warnings in USSD simulator and training UI
- Rule-based training with pre/post 10-question assessments, scores, and recommendations
- Simulated USSD menu (clearly labelled, not live MTN)

## Start locally

```bash
pip install -r requirements.txt
python3 -m uvicorn controller.app:app --port 8000
```

Open:

- http://127.0.0.1:8000/docs — API
- Serve static UIs: `python3 -m http.server 5500` from repo root
  - http://127.0.0.1:5500/phone-page/ — feature-phone SIM Toolkit preview (keyboard legend on page)
  - http://127.0.0.1:5500/training-app/ — smartphone training
  - http://127.0.0.1:5500/community-console/ — moderator dashboard

Demo moderator token: `POST /auth/demo-login` with `{"role":"moderator"}` (default `demo-mod-token`).

## Tests

```bash
python3 -m pytest tests/ -v
```

## Deploy (Vercel)

Single project: `api/index.py` + `vercel.json`. For durable data on Vercel, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then apply `supabase/migrations/20261128120000_blueprint.sql` on the Walo Supabase project. Never commit keys.

See [docs/blueprint-hackathon.md](docs/blueprint-hackathon.md) for full scope.