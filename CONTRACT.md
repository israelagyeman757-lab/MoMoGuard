# MoMoGuard — v0.5

This file contains the authoritative product specification and the shared API contract
between the **controller** (Python/FastAPI) and frontends (feature-phone, Innovate Reps,
demo-control). Nobody changes the API sections alone: post the change in the team chat,
edit this file, and raise the version number.

**Read this before building anything.**

---

# MoMoGuard – Updated Product Direction & Implementation Specification

> Source: full PRD text pasted verbatim by Israel Agyeman (project owner) on 2026-11-28. This is the authoritative spec for the community pivot and supersedes all earlier condensed summaries of it.

1. Project Overview

We are restructuring MoMoGuard to focus on two primary user experiences:

1. Community Representatives (Innovate Reps): A dedicated interface for community representatives to report suspected scams and perform phone-number reverse lookups using the Rancard Glance API.
2. Customers (Feature Phone and Smartphone Users): A SIM Toolkit-based experience that allows customers to learn about emerging scams, perform number lookups, and report suspicious numbers independently.

The new system should prioritize accessibility, simplicity, community intelligence, and early scam detection.

Important: Review the existing codebase before implementing anything. Reuse components, services, and infrastructure that still fit the new direction. Remove obsolete functionality instead of carrying unnecessary legacy features into the new system.

---

2. Community Representative Interface (Innovate Reps)

Create a dedicated interface for community representatives.

The interface should have a bottom navigation bar with exactly two primary tabs:

- Actions
- Profile

2.1 Actions Tab

This is the primary workspace for community representatives.

It should contain two vertically arranged sections.

Section A: Report a Scam

This section allows representatives to submit reports about suspicious phone numbers and scam activities within their communities.

Include the following fields:

1. Phone Number: Input field for the suspicious phone number.
2. Time: Field for when the scam occurred or was observed.
3. Community: The community or location where the incident was reported.
4. Scam Description: A field describing what happened or the suspected scam tactic.

Include a prominent red REPORT button.

When submitted:

- Validate the required information.
- Submit the report to the backend.
- Store the report in the community intelligence system.
- Provide clear success or failure feedback.
- Prevent accidental duplicate submissions where practical.

The reporting system should support the existing scam fingerprint concept, using the claimed identity and request type to help identify repeated scam patterns.

Do not automatically classify a number as a confirmed scammer based on one unverified report.

Section B: Reverse Number Lookup

This section should appear below the reporting section when the representative scrolls down.

Include:

- A phone-number input field.
- A prominent lookup button.
- A loading state while the lookup is processing.
- A results area displaying the information returned by the Rancard Glance API.

The lookup must connect to the backend, which will communicate with the Rancard Glance API.

Do not expose API credentials in the frontend.

Display relevant information returned by the API, using the actual response schema rather than inventing fields.

Handle:

- Valid number lookups.
- Invalid phone numbers.
- Numbers with no available results.
- API errors.
- Network timeouts.
- Loading states.

The interface should make the results understandable to representatives who may not have technical knowledge.

2.2 Profile Tab

Create a separate profile section for representatives.

Reserve space for:

- Representative information.
- Name and identification details.
- Assigned community.
- Account settings.
- Logout functionality.

Keep the design simple and consistent with the Actions tab.

---

3. Customer Experience – SIM Toolkit

We are changing the customer-facing approach.

Remove the previous USSD-based customer lookup experience.

Customers will instead interact with MoMoGuard through a SIM Toolkit menu.

This approach must support both feature phones and smartphones that have access to the SIM Toolkit.

The SIM Toolkit menu should contain exactly three options.

Option 1: Learn About Emerging Scams

Create a menu option for customer education and scam-awareness training.

IMPORTANT:

- Build the menu entry and reserve the necessary implementation space.
- Do not implement the actual training content yet.
- Do not invent lessons, scenarios, questions, or training workflows.
- The team will determine the educational content separately.

For now, create a clearly identifiable placeholder that can accommodate the future training functionality.

Option 2: Reverse Number Lookup

This option allows customers to check suspicious phone numbers.

Expected flow:

1. Customer opens the MoMoGuard SIM Toolkit.
2. Selects Reverse Number Lookup.
3. Enters the suspicious phone number.
4. The request is sent to the backend.
5. The backend communicates with the Rancard Glance API.
6. The customer receives an understandable result.

