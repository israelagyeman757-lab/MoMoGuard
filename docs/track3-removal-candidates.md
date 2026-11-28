# Removal candidates: USSD customer lookup + Gemini SMS Agent design doc

**Status: EXECUTED.** Both removals below (§1 and §2) were carried out directly as part of the
same change that built the Rancard Glance stub, the Innovate Reps console, and the SIM Toolkit —
see that change's commit/PR for the actual diff. This document is kept as the record of what was
removed and why (and the dependency audit behind it), not as a pending to-do. The git workflow in
§4 was written for a hypothetical Qoder-driven execution but was **not** the path actually used;
the real commit history is the source of truth for exactly what happened and when.

Original framing, unchanged below: an actionable removal plan, scoped strictly to what the PRD's
Section 5 and Section 6 actually call for removing. Nothing else in the repo was in scope here.

**Supersedes:** an earlier, broader draft of this document that treated *all* of Track 3
(Brain/pause-manager/fraud-scoring, the MTN sandbox bank plug, the MessageIntelligenceAgent, and
all of their tests) as removal candidates. That framing is **no longer current**. Per the PRD
relayed for this update, the money-movement/MTN sandbox simulation, the call console simulator,
and the community-reporting backbone (`GlancePlug`) are explicitly **retained and reused**, not
removal candidates. Only the two items below are in scope.

**Provenance note:** this plan is built from a condensed summary of the PRD's Section 5 ("remove")
and Section 6 ("retain/net-new") as relayed to the AI agent maintaining this doc, not from the
original PRD document's exact text (it was not attached). If the full PRD text becomes available,
re-verify this doc's scope against it before running anything below.

**Qoder has push access to this GitHub repo.** This doc gives copy-pasteable `git rm` / edit
instructions, and a commit+push sequence, so Qoder (or anyone with push access) can execute this
directly. **Nobody has run any of these commands yet** — this is a plan, not a completed action.

---

## 0. Explicitly OUT of scope — do not touch these

The PRD's Section 6 says retain/reuse these. Listed here so nobody conflates "customer lookup" or
"Track 3" with these and deletes something load-bearing by mistake:

