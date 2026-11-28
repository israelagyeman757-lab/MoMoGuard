# Rancard Glance integration

Central module: `controller/plugs/rancard_glance_plug.py`

| Capability | Default (CI/demo) | Live switch |
|---|---|---|
| **Reverse lookup** (`GET /rancard/reverse-lookup`) | Stub canned data | `RANCARD_GLANCE_MODE=live` |
| **Sandbox reporting** (from `POST /report`) | Stub (`glance_submission.submitted: false`) | `RANCARD_GLANCE_REPORT_MODE=live` |

**Base URL (sandbox):** `https://glance-api.rancardmobility.com`  
**Auth:** `X-API-Key` from untracked `.env` (`GLANCE_DEV_KEY` or `RANCARD_GLANCE_API_KEY`) — never commit, log, or print.

**Shared limit:** 60 requests / key / minute (reports + lookups).

---

## Confirmed: reverse lookup (aggregates)

`GET /api/v1/developer/sandbox/msisdn/aggregates?msisdn=SYN-####`

- **Query:** `msisdn` required (`SYN-0000`…`SYN-9999` only; real MSISDNs in query → HTTP 400).
- **Optional:** `page` (default 0), `size` (default 20; sandbox returns ≤1 row).
- **Response envelope:** `success`, `code` (`"00"` = success), `message`, `requestId` (safe to log), `data.items[]`.
- **Item fields used:** `timesReported`, `riskColor`, `riskDescription`, `severity`, `firstReported`, `lastReported`, `riskScore`, `explanation` (`status`, `riskLevel`, `reasons`, …).
- **403 `SANDBOX_SERVER_ONLY`:** browser-origin calls are rejected; MoMoGuard calls from the backend only.

MoMoGuard maps any user-entered number to sandbox `SYN-####` via the **last four digits** (see reporting section). Normalized JSON adds `short_message` for the SIM Toolkit and richer fields for Innovate Reps. All user-facing copy states this is **not a confirmed fraud finding**.

---

## Confirmed: sandbox reporting

`POST /api/v1/developer/sandbox/flagged-msisdns/reports`

Headers: `X-API-Key`, `Idempotency-Key` (UUID v5 from reporter+number+day), `Content-Type: application/json`.

Body: `msisdn`, `reason`, `simulatedSourceId`, `severity`.

### `reason` values confirmed empirically

- `PHISHING`
- `IMPERSONATION`
- `ACCOUNT_TAKEOVER`

(A fourth enum may exist in Rancard developer docs; we map only these three.)

Success: HTTP `201`, `code: "00"`.

---

## Environment (`.env` only)

```bash
GLANCE_DEV_KEY=...                 # or RANCARD_GLANCE_API_KEY
RANCARD_GLANCE_BASE_URL=https://glance-api.rancardmobility.com
RANCARD_GLANCE_MODE=stub           # reverse lookup; use live for demos
RANCARD_GLANCE_REPORT_MODE=stub    # reporting; use live for demos
RANCARD_GLANCE_TIMEOUT_S=8
```

Optional: `RANCARD_GLANCE_SIM_SOURCE_ID`, `RANCARD_GLANCE_SIM_SOURCE_REP`, `RANCARD_GLANCE_SIM_SOURCE_CUSTOMER`.

Legacy `RANCARD_GLANCE_LOOKUP_PATH` is **unused** — lookup uses the aggregates path above.