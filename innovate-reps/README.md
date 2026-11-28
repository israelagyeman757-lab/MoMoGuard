# MoMoGuard — Innovate Reps smartphone

Community representatives get a **smartphone simulator** (not a plain webpage): rounded device chrome, status bar, home wallpaper, and a dock with exactly three apps — **Phone**, **Messages**, and **Innovate Reps**.

## Innovate Reps app

Same behaviour as before: **Actions** (report a scam + Glance reverse lookup) and **Profile** (placeholder). Report and lookup still hit `POST /report` and `GET /rancard/reverse-lookup` on the controller — no credentials in the browser.

## Phone app

Keypad dialer, recents list, and simulated **incoming calls** from `demo-control/` wired through the existing `POST /ussd` → `/assess` flow (controller mode).

## Messages app

SMS inbox and thread view for **simulated incoming SMS only** — no AI scanning, no `/check-sms`.

## Running it

```bash
python -m uvicorn controller.app:app --port 8000
python3 -m http.server 5500   # from repo root
```

Open `http://127.0.0.1:5500/innovate-reps/index.html` and, in another tab, `demo-control/index.html` to inject SMS/calls via the shared `momoguard-demo` BroadcastChannel.

Customer feature-phone preview: `phone-page/index.html` (separate UI; footer links here).

## Tests

```bash
cd innovate-reps && npm test
```

Covers `reportForm.js`, `lookupDisplay.js`, and smartphone shell/navigation (`smartphoneNav.test.js`).

## i18n

Reuses `phone-page/i18n/` for Twi/English strings where the Phone app needs them.