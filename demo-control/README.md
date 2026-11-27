# MoMoGuard — demo-control console

A separate, additive webpage for a demo operator to feed scenarios into the
live **feature-phone preview** (`../phone-page/`). It does not duplicate the
phone, does not call the controller directly, and does not change anything
about how the phone preview already works — it only gives an operator a
second screen to drive it from.

## Why a second page, not another button on the phone?

The brief asked for the ability to trigger scenarios "into the flow" the way
a real incoming SMS or call would, and to prove it with the controller's own
reaction rather than faking the phone's screen. Keeping it a separate page
means:

- The phone preview stays a dumb screen exactly as `CONTRACT.md` describes —
  it still only talks to the controller over `/ussd`, `/assess`, `/check-sms`,
  etc. This console never calls the controller itself.
- Nothing about the existing phone preview's behaviour, mock-mode fallback,
  or tests changes for someone who never opens this page.

## How the two pages talk to each other

Both pages are static, origin-scoped browser pages with no shared server
state. They talk over a same-origin `BroadcastChannel` named
`momoguard-demo` (see `demoBridge.js` here and
`../phone-page/services/demoBridge.js`). This is a **browser-tab bridge**,
not a network request — the controller never sees it, and nothing here
needs the controller's CORS allow-list touched.

Message shapes on the channel:

```js
// demo-control → phone-page
{ type: "incoming-sms", requestId, sender, text, trust }
{ type: "incoming-call", requestId, name, number, trust, note, amount }

// phone-page → demo-control
{ type: "ack", requestId, status: "delivered" | "ringing" | "busy" | "rejected", reason? }
```

- `incoming-sms` → the phone unshifts a new message into its own inbox
  (`PhoneFlow.receiveSimulatedSms`), exactly where a real text would land.
  Opening it on the phone runs the real `POST /check-sms` call the phone
  already makes for every message (unchanged code path).
- `incoming-call` → if the phone is idle, it shows a "simulated incoming
  call" screen with the caller's name/number/trust label
  (`PhoneFlow.receiveSimulatedCall`). Answering it (`PhoneFlow.answerSimulatedCall`)
  hands off to `phone-page/app.js`, which drives the **same** `/ussd` session
  a typed Send-Money flow would (`start → "1" → recipient → amount`), so the
  controller's real `/assess` call inside that session decides what happens.
  If the phone is busy (not idle) or running in mock mode, it acks `busy` /
  `rejected` instead, and this console reports that back to the operator.

Because both pages must share a browser origin for `BroadcastChannel` to
connect them, **serve the whole repo root as static files**, e.g.:

```bash
python3 -m http.server 5500
```

then open, in two tabs:

- `http://127.0.0.1:5500/demo-control/index.html`
- `http://127.0.0.1:5500/phone-page/index.html` (must be in **controller**
  mode — the default in `phone-page/config.js` — for the call scenario to
  do anything; the controller itself runs separately per the root `README.md`)

If you only open `demo-control/index.html` by itself (no phone tab), buttons
still "send", but the activity log will report "No response from the phone
preview" after a few seconds — nothing is silently faked.

## What each control does

### 1 — Compose a free-text SMS

Type any sender and any message, then **Send to phone**. The phone's inbox
gets a new message with that exact text; the controller only sees it (via
`/check-sms`) once the operator opens it on the phone, same as any other
message already in the inbox.

### 2 & 3 — Simulated contacts / trust model

`contacts.js` holds a small, explicitly-labelled **simulated** list — this
page's own data, not the controller's. Each entry says whether it is
`trusted` (saved contact, many prior calls/texts) or `suspicious` (never
saved, never contacted, a scam-shaped number), plus a ready-made message and
a suggested call amount:

| id | name | number | trust | why |
|---|---|---|---|---|
| `kofi` | Kofi | 0240000002 | trusted | saved; Aunty already sends him GH₵50–100 most weeks |
| `supplier` | New Supplier | 0240000006 | trusted | saved; paid Aunty this morning — a normal send-back |
| `stranger` | Unknown number | 0240000005 | suspicious | never saved; simulated recent SIM change + long unknown call |
| `reported` | Unknown number | 0240000009 | suspicious | never saved; several simulated reports against the number |

These numbers are **not invented here** — they line up with the demo
accounts already seeded in the controller's own simulated plugs
(`controller/plugs/bank_plug.py`, `data_plug.py`, `network_plug.py`,
`glance_plug.py`; see `../CONTRACT.md` → "Demo accounts"). Picking a trusted
vs. a suspicious contact therefore makes the controller's **own** existing
signal weighting (`controller/brain/scoring.py`) produce a different band —
this console adds no scoring of its own:

Verified against a fresh `/reset-demo` (run `curl -X POST .../assess` yourself
to double-check after changing `controller/brain/settings.json`):

- **Kofi → GH₵100**: `band: low`, `decision: allow` ("Sent GH₵100 to Kofi.") —
  clean pair history (`safe_history`) cancels out `new_recipient`.
- **New Supplier → GH₵100**: `band: low`, `decision: allow` — `new_recipient`
  alone isn't enough to leave "low" on its own.
- **Unknown number · 0240000005 → GH₵300**: `band: very_high`,
  `decision: block` ("stopped to protect you") — `new_recipient`,
  `unusual_amount`, `recipient_calls_many`, and `sim_recently_changed` all
  land together (two signal groups, so the two-groups cap doesn't apply).
  This does **not** depend on the canned call-time window below.
- **Unknown number · 0240000009 → GH₵50**: `band: caution`,
  `decision: caution` (sent, with a "new number, be sure you know who
  you're paying" note) — from `new_recipient` + the simulated report count.

Buttons per contact:

- **Use this message →** loads that contact's number and a suggested
  message into the composer above — still editable before sending. This is
  how scenarios 2/3's *SMS* side reuses scenario 1's composer rather than
  duplicating it.
- **Simulate incoming call** rings the open phone as that contact and, once
  answered, walks a real Send-Money session through the controller for the
  listed amount — this is the *call* side, and the one that shows differing
  caution levels.

### Known timing caveat (inherited, not introduced here)

The root `README.md`'s "Demo timing note" already documents that the
canned stranger call in `data_plug.py` is timestamped `2026-11-27T09:45:00`
and that call-based signals (`unknown_call_before`, `long_call_before`) are
only visible to `/assess` for 60 minutes after that moment, because USSD
sessions use the real current time. This console does not change or work
around that — it is a pre-existing property of the controller's simulated
call log, shared with the phone preview's own manual Send-Money demo. The
`0240000005` scenario above already reaches `block` from
`recipient_calls_many` + `sim_recently_changed` + the amount/recipient
signals alone, so it is **not** time-window-dependent; running it inside the
09:45–10:45 window only adds the two call signals on top (same band,
slightly higher score).

## Everything here is simulated

Every number, trust label, "times contacted", and message template in
`contacts.js` is this demo page's own made-up data — clearly not the
controller's data, never presented as real contacts, calls, or money. The
footer and panel copy repeat this on the page itself.
