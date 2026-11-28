# Rancard Glance integration

Central module: `controller/plugs/rancard_glance_plug.py`

| Capability | Default (CI/demo) | Live switch |
|---|---|---|
| **Reverse lookup** (`GET /rancard/reverse-lookup`) | Stub canned data (`source: rancard_stub`) | `RANCARD_GLANCE_MODE=live` + `RANCARD_GLANCE_LOOKUP_PATH` from Rancard |
| **Sandbox reporting** (forwards from `POST /report`) | Stub (`glance_submission.submitted: false`) | `RANCARD_GLANCE_REPORT_MODE=live` |

## Confirmed: sandbox reporting API (Israel, 2026-11-28)

- **Base URL:** `https://glance-api.rancardmobility.com`
- **Path:** `POST /api/v1/developer/sandbox/flagged-msisdns/reports`
- **Headers:** `X-API-Key` (from untracked `.env`: `GLANCE_DEV_KEY` or `RANCARD_GLANCE_API_KEY`), `Idempotency-Key` (UUID), `Content-Type: application/json`
- **Body (sandbox):** `msisdn` (`SYN-0000`…`SYN-9999` fictional), `reason`, `simulatedSourceId`, `severity` (`LOW`/`MEDIUM`/`HIGH`)
- **Success:** HTTP `201`, `{"code":"00","success":true,...}`
- **Rate limit:** 60 requests / key / minute (handle HTTP `429`)

### `reason` values confirmed via sandbox (not guessed)

Empirically accepted by the API with `simulatedSourceId: SIM-A`:

1. `PHISHING`
2. `IMPERSONATION`
3. `ACCOUNT_TAKEOVER`

A **fourth** enum value is referenced in Rancard materials but was **not** discoverable without developer-console docs (authenticated `GET /api/v1/developer/docs` returned `401` for this key). MoMoGuard maps internal trick/request fields only onto the three confirmed values.

### Real phone → sandbox MSISDN

MoMoGuard maps any reported number to **`SYN-####`** using the **last four digits** of the normalized MSISDN (e.g. `0240000009` → `SYN-0009`). This is **sandbox fiction only**, not a production identifier. Free-text description is kept locally in `GlancePlug`; the Glance API accepts no description field.

### Idempotency

`Idempotency-Key` = UUID v5 of `reporter_id|number|report_day`, matching the local “one report per reporter per number per day” rule so retries replay without duplicate sandbox submissions.

### Source mapping

- Innovate Reps: `channel: innovate_reps` → `simulatedSourceId` from `RANCARD_GLANCE_SIM_SOURCE_REP` (default `SIM-A`)
- SIM Toolkit: `channel: customer_sim_toolkit` → `RANCARD_GLANCE_SIM_SOURCE_CUSTOMER` (default `SIM-A`)

## Reverse lookup: still stub

Israel’s reporting contract is confirmed; **lookup is not**. Probed `GET` paths under `/api/v1/developer/sandbox/` (including `flagged-msisdns/{SYN}`, `lookup`, `reverse-lookup`) returned **`401 Unauthorized`** with the developer sandbox key—no documented read endpoint for this credential.

Until Rancard publishes a lookup path + response schema:

- Keep `GET /rancard/reverse-lookup` on stub data (`source: rancard_stub`).
- Do **not** set `RANCARD_GLANCE_LOOKUP_PATH` unless Rancard confirms it.

## Environment (`.env` only — never commit)

```bash
GLANCE_DEV_KEY=...              # or RANCARD_GLANCE_API_KEY
RANCARD_GLANCE_BASE_URL=https://glance-api.rancardmobility.com
RANCARD_GLANCE_REPORT_MODE=live # default stub in CI
RANCARD_GLANCE_MODE=stub        # lookup; stay stub until lookup path exists
RANCARD_GLANCE_TIMEOUT_S=8
```

Optional: `RANCARD_GLANCE_SIM_SOURCE_ID`, `RANCARD_GLANCE_SIM_SOURCE_REP`, `RANCARD_GLANCE_SIM_SOURCE_CUSTOMER`.