# Rancard Glance integration — live API blockers

MoMoGuard centralizes reverse-number lookup in `controller/plugs/rancard_glance_plug.py`
and exposes `GET /rancard/reverse-lookup?number=`. Innovate Reps and the customer SIM
Toolkit both call that endpoint only (no duplicate client logic).

## Current behaviour (stub)

- Default `RANCARD_GLANCE_MODE=stub` (or unset): canned demo numbers, `source: "rancard_stub"`.
- `RANCARD_GLANCE_MODE=live` **without** both `RANCARD_GLANCE_BASE_URL` and
  `RANCARD_GLANCE_LOOKUP_PATH` set from official Rancard documentation: **no HTTP
  guesswork** — response is the same stub shape with `live_attempted: false` and a
  `live_note` explaining what is missing.
- When base URL **and** lookup path are configured, the plug attempts one authenticated
  request using `RANCARD_GLANCE_API_KEY` (local `.env` only, never committed). On any
  failure it falls back to the stub and sets `source: "rancard_stub"`.

## What Israel needs from Rancard (before flipping to a real integration)

1. **Sandbox/production base URL** (no trailing slash).
2. **Exact lookup path and HTTP method** (e.g. whether number is query param or JSON body).
3. **Authentication scheme** (header name and format for the `gldev_*` key).
4. **Request/response JSON schema** for a reverse lookup (field names for threat status,
   risk level, history, errors, empty results).
5. **Timeout/retry guidance** and rate limits.
6. **Error codes** that mean “no record” vs “service down” vs “invalid number”.

Public marketing pages at rancard.com confirm Glance exists but do **not** publish the wire
contract. This repo intentionally does not invent paths or response fields.

Configure in untracked `.env` (see `.env.example`):

- `RANCARD_GLANCE_API_KEY`
- `RANCARD_GLANCE_BASE_URL`
- `RANCARD_GLANCE_LOOKUP_PATH` (from Rancard only)
- `RANCARD_GLANCE_MODE=live` (optional; stub fallback remains until the above are confirmed)