The implementation must account for the limitations of feature phones and SIM Toolkit interactions.

Keep the interface text short and simple.

Handle invalid numbers, unavailable results, API failures, and timeouts appropriately.

Do not expose Rancard API credentials on the client side.

Option 3: Report a Suspicious Number

Customers should be able to report suspicious numbers independently.

This is important because community representatives may not always be available.

The customer reporting experience should collect the essential information needed by the community intelligence system.

The reporting flow should be simpler than the representative's reporting interface.

Where possible, collect:

- Suspicious phone number.
- Nature of the suspected scam.
- Claimed identity of the person contacting the customer.
- Type of request made (PIN, verification code, money transfer, reversal, fees, etc.).
- Whether the customer actually lost money.

Do not make optional information unnecessarily mandatory.

Reports should feed into the same central community intelligence system used by representatives.

The system must distinguish between:

- Unverified reports.
- Corroborated reports.
- High-confidence warnings.
- Disputed reports.

A single report must not automatically result in a publicly confirmed scam classification.

---

4. Feature Phone Simulator Changes

The existing feature-phone simulator currently displays applications in a 3×3 grid.

Modify this interface.

Required changes

1. Remove one existing application from the 3×3 application grid.

2. Add a new application called MoMoGuard SIM Toolkit.

3. Make its icon and placement consistent with the existing feature-phone interface.

4. When opened, it should display the same three options defined in Section 3:
   
   - Learn About Emerging Scams
   - Reverse Number Lookup
   - Report a Suspicious Number

The simulator should demonstrate how a feature-phone customer would access MoMoGuard.

The SIM Toolkit simulator should reproduce the simplicity and interaction limitations of a real feature phone.

Do not simply display a smartphone-style interface inside the feature-phone simulator.

The three menu options should be navigable using the existing feature-phone interaction controls.

---

5. Remove the Old USSD Lookup System

The previous USSD-based reverse-number lookup functionality should be removed.

The SIM Toolkit will now handle customer reverse lookups.

Specifically:

- Remove the old customer USSD lookup menu.
- Remove obsolete USSD lookup screens.
- Remove obsolete lookup-specific USSD session handling.
- Remove related frontend components that are no longer needed.
- Remove unused backend endpoints and services if they exclusively support the old lookup workflow.

IMPORTANT:

Do not blindly delete the entire USSD infrastructure if other parts of the existing application still depend on it.

First identify dependencies and retain anything necessary for the new architecture or existing integrations.

---

6. Remove the Gemini SMS Agent Design

Remove the previous Gemini SMS Agent design and its associated implementation.

This concept is no longer part of the current product direction.

Remove:

- Gemini SMS Agent interface designs.
- Gemini SMS analysis workflows.
- Gemini-specific SMS processing services.
- Associated prompts and unused configuration.
- Documentation describing the Gemini SMS Agent as an active feature.

Do not replace it with another SMS AI agent.

The new product direction focuses on community reporting, reverse-number lookup, and customer education through the SIM Toolkit.

---

7. Retain and Modify the Call Console Simulator

The existing call console simulator should be retained.

It is still useful for demonstrating simulated incoming-call scenarios and how MoMoGuard can help identify suspicious interactions.

However, its functionality and presentation should be adjusted to fit the new product direction.

Keep:

- Incoming call simulation.
- Unknown-number call scenarios.
- Saved-contact call scenarios.
- Call-event generation.
- The ability to simulate different call situations.

Modify:

- Ensure the simulator supports the new community intelligence system.
- Allow simulated calls to be associated with numbers that have existing reports or warnings.
- Ensure call events can be used by the risk-assessment logic where applicable.
- Simplify the interface so it demonstrates the actual detection concept rather than an obsolete product workflow.

The call console is a demonstration and simulation environment.

Do not assume that MoMoGuard has access to real operator call-detail records or incoming-call interception capabilities.

Keep simulated call events clearly distinguishable from real events.

---

8. Retain the Real Money Movement System

Do not completely remove the existing real-money-movement simulation or sandbox infrastructure.

Retain it as supporting functionality for demonstrations and scenarios where transaction movement is relevant.

