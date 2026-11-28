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

**Remove (in scope now):**
- The **old USSD customer-lookup menu/screens/session handling** — i.e. only the number-lookup
  parts of the existing USSD flow and its feature-phone UI, not the whole USSD system. Audit
  dependencies first; do not break anything still needed by the payment flow or the reporting
  flow. See `docs/track3-removal-candidates.md` for the dependency audit and exact edits.
- The **Gemini SMS Agent design document and any associated code/config.** (`docs/sms-ai-agent-design.md`
  — confirmed by audit to be a design/research note only; no implementation code or `.env` entries
  reference Gemini anywhere else in the repo.) This work is **retired**, not deferred.

**Retain as-is, not headline (keep working, do not rebuild around it):**
- The real-money-movement / MTN MoMo sandbox simulation (`controller/plugs/bank_plug.py`,
  `controller/plugs/mtn_momo_bank_plug.py`, `BANK_PLUG_MODE=mtn_sandbox`, the Brain/pause-manager
  payment-risk flow). Still a secondary/background capability supporting a Track 1 claim, per the
  v0.3 framing below — this PRD does not change that status.
- The call console simulator (`demo-control/`). **Gets modified, not removed**, to integrate with
  community reports/warnings (exact integration is future work, not scoped in this file update).
- The community-reporting backbone (`controller/plugs/glance_plug.py` / `GlancePlug`, and the
  community `reports`/`numbers`/`warnings` work from the Track 4 pivot). GlancePlug in particular
  is a **hard dependency** of the payment Brain's scoring (`glance.check(recipient)["reports"]` in
  `build_context()`), not just a lookup convenience — it must not be deleted even though the
  *customer-facing* lookup menu that also used it is being removed.

**Net new, to build later (explicitly future work, not scoped by this file update):**
- An **"Innovate Reps"** community-representative interface: an Actions tab (report-a-scam form +
  reverse-number-lookup section) and a Profile tab.
- A customer-facing **SIM Toolkit menu** with exactly 3 options — Learn About Emerging Scams
  (placeholder only, no content yet), Reverse Number Lookup, Report a Suspicious Number — replacing
  the old USSD lookup entry point in the feature-phone simulator's 3×3 app grid.
- A centralized **Rancard Glance API** backend service. This is a real third-party number-reputation
  API, **not** the existing `NetworkPlug`/"Network API" and **not** an invented/guessed endpoint
  shape. `.env.example` already carries `GLANCE_API_KEY`/`GLANCE_BASE_URL` placeholders and the
  existing `GlancePlug` class name anticipates this exact integration — whoever builds this should
  inspect any existing Rancard integration notes/credentials first and not guess the request/response
  schema.
- **Twi localization** (English default + Twi) via a centralized translation layer. (`phone-page/i18n/`
  already has an `en.json`/`tw.json` split with an empty `tw.json` as a starting point.)

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
- All requests/responses are JSON. `GET /check-number` uses a query parameter.
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
| `POST /report` | Report a number as *suspected*, with a scam name. |
| `GET /check-number?number=` | Number reputation (Glance stub, else local report list). |
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
{ "number": "0240000009", "trick": "possible_fake_reversal", "reporter_id": "s1" }
// response
{ "accepted": true, "message": "Thank you. This number has been noted as suspected." }
```
- Reports are *suspected*, never proof. One report per reporter per number per day.
- Reporter ID is stored as a keyed hash (pseudonymous), never raw.
- Goes to the local report list now; Glance submission is a stub until access arrives.

## GET /check-number?number=0240000009

```json
{ "number": "0240000009", "reports": 3, "risk": "high|single_source|unreported|unavailable|error",
  "message": "This number has been reported by several people. That may be a warning sign, not proof it is unsafe.",
  "source": "simulated" }
```
- "Unreported" never means "safe". Unavailable → no penalty, message says the number could not be checked.

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
- Main menu: `Welcome to MoMoGuard  1 Send Money  2 Report a Scam  3 Scam Alerts  4 Check a Number  5 Language`.
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