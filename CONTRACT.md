# MoMoGuard API Contract — v0.4

Shared contract between the **controller** (this repo, Python/FastAPI) and the **phone page + scoreboard** (Person 2).
Nobody changes this file alone: post the change in the team chat, edit this file, raise the version number.

**Read this before building anything.** This file is also the instructions file for any AI coding
assistant working on this repo — read it first and only touch your own folder, per the project's
own long-standing convention.

## Current product direction (v0.4 — read this section first, supersedes v0.3 below)

**This section is the authoritative, current product direction.** It supersedes both the original
Track 3 (fraud-blocking/scoring) framing *and* the Track 4 pivot framing/blueprint recorded in the
"v0.3" section further down and in the project's internal `community-pivot-review.md` note — those
are kept below as historical record, not as live direction. Where they conflict with this section,
this section wins.

> **Provenance note:** this is a condensed summary of the product direction as relayed to the AI
> agent maintaining this file, not a verbatim paste of an original PRD document (the agent was not
> given the original file to paste in full). If a full written PRD document exists, paste its exact
> text in place of this summary and keep this note only as a changelog breadcrumb.

**Build status (as of this change — everything below marked ✅ is already in the repo, not just planned):**
- ✅ Rancard Glance stub backend (`controller/plugs/rancard_glance_plug.py`, `GET /rancard/reverse-lookup`)
- ✅ Innovate Reps console (`innovate-reps/` — separate page, own two-tab app, linked from the
  feature-phone preview's footer, not embedded in it)
- ✅ SIM Toolkit app in the feature-phone 3×3 grid (replaces the old "Games" slot)
- ✅ Old USSD customer-lookup menu/screens/session handling — removed
- ✅ Gemini SMS Agent design doc — removed
- ⬜ Twi localization — **not done**, explicitly deferred
- ⬜ Call-console (`demo-control/`) integration with community reports/warnings — **not done**,
  explicitly deferred
- ⬜ A real (non-stub) Rancard Glance client — blocked on Rancard providing actual API docs

**Removed:**
- The **old USSD customer-lookup menu/screens/session handling** — i.e. only the number-lookup
  parts of the existing USSD flow and its feature-phone UI, not the whole USSD system. See
  `docs/track3-removal-candidates.md` for the dependency audit this was based on (GlancePlug itself,
  and the separate "Report a Scam" flow that also uses it, were untouched — only the customer-facing
  lookup menu went). Number lookup now lives in the SIM Toolkit app and the Innovate Reps console
  instead, both backed by the new Rancard Glance stub.
- The **Gemini SMS Agent design document and any associated code/config.** (`docs/sms-ai-agent-design.md`
  — confirmed by audit to be a design/research note only; no implementation code or `.env` entries
  referenced Gemini anywhere else in the repo.) This work is retired, not deferred.

**Retain as-is, not headline (keep working, do not rebuild around it):**
- The real-money-movement / MTN MoMo sandbox simulation (`controller/plugs/bank_plug.py`,
  `controller/plugs/mtn_momo_bank_plug.py`, `BANK_PLUG_MODE=mtn_sandbox`, the Brain/pause-manager
  payment-risk flow). Still a secondary/background capability supporting a Track 1 claim, per the
  v0.3 framing below — this PRD does not change that status.
- The call console simulator (`demo-control/`). Untouched in this change. Integration with
  community reports/warnings is still future work, explicitly deferred (see "Build status" above).
- The community-reporting backbone (`controller/plugs/glance_plug.py` / `GlancePlug`, and the
  community `reports`/`numbers`/`warnings` work from the Track 4 pivot). GlancePlug in particular
  is a **hard dependency** of the payment Brain's scoring (`glance.check(recipient)["reports"]` in
  `build_context()`), not just a lookup convenience — it must not be deleted even though the
  *customer-facing* lookup menu that also used it is being removed.