However:

- It should not be the central customer interaction.
- Do not build the new customer experience around transaction interception.
- Do not introduce automatic transaction blocking or interception.
- Do not imply that MoMoGuard has direct control over MTN Mobile Money transactions.
- Preserve existing useful mock or sandbox transaction functionality where it supports testing and demonstrations.

Review its existing dependencies before making changes.

---

9. Rancard Glance API Integration

Rancard Glance is the external API powering reverse-number lookups.

Both the Community Representative interface and the customer SIM Toolkit reverse-lookup option must use the same backend integration.

Architecture

Community Representative Interface ─┐

Customer SIM Toolkit ────────────────┼── MoMoGuard Backend ── Rancard Glance API

Requirements

1. Centralize the Rancard Glance integration in a reusable backend service.
2. Both customer and representative lookup requests should use this service.
3. Keep API keys and credentials on the backend.
4. Implement appropriate request validation.
5. Handle API errors and timeouts.
6. Normalize API responses into a consistent internal response format where appropriate.
7. Avoid duplicating API integration logic across different interfaces.
8. Log relevant lookup events without unnecessarily exposing sensitive user information.

IMPORTANT:
Inspect the existing Rancard Glance API implementation before modifying it.

Do not replace a working integration with an invented API implementation.

Do not guess endpoint names, request parameters, authentication methods, or response fields. Use the existing integration and official API documentation.

---

10. Twi Translation and Localization

Add Twi language support to the new system.

This should be treated as a localization feature across the customer-facing and representative-facing experiences.

Initial languages

- English
- Twi

English should remain available as the default language.

Requirements

1. Create a centralized translation structure.
2. Avoid hardcoding interface text throughout components.
3. Add Twi translations for relevant interface labels, instructions, validation messages, and feedback.
4. Ensure the feature-phone SIM Toolkit menus can display appropriate Twi text within their technical limitations.
5. Ensure important scam warnings and lookup results can be communicated clearly in Twi.
6. Keep the translation architecture extensible so additional Ghanaian languages can be added later.

Do not rely on unreviewed machine translations for security-critical warnings.

Twi translations should be reviewed for accuracy and natural local usage.

Do not translate phone numbers, API identifiers, or technical values.

---

11. General Architecture and Implementation Requirements

Before changing the codebase, inspect the current architecture.

Identify:

- Existing frontend framework and component structure.
- Existing backend architecture.
- Database schema.
- Rancard Glance API integration.
- Feature-phone simulator implementation.
- Call console simulator.
- Real-money-movement simulation.
- Existing reporting and community intelligence services.
- Existing authentication and representative profile functionality.

Reuse existing functionality

Do not rebuild working components unnecessarily.

If an existing component can be adapted to the new requirements, reuse it.

If an existing service is obsolete, remove it cleanly along with its unused dependencies.

Avoid maintaining two implementations of the same functionality.

Backend

The backend should remain the central point for:

- Number lookup.
- Community scam reporting.
- Scam fingerprint management.
- Community intelligence.
- Risk assessment.
- Representative information.
- Relevant simulator functionality.

Database

Review the existing database before making schema changes.

Preserve useful historical data and tables.

Only introduce migrations where necessary.

Do not drop existing tables or data simply because a feature's frontend is being removed.

UI/UX

The interfaces should be:

- Simple.
- Mobile-friendly.
- Accessible.
- Easy to understand.
- Consistent across the application.
- Suitable for users with limited digital literacy.

Avoid unnecessary dashboards, complicated menus, and excessive information.

---

12. Features to Remove, Retain, and Add

| Feature | Decision |
|---|---|
| Innovate Reps interface | Add/Implement |
| Representative scam reporting | Add/Implement |
| Representative reverse lookup | Add/Implement |
| Representative profile | Add/Implement |
| Rancard Glance integration | Retain and reuse |
| Customer USSD lookup | Remove |
| Customer SIM Toolkit | Add |
| SIM Toolkit scam education | Add placeholder only |
| SIM Toolkit reverse lookup | Add |
| SIM Toolkit scam reporting | Add |
| Feature-phone 3×3 grid | Modify |
| Gemini SMS Agent | Remove |
| Gemini SMS design document | Remove |
| Call console simulator | Retain and modify |
| Real-money movement simulation | Retain as supporting functionality |
| Transaction interception/blocking | Do not implement |
| Twi translation | Add |
| Community intelligence | Retain and integrate |