| Keep untouched | Why |
|---|---|
| `controller/plugs/bank_plug.py`, `controller/plugs/mtn_momo_bank_plug.py`, `BANK_PLUG_MODE` | Real-money-movement / MTN sandbox simulation — PRD: retain as-is, not headline. |
| `controller/brain/`, `controller/pause_manager.py`, `controller/ussd.py`'s **payment/voice-check/confirm flows** | The payment-risk engine the sandbox plugs into. Not mentioned for removal anywhere in the PRD. |
| `controller/message_agent/` (TF-IDF + Logistic Regression SMS classifier, wired to `POST /check-sms`) | This is **not** the Gemini agent — it's a separate, already-implemented local classifier. The Gemini document (§2 below) is a *design note about a hypothetical alternative* to this; it never changed this code. Confirmed by direct grep: no file outside `docs/sms-ai-agent-design.md` mentions "Gemini". |
| `demo-control/` (call console simulator) | PRD: retained, but **modified** (not removed) to integrate with community reports/warnings — that integration work is separate future work, not part of this removal task. |
| `controller/plugs/glance_plug.py` (`GlancePlug`) | **Hard dependency of the payment Brain.** `controller/app.py`'s `build_context()` calls `glance.check(recipient)["reports"]` to compute the `reports` signal the Brain scores on. It is also used by `POST /report` / USSD menu item **2 Report a Scam** (`glance.report(...)`), which is a *reporting* flow, not a *lookup* flow, and is not targeted by this PRD. **Only the customer-facing "Check a Number" lookup surface that also calls `GlancePlug.check()` is being removed (§1 below) — the class itself, and its two call sites inside the payment flow and the report flow, must stay.** |
| `controller/community/` (Track 4 pivot: reports/numbers/warnings/training) and `community-console/` | Separate, newer PR (#5, branch `cursor/community-pivot-mvp-9df9`), not part of Track 3 and not mentioned for removal. |
| `tests/test_bank_plug.py`, `tests/test_mtn_momo_bank_plug.py`, `tests/test_brain.py`, `tests/test_pause_manager.py`, `tests/test_message_agent.py`, `tests/test_glance_plug.py` | Tests for everything above. Keep all of them. |

---

## 1. Remove: old USSD customer-lookup menu/screens/session handling

### 1.1 What "customer lookup" means here, precisely

This is **USSD main-menu item 4 ("Check a Number")** end-to-end: the menu entry, its USSD session
state, the `GET /check-number` REST endpoint behind it, and the feature-phone UI screens that call
it. It does **not** include menu item 2 ("Report a Scam") or menu item 3 ("Scam Alerts"), and it
does **not** include `GlancePlug` itself (see §0 above — `GlancePlug.check()` keeps running inside
the payment Brain's context-building; only its *customer-facing lookup menu* is removed).

### 1.2 Dependency audit (read before editing)

Confirmed by direct code read + repo-wide grep for `check-number`/`check_number`/`checkNumber`:

- **Backend:** `controller/app.py` exposes `GET /check-number`, backed by a `do_check_number()`
  helper that calls `glance.check(number)` directly and is wired into `UssdRouter` as its
  `check_number` constructor argument — this wiring exists *only* for this lookup feature.
  `glance.check()` the method is also called separately and independently inside `build_context()`
  for the payment Brain (`"reports": glance.check(recipient)["reports"]`) — **that call site is
  untouched by this removal.**
- **USSD state machine:** `controller/ussd.py` has one dedicated state (`"check_number"`) and one
  main-menu dispatch branch (key `"4"`) for this feature. No other state references it.
- **Feature-phone UI (mock mode):** `phone-page/phoneFlow.js`, `phone-page/app.js`,
  `phone-page/mockResponses.js`, `phone-page/i18n/en.json`, `phone-page/i18n/tw.json` each have a
  `checkNumber`/`numberResult` screen, label, or mock-response function used only by this feature.
- **Controller-mode adapter:** `phone-page/services/controllerAdapter.js` exports a `checkNumber()`
  wrapper around `fetch('/check-number?...')`, used only by this feature.
- **Tests:** `phone-page/tests/controllerAdapter.test.js` and `phone-page/tests/phoneFlow.test.js`
  each have tests exercising this feature; one `controllerAdapter.test.js` test uses `checkNumber()`
  only as a convenient example of generic HTTP-error handling, not to test lookup behavior itself —
  flagged below so it gets *adapted*, not deleted outright.
- **Docs/smoke:** `CONTRACT.md` documents the endpoint and USSD menu line;
  `reports-and-checker/smoke_all_endpoints.py` has one smoke-test block for it.
- **No Python test** (`tests/*.py`) touches `/check-number`, `UssdRouter`'s `check_number`
  parameter, or USSD key `"4"` — confirmed by grep. Nothing to change in `tests/`.

**This is a cross-cutting feature spread across ~9 files, not a directory you can `rm -rf`.** Most
of the work below is deleting specific blocks inside shared files, not deleting whole files. Only
one file (§2) is a clean whole-file removal.

### 1.3 Open decision for Qoder — USSD main-menu renumbering

Today's main menu is `1 Send Money  2 Report a Scam  3 Scam Alerts  4 Check a Number  5 Language`.
Removing item 4 leaves a choice this doc does **not** make for you, because the PRD defers the
replacement (the SIM Toolkit menu) to future work:

- **Option A (recommended for now):** leave the menu numbered `1,2,3,5` with a gap at 4 (or
  renumber 5→4 temporarily), and ship the SIM Toolkit's 3 options later as their own addition —
  cheapest, but the demo menu has an odd gap or a temporary renumber until that lands.
- **Option B:** replace item 4's label with a neutral "Coming soon" placeholder that goes nowhere,
  keeping the numbering stable for the whole menu until the SIM Toolkit replaces it for real.

Pick one before editing `MAIN_MENU` in `controller/ussd.py` and the matching menu list in
`phone-page/app.js`/`phone-page/i18n/*.json` — the snippets below assume **Option A** (menu
item 4 and its label simply removed, items 1/2/3/5 unchanged). Adjust if the team picks Option B.

### 1.4 Backend edits

**`controller/app.py`** — delete the `do_check_number` helper and the `/check-number` route, and
drop the now-unused `do_check_number` argument from the `UssdRouter(...)` call:

```python
# DELETE this function:
    async def do_check_number(number: str) -> dict:
        return glance.check(number)

# CHANGE this line:
    ussd = UssdRouter(do_assess, do_confirm, do_voice_result, do_report, do_check_number)
# TO:
    ussd = UssdRouter(do_assess, do_confirm, do_voice_result, do_report)

# DELETE this route:
    @app.get("/check-number")
    async def check_number(number: str):
        return await do_check_number(number)
```

Leave every other use of `glance` in `controller/app.py` untouched, in particular the
`"reports": glance.check(recipient)["reports"]` line inside `build_context()`.

**`controller/ussd.py`** — drop the `check_number` constructor parameter/attribute, the
`"check_number"` state branch, and the menu-4 dispatch (Option A: no replacement branch for key
`"4"`; it falls through to the default `MAIN_MENU` re-display, same as any other unrecognised key):

```python
# CHANGE the constructor:
    def __init__(self, assess, confirm, voice_result, report, check_number):
        self._assess = assess
        self._confirm = confirm
        self._voice_result = voice_result
        self._report = report
        self._check_number = check_number
        self.sessions: dict[str, dict] = {}
# TO:
    def __init__(self, assess, confirm, voice_result, report):
        self._assess = assess
        self._confirm = confirm
        self._voice_result = voice_result
        self._report = report
        self.sessions: dict[str, dict] = {}

# DELETE this branch inside handle():
        if state == "check_number":
            if re.fullmatch(r"\+?\d{7,15}", key):
                result = await self._check_number(key)
                session["state"] = "result"
                return self._screen(session_id, result["message"])
            return self._screen(session_id, "Invalid number. Enter the number:")

# DELETE this branch inside _main_menu():
        if key == "4":
            session["state"] = "check_number"
            return self._screen(session_id, "Check a number. Enter the number:")

# UPDATE MAIN_MENU (Option A — drop item 4, keep others as-is):
MAIN_MENU = ("Welcome to MoMoGuard\n1 Send Money\n2 Report a Scam\n"
             "3 Scam Alerts\n5 Language")
```

### 1.5 Feature-phone UI edits (mock mode + controller-mode adapter)

**`phone-page/services/controllerAdapter.js`** — delete the `checkNumber` export:

```js
// DELETE:
export function checkNumber(number) {
  return request(`/check-number?number=${encodeURIComponent(number)}`);
}
```

**`phone-page/mockResponses.js`** — delete the `getNumberPreview` function:

```js
// DELETE:
export function getNumberPreview(number) {
  if (number === "0240000009") {
    return {
      numberStatus: "reports",
      message: "3 reports found. This may be a warning sign, not proof it is unsafe.",
    };
  }
  if (number === "0240000004") {
    return {
      numberStatus: "unavailable",
      message: "Could not check this number. This is not proof it is safe or unsafe.",
    };
  }
  return {
    numberStatus: "unreported",
    message: "No reports found. This is not proof it is safe.",
  };
}
```

**`phone-page/phoneFlow.js`** — remove the `getNumberPreview` import, the `"checkNumber"` entry
screen, its `_submitEntry()` branch, the `"4": "checkNumber"` menu destination, the
`finishNumberCheck()` method, and the `numberStatus`/`checkingNumber` state fields:

```js
// CHANGE the import line:
import { getNumberPreview, getPaymentPreview, INITIAL_MESSAGES, makeTransactionMessage, makeControllerReceiptMessage } from "./mockResponses.js";
// TO:
import { getPaymentPreview, INITIAL_MESSAGES, makeTransactionMessage, makeControllerReceiptMessage } from "./mockResponses.js";

// CHANGE ENTRY_SCREENS:
const ENTRY_SCREENS = new Set(["ussd", "recipient", "amount", "reportNumber", "checkNumber", "server"]);
// TO:
const ENTRY_SCREENS = new Set(["ussd", "recipient", "amount", "reportNumber", "server"]);

// In reset()'s state object, DELETE: numberStatus: "",
// (leave checkingNumber out too if you remove the _submitEntry branch below)

// DELETE this branch inside _submitEntry():
    } else if (screen === "checkNumber") {
      this.state.checkingNumber = entry;
      this.state.entry = "";
      this.state.loadingKind = "number";
      this._replace("loading");

// CHANGE the "main" screen destinations map (Option A — drop "4"):
      const destinations = { "1": "recipient", "2": "reportNumber", "3": "alerts", "4": "checkNumber", "5": "language" };
// TO:
      const destinations = { "1": "recipient", "2": "reportNumber", "3": "alerts", "5": "language" };

// DELETE this method entirely:
  finishNumberCheck() {
    if (this.state.screen !== "loading" || !this.state.checkingNumber) return;
    const result = getNumberPreview(this.state.checkingNumber);
    this.state.numberStatus = result.numberStatus;
    this.state.message = result.message;
    this._replace("numberResult");
  }
```

**`phone-page/app.js`** — remove the `checkNumber` translation key, its line in the rendered main
menu, and the `checkNumber`/`numberResult` screen-render cases, and the `finishNumberCheck()` call
in the loading dispatcher:

```js
// DELETE from the translations default object:
  checkNumber: "Check a Number",

// DELETE this <li> from the rendered main menu (Option A — also renumber the remaining items'
// displayed digits if you want the on-screen text to match the new key dispatch, e.g. Language
// shown as "4" instead of "5" if you choose to renumber rather than leave a gap):
          <li><span class="menu-number">4</span>${escapeHtml(translations.checkNumber)}</li>

// DELETE these two screen cases:
    case "checkNumber":
      return entryScreen("Check a Number", "Phone number", "OK to check. 0240000009 has demo reports.");
    case "numberResult":
      return `<h2 class="screen-heading">${state.numberStatus === "reports" ? "Reports found" : state.numberStatus === "unavailable" ? "Could not check" : "No reports"}</h2>
        <p class="screen-copy">${escapeHtml(state.message)}</p><div class="screen-rule"></div>
        <p class="screen-small">Back: main menu</p><div class="screen-source">source: simulated</div>`;

// CHANGE the loading-kind dispatch:
    queueAdvance(() => {
      if (flow.state.loadingKind === "number") flow.finishNumberCheck();
      else flow.finishPayment();
    }, CONFIG.SIMULATED_DELAY_MS);
// TO:
    queueAdvance(() => flow.finishPayment(), CONFIG.SIMULATED_DELAY_MS);
```

**`phone-page/i18n/en.json`** and **`phone-page/i18n/tw.json`** — delete the `"checkNumber"` key
from both files.

### 1.6 Test edits

**`phone-page/tests/controllerAdapter.test.js`**:
- Test `"check-number uses a query parameter and never a body"` — **delete entirely** (tests
  behavior that no longer exists).
- Test `"an http error becomes ok false with the status, never data"` — **adapt, don't delete**:
  it only uses `adapter.checkNumber(...)` as a convenient example call to test generic HTTP-error
  handling. Swap it for another adapter function that still exists, e.g. `adapter.metrics()` or
  `adapter.ussd(...)`, so the generic error-handling coverage isn't lost.

**`phone-page/tests/phoneFlow.test.js`**:
- Test `"an unavailable number check never claims the number is safe"` (around line 128) —
  **delete entirely**.
- Test `"report, alerts, number check, and language screens are reachable"` (around line 103) —
  **edit, don't delete**: remove only the number-check portion (`flow.press("4"); enter(flow,
  "0240000009"); flow.finishNumberCheck(); assert.equal(flow.state.screen, "numberResult");
  assert.equal(flow.state.numberStatus, "reports");`), keep the report/alerts/language assertions,
  and rename the test to drop "number check" from its title.

### 1.7 Docs + smoke script edits

**`CONTRACT.md`** — once the backend edits above land, also:
- Delete the `GET /check-number?number=` row from the Endpoints table.
- Delete the `## GET /check-number?number=0240000009` section.
- Update the documented main menu line (`Main menu: ... 4 Check a Number ...`) to match whichever
  option was chosen in §1.3.

(This is a second, later edit to `CONTRACT.md` than the "Current product direction" section this
same prep task already added — do both in the same PR, see §4.)

**`reports-and-checker/smoke_all_endpoints.py`** — delete only this block (the rest of the smoke
script covers unrelated endpoints and must stay):

```python
# DELETE:
    r = c.get("/check-number", params={"number": "0240000009"}).json()
    check("check-number returns reputation", r["risk"] == "high"
          and r["source"] == "simulated")
```

---

## 2. Remove: Gemini SMS Agent design doc + associated code/config

### 2.1 Audit result

Confirmed by repo-wide case-insensitive grep for "gemini" across `.py`, `.md`, `.json`, `.js`, and
`.example` files: the **only** match anywhere in the repository is `docs/sms-ai-agent-design.md`
itself. The document's own header states: *"Status: Research/design document only. Nothing in this
document is implemented. No code in `controller/message_agent/` changes as a result of this note."*
There is no `GEMINI_API_KEY` or similar entry in `.env.example` (the doc's one code snippet uses
that name only as an illustrative placeholder inside a hypothetical example, not as a real config
entry anywhere in the repo), and no `README.md` or `CONTRACT.md` reference to this file to clean up
elsewhere. **This is a clean, single-file removal.**

### 2.2 Removal command

```bash
git rm docs/sms-ai-agent-design.md
```

No other file needs editing for this part.

---

## 3. Full `git rm` / edit checklist, in order

1. `git rm docs/sms-ai-agent-design.md` (§2 — whole file, no dependents).
2. Edit `controller/app.py` per §1.4.
3. Edit `controller/ussd.py` per §1.4.
4. Edit `phone-page/services/controllerAdapter.js` per §1.5.
5. Edit `phone-page/mockResponses.js` per §1.5.
6. Edit `phone-page/phoneFlow.js` per §1.5.
7. Edit `phone-page/app.js` per §1.5.
8. Edit `phone-page/i18n/en.json` and `phone-page/i18n/tw.json` per §1.5.
9. Edit `phone-page/tests/controllerAdapter.test.js` and `phone-page/tests/phoneFlow.test.js` per §1.6.
10. Edit `CONTRACT.md` per §1.7 (on top of the "Current product direction" section already added
    to this file in this same prep pass).
11. Edit `reports-and-checker/smoke_all_endpoints.py` per §1.7.
12. Run the test suites locally before committing — Python: `pytest`; phone-page JS:
    `node --test phone-page/tests/`; demo-control JS (unaffected, but cheap to confirm):
    `node --test demo-control/tests/`. All should stay green.

---

## 4. Git workflow — commit and push

**Assumption this doc makes explicitly, because this doc's author does not know Qoder's exact
workflow:** these commands assume Qoder is working on a **feature branch**, not pushing straight
to `main`. If Qoder's actual workflow is to push directly to `main`, drop the `checkout -b` step
and the `-u origin <branch-name>` becomes a plain `git push`. **Confirm which applies before
running the push** — the commands below default to the safer feature-branch path.

```bash
# 1. From the repo root, make sure you're starting from an up-to-date base:
git fetch origin main
git checkout main
git pull origin main

# 2. Create a feature branch for this removal (skip if Qoder already has one in progress
#    for this change — reuse that branch instead of creating a new one):
git checkout -b remove/ussd-lookup-and-gemini-doc

# 3. Make the edits in sections 1 and 2 above, then stage everything --
#    THIS INCLUDES the updated CONTRACT.md (both the "Current product direction" section
#    added in this prep pass AND the §1.7 endpoint-table/menu-line edit above) --
#    so the new contract goes live in the same commit as the code it describes:
git add -A

# 4. Review what's staged before committing -- confirm only the files listed in section 3
#    above (plus CONTRACT.md) are included, nothing from controller/brain/, pause_manager.py,
#    the bank plugs, message_agent/, demo-control/, glance_plug.py, or controller/community/:
git status

# 5. Commit:
git commit -m "Remove USSD customer-lookup surface and retire Gemini SMS agent design doc

- Remove GET /check-number, its USSD menu-4/check_number state, and the
  matching feature-phone UI/adapter/mock/i18n/test code. GlancePlug itself
  and its use inside the payment Brain's context-building, plus the
  separate /report + USSD menu-2 reporting flow, are untouched.
- Remove docs/sms-ai-agent-design.md (Gemini SMS agent design/research
  note). Confirmed no implementation code or config anywhere else in the
  repo referenced Gemini -- this was design-doc-only.
- Update CONTRACT.md to the current product direction (supersedes the
  Track 3 and Track 4-pivot framing) and to drop the removed endpoint and
  USSD menu line from the documented contract."

# 6. Push. If working on a feature branch (the default assumption above):
git push -u origin remove/ussd-lookup-and-gemini-doc
# then open a PR from that branch the normal way.

# If Qoder's workflow is confirmed to push straight to main instead:
# git push origin main
```

**Do not run any of this automatically.** This section exists so a human (or Qoder) can copy,
review, and run it deliberately -- the agent that wrote this document did not execute it.
