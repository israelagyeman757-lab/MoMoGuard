# MoMoGuard — Innovate Reps

A separate, additive static page for a community representative: a two-tab
app (**Actions**, **Profile**) for reporting suspicious numbers and looking
up a number's Glance threat status. Served like `demo-control/` and
`phone-page/` — static files, no bundler, `node --test` for its own logic.

## Why its own page

Same reasoning as `demo-control/` (see that folder's README): a representative's
tools are a distinct audience from the feature-phone preview and the (not yet
built) customer-facing pieces, so this ships as its own small page talking
to the same controller rather than being folded into an existing UI.

## Actions tab

- **Report a Scam** — phone number, optional time, community, and a
  free-text description, submitted with `POST /report`. This is the
  **same** endpoint and the **same** `GlancePlug`-backed storage the
  original USSD "Report a Scam" menu already uses — not a second,
  duplicate reporting system. The category picker from that USSD flow
  doesn't exist here; `trick` is sent as a fixed `"community_reported"`
  value and the free-text `description` carries the detail instead (backend
  change: `controller/plugs/glance_plug.py`'s `report()` gained optional
  `description`/`community`/`incident_time` fields, all optional so the old
  USSD call site is unaffected).
- **Reverse Number Lookup** — calls `GET /rancard/reverse-lookup`, the new
  Rancard Glance integration. **That service is a clearly-labelled stub**
  (`controller/plugs/rancard_glance_plug.py`) — Rancard's own developer page
  confirms the product (number threat status/risk/history lookup) but
  doesn't publish a public request/response schema, so no real HTTP call is
  made. The UI here already handles loading, error, and no-results states
  so wiring in a real client later (once real docs are available) won't
  need UI changes.

## Profile tab

A static placeholder (name, community, settings, a log-out button that just
returns to Actions) — there is no real account system yet. Per the current
build plan, this is intentionally left as a placeholder; building real
accounts/auth is future work.

## Identity

No login exists yet. `identity.js` generates a random per-browser id on
first use and stores it in `localStorage`, the same "trust a client-supplied
id" simplification the rest of this project already uses for `reporter_id`
(see `CONTRACT.md`). Not real authentication — don't rely on it for anything
beyond demo-level per-browser report deduping.

## Running it

Serve the repo root as static files alongside the controller, e.g.:

```bash
python3 -m http.server 5500
```

then open `http://127.0.0.1:5500/innovate-reps/index.html` with the
controller running separately (`python -m uvicorn controller.app:app --port 8000`).
`config.js` points at `http://127.0.0.1:8000` by default.

## Tests

```bash
cd innovate-reps && npm test
```

Tests cover the pure logic modules (`reportForm.js`, `lookupDisplay.js`) —
no DOM, no network — the same pattern `demo-control/tests/contacts.test.js`
uses.