---

13. Suggested Implementation Order

Implement this in stages to avoid breaking existing functionality.

Phase 1: Codebase Audit and Cleanup

- Inspect the existing codebase.
- Identify obsolete Gemini SMS Agent functionality.
- Identify the old USSD lookup workflow.
- Map existing Rancard API integration and dependencies.
- Identify components that should be retained.
- Prepare a safe cleanup plan.

Phase 2: Community Representative Interface

- Implement the two bottom navigation tabs.
- Build the scam-reporting section.
- Build the reverse-number lookup section.
- Connect both workflows to the backend.
- Implement the profile section.

Phase 3: Customer SIM Toolkit

- Implement the three-option menu.
- Build the training placeholder.
- Connect reverse lookup to the shared backend.
- Implement independent scam reporting.

Phase 4: Feature Phone Simulator

- Modify the 3×3 grid.
- Add the MoMoGuard SIM Toolkit application.
- Implement the three menu options.
- Ensure navigation behaves like a feature phone.

Phase 5: Supporting Systems

- Modify the call console simulator.
- Preserve the useful real-money movement simulation.
- Integrate community intelligence across the relevant workflows.

Phase 6: Twi Localization

- Introduce centralized translation management.
- Add English and Twi interface support.
- Verify translations and layouts.

Phase 7: Integration and Testing

Test the complete workflows:

Representative workflow

1. Open Innovate Reps.
2. Navigate to Actions.
3. Report a suspicious number.
4. Scroll down.
5. Perform a reverse-number lookup.
6. Open Profile.

Customer workflow

1. Open the feature-phone simulator.
2. Select MoMoGuard SIM Toolkit.
3. Select Learn About Emerging Scams.
4. Return to the main menu.
5. Select Reverse Number Lookup.
6. Enter a phone number and retrieve results.
7. Return to the menu.
8. Select Report a Suspicious Number.
9. Submit a report.

Supporting workflow

1. Open the call console.
2. Simulate an incoming call.
3. Verify that relevant simulated call events can interact with the existing risk-assessment logic.
4. Verify that useful transaction simulation functionality still works independently.

---

14. Important Instructions to Cursor

This document represents the NEW product direction.

Do not interpret it as a request to rebuild the entire application from scratch.

First audit the existing codebase and determine what can be reused.

Prioritize a clean transition from the old design to the new design.

Do not:

- Reintroduce the Gemini SMS Agent.
- Reintroduce customer USSD number lookup.
- Invent Rancard API endpoints or response formats.
- Implement the actual scam-training content yet.
- Implement transaction interception or automatic blocking.
- Delete useful existing simulator functionality.
- Break working backend services unnecessarily.
- Destroy existing database records during cleanup.

When implementation is complete, provide:

1. A summary of the old features removed.
2. A summary of the existing features retained.
3. A summary of the new features implemented.
4. Any database migrations performed.
5. Any API integration changes.
6. Any unresolved dependencies or limitations.
7. A list of tests performed and their results.

Final objective: MoMoGuard should become a community-powered scam detection and awareness platform with a dedicated representative interface, a customer-facing SIM Toolkit experience, Rancard Glance-powered reverse lookups, independent scam reporting, accessible Twi support, and a retained call simulation environment.


---

# API Contract (implementation reference)

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
| `POST /report` | Report a number as *suspected*. Optional: `description`, `community`, `incident_time`, `claimed_identity`, `request_type`, `lost_money` (bool), `channel`. Returns `report_state` + `classification_note` (never proof). |
| `GET /community/intelligence?number=` | Community report confidence band for a number (`unverified`, `corroborated`, `high_confidence_warning`, `no_reports`). Never proof of a scam. Used by demo-control and reporting feedback. |
| `GET /rancard/reverse-lookup?number=` | Reverse number lookup via Rancard Glance. **Stub** — see `controller/plugs/rancard_glance_plug.py` and `docs/rancard-glance-integration.md`. Replaces the old `GET /check-number` (removed; `GlancePlug.check()` itself is unchanged and still feeds `/assess`'s internal risk scoring). |
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