**Built in this change:**
- An **"Innovate Reps"** community-representative interface (`innovate-reps/`): its own standalone
  page — a separate smartphone-style UI, **not** embedded in or sharing a page with the customer
  feature-phone simulator — with a two-tab bottom nav (Actions, Profile). The Actions tab has a
  Report-a-Scam form (phone number, time, community, description) that posts to the same `/report`
  endpoint/`GlancePlug` storage the USSD flow already uses, plus a Reverse Number Lookup section
  calling the new Rancard Glance stub. Profile is a static placeholder (name, community, settings,
  log out) per the current build plan. Linked from the feature-phone preview's page footer
  (`phone-page/index.html`) — the feature-phone UI itself is otherwise unchanged.
- A customer-facing **SIM Toolkit app**, added to the feature-phone simulator's 3×3 app grid in
  place of the old, purely-decorative "Games" slot (the least thematically relevant, non-functional
  icon in that grid — see the code comment at its definition in `phone-page/app.js`). Its 3 options:
  Learn About Emerging Scams (placeholder only, no content, per the brief), Reverse Number Lookup
  (same shared Rancard Glance stub as Innovate Reps), and Report a Suspicious Number (a simpler,
  number-only flow than the Innovate Reps form, feeding the same `/report`/`GlancePlug` storage).
- A centralized **Rancard Glance API** backend service. This is a real third-party number-reputation
  API (confirmed at rancard.com — real-time number lookup/verification, threat status, risk level,
  history, centralised threat reporting), **not** the existing `NetworkPlug`/"Network API". Rancard's
  public developer page does not publish a request/response schema or base URL — only "work with the
  Rancard team" for product-specific docs — so **`controller/plugs/rancard_glance_plug.py` ships as a
  clearly-labelled stub** (`GET /rancard/reverse-lookup?number=`, `source: "rancard_stub"`) behind the
  real interface shape, not an invented/guessed live integration. `RANCARD_GLANCE_API_KEY` /
  `RANCARD_GLANCE_BASE_URL` / `RANCARD_GLANCE_MODE` are in `.env.example` as placeholders; flipping
  `RANCARD_GLANCE_MODE` to `"live"` raises immediately until a real client is implemented against
  confirmed Rancard docs.

**Still future work, explicitly deferred (not built in this change):**
- **Twi localization** (English default + Twi) via a centralized translation layer. (`phone-page/i18n/`
  already has an `en.json`/`tw.json` split with an empty `tw.json` as a starting point.)
- Integrating the call console simulator (`demo-control/`) with community reports/warnings.
- A real (non-stub) Rancard Glance client — blocked on Rancard providing actual request/response
  documentation; see `controller/plugs/rancard_glance_plug.py`.

**Database:** preserve the existing SQLite schema from the Track 4 pivot (`reports`, `numbers`,
`warnings`, `training_attempts`). **Do not drop tables.** Any schema change needed for the above
net-new work must be an additive migration, not a rewrite.

**Rancard Glance replaces any prior ad hoc number-lookup/registry approach** — i.e. once it lands,
new number-reputation reads (Reverse Number Lookup, the Innovate Reps interface) should call it
rather than inventing another local/canned lookup table. This does not retroactively obsolete
`GlancePlug`'s internal role feeding the payment Brain's risk score (see "Retain as-is" above);
that is a separate, still-needed internal signal, not a customer-facing lookup surface.

**Known open item for whoever merges branches:** the Track 4 pivot MVP (`cursor/community-pivot-mvp-9df9`,
PR #5) independently bumped this file to its own "v0.3" with different content than the "v0.3"
section preserved below. Reconcile both v0.3 drafts into a single v0.4+ document when merging,
rather than silently picking one.

## Project framing (v0.3 — superseded by "Current product direction" above; kept as historical record)

**The project's primary track is now Track 4 (Community) + Track 1 support ("spot the scam"),
not Track 3 (fraud-blocking/scoring).** This is a deliberate pivot decision, made partly over
Ghana Data Protection Act concerns with the old Track 3 framing (an automated system reading and
acting on payment/SMS data).

- **The old Track 3 payment-risk system — Brain, pause manager, OTP stub, MTN sandbox bank plug,
  MessageIntelligenceAgent — is de-emphasized, not removed.** It stays in the repo, stays
  working, stays tested. Do not delete or rework it without an explicit decision to do so (see
  `docs/track3-removal-candidates.md` for what that would mean if it's ever approved — it is a
  candidate list only, nothing in it is scheduled for deletion yet).
  It is now a **secondary/background capability** — worth keeping because it already works and
  can support a Track 1 ("spot the scam") bonus claim — but it is **no longer the headline
  feature** and no longer what new work should be designed around.
- **New work should follow the community-reporting / moderation / warnings / training model**,
  not the payment-pause-and-score model. Concretely: a **report** is submitted by anyone, is
  unreviewed, and is never proof on its own; a **report becomes a warning** only after a
  moderator reviews and publishes it, and a published warning does not auto-decay the way a raw
  report count does. Build new features as this report → moderate → publish → read-back pipeline
  (reports, numbers/reputation, warnings, training/quiz), reusing this file's existing
  endpoint-per-feature conventions (plain JSON in/out, `source` labelling, "may be / not proof"
  wording, no PIN/OTP ever) rather than extending the old payment-risk scoring model.
- When in doubt about which system a new feature belongs in: if it's about deciding whether *this
  specific payment, right now* should go through, it's Track 3 (old system, touch sparingly). If
  it's about the community knowing/learning something that outlives one payment — a reported
  number, a published alert, a training exercise — it's Track 4 (new system, build here).

- Base URL (dev): `http://127.0.0.1:8000`
- All requests/responses are JSON. `GET` endpoints (`/rancard/reverse-lookup`, `/metrics`, `/audit`) use a query parameter or none; everything else is a JSON body.
- The phone page is a **dumb screen**: it sends key presses to `POST /ussd` and displays the returned text. It does no risk calculation.
- Everything simulated is labelled `source: "simulated"`.
- **No endpoint ever accepts, stores, or logs a PIN or OTP.**
- A failed or timed-out request must never be shown as a successful payment.
- User-facing wording: "pause before sending", "may be", "not proof it is safe". Never "freeze" or "scammer".

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /assess` | Brain decides on a payment. Creates a paused reference when needed. |
| `POST /confirm` | Answer to the big-amount confirm screen (`yes`/`no`). |
| `POST /voice-result` | Keypad answers from the voice check; returns release/hold/cancel. |
| `POST /resume` | Resume a paused payment with its reference (single-use, owner-bound). |
| `POST /report` | Report a number as *suspected*. `trick` is a scam name, or `"community_reported"` from the Innovate Reps console / SIM Toolkit's simpler report flow, which also accept optional `description`/`community`/`incident_time`. |
| `GET /rancard/reverse-lookup?number=` | Reverse number lookup via Rancard Glance. **Stub** — see `controller/plugs/rancard_glance_plug.py`. Replaces the old `GET /check-number` (removed; `GlancePlug.check()` itself is unchanged and still feeds `/assess`'s internal risk scoring). |
| `POST /check-sms` | Message Intelligence Agent. Warn-only. |
| `POST /check-otp` | **STUB ONLY — on hold.** Returns a not-implemented placeholder. No OTP logic exists. |
| `POST /ussd` | Server-driven menus: page sends the key pressed, controller returns the next screen text. |
| `GET /metrics` | Scoreboard tiles: scams stopped, seconds added (avg + p95), payments checked. |
| `GET /audit` | Activity log, newest first. |
| `POST /reset-demo` | Restore demo accounts and all state to the known starting state. |

## POST /assess

Request:
```json
{ "session_id": "s1", "sender": "0240000001", "recipient": "0240000002",
  "amount": 300, "ts": "2026-11-27T10:15:00" }
```

Response (the phone page displays `message` as-is):
```json
{ "decision": "allow|confirm|caution|hold|block",
  "band": "low|caution|high|very_high",
  "message": "text for the phone screen",
  "reference": "only present when paused (decision hold)",
  "confirm": { "usual": 100, "new": 7000, "in_words": "seven thousand cedis" },
  "voice_script_id": "voice_check_en",
  "reasons": ["new_recipient", "unknown_call_before"],
  "labels": ["possible_fake_reversal"],
  "sources": { "bank": "simulated", "network": "simulated", "calls": "simulated", "glance": "simulated" } }
```
- `sources.bank` is `"mtn_sandbox"` instead of `"simulated"` when `BANK_PLUG_MODE=mtn_sandbox` is set (real MTN MoMo hackathon sandbox); all other sources are unaffected and the rest of the response shape is unchanged.

- `confirm` is present only when `decision == "confirm"`.
- `reference` is present only when `decision == "hold"`.
- `voice_script_id` is present when a voice check applies (`hold`).
- `reasons`, `labels`, `sources` are extra detail for the scoreboard/debugging; the page may ignore them.
- Bands: `low` < 0.25 (goes through), `caution` 0.25–0.6 (note shown, continues), `high` 0.6–0.9 (paused + voice check), `very_high` > 0.9 (stopped outright, no release).
- `decision` mapping: low → `allow`, caution → `caution`, high → `hold`, very_high → `block`.
  Trusted-pair big amount overrides to `confirm` (see below); the recipient's risk does not rise.
- **Two-groups rule:** unless at least two different signal groups (A/B/C/D) have positive evidence, the score is capped at **High** (a single strong signal can pause, but can never reach Very High alone).

### Trusted-pair confirm

Triggered only when the pair has safe history and `amount > 5 × max_safe_amount(pair)` (comparison base at least GH₵200).
Screen text style: "You usually send about GH₵100 to Kofi. You are sending GH₵7,000 (seven thousand cedis). Continue? 1 Yes 2 No".
"No" ends the payment and records nothing against anyone.

### Sending money back

A payment back to someone who previously paid the sender does not receive the full new-recipient or unusual-amount risk. If the pair has no safe outgoing history, the incoming payment is within 24 hours, and the amount is 0.5–2 times that payment, a mild signal applies only when another positive signal group is present. A send-back alone never raises the risk.

## POST /confirm

```json
// request
{ "session_id": "s1", "sender": "0240000001", "recipient": "0240000002",
  "amount": 7000, "answer": "yes|no" }
// response
{ "decision": "allow|cancelled", "message": "text for the phone screen" }
```
`yes` releases the payment to the (pretend) bank; `no` cancels it, nothing recorded against anyone.

## POST /voice-result

```json
// request
{ "reference": "r1", "sender": "0240000001",
  "answers": { "who_asked": "called|messaged|self",
               "purpose": "reverse|fee_prize_job|goods|family",
               "claimed_official": true, "hurry": true, "knows": false } }
// response
{ "decision": "release|hold|cancel", "message": "text for the phone screen",
  "offer_report": true, "attempts_left": 2 }
```
- `release`: payment sent to the (pretend) bank, once. Result screen shows sent.
- `hold`: still risky; another attempt allowed (max 3 total).
- `cancel`: payment cancelled. `offer_report` asks "Report this number? Press 1."
- A reference is single-use, bound to sender/recipient/amount. Wrong sender → refused. Replay → refused.
- No answer within ~3 minutes → cancelled automatically (never released because time ran out).

## POST /resume

```json
// request
{ "reference": "r1", "sender": "0240000001" }
// response
{ "status": "pending|released|cancelled|expired|refused", "message": "..." }
```
Checks the state of a paused payment. If sender/recipient/amount changed, the payment must be assessed again (new `/assess`).

## POST /report

```json
// request
{ "number": "0240000009", "trick": "possible_fake_reversal", "reporter_id": "s1",
  "description": "optional, free text", "community": "optional", "incident_time": "optional" }
// response
{ "accepted": true, "message": "Thank you. This number has been noted as suspected." }
```
- Reports are *suspected*, never proof. One report per reporter per number per day (dedup is keyed
  by number/reporter/day only — the optional fields below don't affect it).
- Reporter ID is stored as a keyed hash (pseudonymous), never raw.
- Goes to the local report list now; Glance submission is a stub until access arrives.
- `trick` is either one of the original scam-name values (from the USSD "Report a Scam" flow's
  3-option picker) or the fixed string `"community_reported"` (from the Innovate Reps console's
  report form, or the SIM Toolkit's simpler "Report a Suspicious Number" option, neither of which
  has that picker). `description`/`community`/`incident_time` are optional free-text extras those
  two newer flows collect; the original USSD flow never sends them.

## GET /rancard/reverse-lookup?number=0240000009

**Stub.** See `controller/plugs/rancard_glance_plug.py`'s module docstring for exactly what was and
wasn't found in Rancard's public documentation — no real HTTP call is made.

```json
{ "number": "0240000009", "status": "flagged|clear|no_results|error", "risk": "high|low|unknown|unavailable",
  "history": ["reported for an advance-fee scam pattern (demo data)"],
  "message": "Glance has flagged this number. That may be a warning sign, not proof it is unsafe.",
  "source": "rancard_stub" }
```
- Shared by the Innovate Reps console's Reverse Number Lookup section and the SIM Toolkit's Reverse
  Number Lookup option — one backend call, not two.
- Replaces the old `GET /check-number` (removed). `GlancePlug.check()` itself is **not** replaced or
  removed — it still runs inside `/assess`'s internal risk-scoring context, unrelated to this
  customer-facing lookup.
- `"no_results"`/`"clear"` never mean "safe" — every message says so explicitly, same convention as
  the rest of this project.

## POST /check-sms

```json
// request
{ "sender": "0240000005", "recipient": "0240000001",
  "text": "I have sent you GH₵300. Please return GH₵200 immediately.", "ts": "..." }
// response
{ "message_type": "financial_claim|financial_alert|not_financial",
  "classification": "suspicious|likely_honest|unknown",
  "risk_level": "low|medium|high",
  "labels": ["possible_fake_deposit", "request_to_return_money", "urgency"],
  "evidence": { "claimed_amount": 300,
                "matching_transaction": "matched|not_matched|unavailable",
                "sender_type": "normal_number|sender_id",
                "institutional_authenticity": "missing_marker|unsupported_method|unavailable" },
  "recommended_action": "allow|warn",
  "explanation": "plain-language reason",
  "warning": "text for the phone screen (only when warn)",
  "checker_status": "complete|not_checked|error",
  "source": "simulated" }
```
- **Warn-only.** Never deletes, blocks, or holds a message. No `hold` action exists.
- Agent error/timeout → `{ "checker_status": "not_checked", "recommended_action": "allow" }` (fail open).
- Ledger matching is `unavailable` in this build (classifier-only until the sandbox DataPlug lands).
- Label vocabulary maps to three scam names: possible fake reversal, possible impersonation, possible advance fee. Always "may be", shown only when clues agree.

## POST /check-otp — STUB (on hold)

Accepts any JSON body. Always returns:
```json
{ "status": "not_implemented", "checker_status": "not_checked",
  "recommended_action": "allow",
  "message": "The code check is not available yet." }
```
No OTP logic is built. The OTP approach is still being decided by the project owner. Do not build against this endpoint beyond showing the placeholder.

## POST /ussd

```json
// request
{ "session_id": "s1", "key": "1", "sender": "0240000001" }
// response
{ "text": "screen text (under ~160 chars)", "state": "main_menu|...", "done": false }
```
- `key: ""` (or `"start"`) starts a session and returns the main menu.
- The controller owns all navigation. The page only displays `text` and sends the next key.
- Main menu: `Welcome to MoMoGuard  1 Send Money  2 Report a Scam  3 Scam Alerts  5 Language` (item 4
  — the old "Check a Number" USSD lookup — was removed; numbering is left with a gap rather than
  renumbered, pending a product decision on the SIM Toolkit's own future menu placement — see
  `docs/track3-removal-candidates.md` §1.3). Number lookup now lives in the feature-phone app grid's
  new **SIM Toolkit** app (its own screen, not nested in this dial-code menu) and in the separate
  Innovate Reps console, both calling `GET /rancard/reverse-lookup`.
- Send Money flow: recipient → amount → controller assesses → decision screen.
  - `hold` → voice-check screen (questions, keypad answers). `confirm` → "1 Yes 2 No".
  - Result screen: sent / cancelled. A failure is never shown as sent.
- The controller never asks for a PIN. (If the sandbox later needs a PIN step, the page shows a clearly labelled fake PIN screen that discards the digits — they are never sent here.)
- `key: "end"` cancels the session.

## GET /metrics

```json
{ "payments_checked": 12, "scams_stopped": 3,
  "seconds_added": { "avg": 41.2, "p95": 78.0 },
  "source": "simulated" }
```
- `scams_stopped`: paused/blocked payments that ended cancelled, expired, or blocked (never released).
- `seconds_added`: time from assess to final outcome for paused payments (avg and 95th percentile).

## GET /audit

```json
{ "events": [ { "ts": "...", "type": "assess|confirm|voice_result|release|cancel|expire|report|sms_check",
                "sender": "...", "recipient": "...", "amount": 300,
                "band": "high", "decision": "hold", "reference": "r1" } ],
  "source": "simulated" }
```
Newest first. Never contains PINs or OTPs (they are never received).

## POST /reset-demo

Request: `{}` — Response: `{ "status": "ok", "message": "Demo reset to starting state." }`
Restores pretend bank balances/history, clears paused payments, reports, metrics, audit, and USSD sessions.

## Value sets (fixed)

- `decision` (assess): `allow | confirm | caution | hold | block`
- `band`: `low | caution | high | very_high`
- `decision` (voice-result): `release | hold | cancel`
- SMS `recommended_action`: `allow | warn` (no `hold`)
- `checker_status`: `complete | not_checked | error`
- `evidence.matching_transaction`: `matched | not_matched | unavailable`
- `institutional_authenticity`: `recognised_sender_id | institutional_sender_tag | verified_signature | invalid_marker | missing_marker | unsupported_method | unavailable` (never `not_verified`)
- Network statuses: `detected | not_detected | unavailable | error`
- **There is no `limit_24h` anywhere in this project.**

## Internal field names (DataPlug maps sandbox columns into these later)

`Transaction(id, ts, sender, recipient, amount, balance_before, label?)`
`Call(ts, caller, callee, duration_s)`
`Sms(ts, sender, recipient, text, label?)`
`Report(ts, reporter_id, number, trick)`

## Demo accounts (pretend bank, starting state)

| Number | Name | Notes |
|---|---|---|
| 0240000001 | Aunty | feature-phone customer, balance GH₵8,000 |
| 0240000002 | Kofi | trusted friend; Aunty usually sends GH₵50–100 |
| 0240000005 | Stranger | new number, recent SIM change (simulated), long unknown call before payment (simulated) |
| 0240000006 | New Supplier | paid Aunty GH₵200 at 08:00; send-back demo, no outgoing history from Aunty |
| 0240000007 | Mum | new number, recent SIM change (simulated) — pauses, then voice check |
| 0240000009 | Reported Number | several independent reports (simulated Glance) |

The project owner may adjust these via `controller/plugs/bank_plug.py` seed data; `POST /reset-demo` restores them.