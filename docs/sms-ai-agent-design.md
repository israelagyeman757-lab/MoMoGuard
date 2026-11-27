# SMS AI Agent (Gemini-based) — Design & Research Note

**Status:** Research/design document only. Nothing in this document is implemented. No code in `controller/message_agent/` changes as a result of this note.
**Relationship to the current build:** `POST /check-sms` today runs a TF‑IDF + Logistic Regression classifier (`controller/message_agent/agent.py`), per [CONTRACT.md](../CONTRACT.md) and the project's `[DECIDED]` choice of "a small classic model... **Not** an LLM" (handover §3.1 #15). This document explores what *would* change if that decision were revisited in favour of a Gemini/Gemma-based agent, for the hackathon pitch and/or a future build. It does not recommend making that change before the submission deadline.
**Not legal advice.** Section 5 is a factual research summary, not a legal opinion; a qualified Ghanaian lawyer should review before any production design decision.
**No API keys were obtained or used to produce this document.** All Gemini/Gemma claims below are sourced from public documentation only (cited inline); no live API call was made. Any code snippet's `GEMINI_API_KEY` is a placeholder for an environment variable the project owner supplies later (e.g. via `.env`, matching the existing `.env.example` convention) — not a key this agent signed up for, fetched, or holds.

---

## 0. One-paragraph answer

Yes — the Gemini API has first-class, documented function/tool calling: you declare a function schema, the model decides when to call it and with what arguments, your backend executes the real function, and you return the result for the model to use in its final answer. A `check_sender_id` function wired this way is a standard, supported pattern. The interesting design problem is not "can Gemini call our code" (it can) but (a) scoping the AI layer so it never touches ordinary personal chats, (b) architecting the sender-ID check as a real backend lookup the model *cannot* fabricate an answer to, and (c) the Ghanaian legal exposure of having anything — classic ML or LLM — read customers' message content, which exists **regardless of which model does the reading**.

---

## 1. Does the Gemini API support function/tool calling?

**Yes, confirmed against current docs** (checked Nov 2026):

- [Function calling with the Gemini API](https://aistudio.google.com/docs/function-calling) — Google AI Studio docs, current.
- [Using tools with Gemini API](https://aistudio.google.com/docs/tools)
- [`generateContent` API reference — `functionCallingConfig`](https://aistudio.google.com/api-reference/generate-content/generate-content)
- [Google Gen AI Python SDK (`google-genai`) docs — Function Calling](https://googleapis.github.io/python-genai/)

### 1.1 How it works (per the docs)

1. **Declare the function** to the model: name, natural-language description, and a JSON-schema-shaped `parameters` object. The description is what the model uses to decide *when* to call it — it matters as much as the schema.
2. **Send the declaration alongside the prompt** in the `tools` field of the `generateContent` request.
3. **The model never executes anything itself.** If it decides a call is warranted, the API response contains a `functionCall` part (`name` + `args` as a JSON object) instead of (or alongside) text. Execution is explicitly "your responsibility."
4. **Your backend executes the real function** against your real systems (database, cache, third-party API — whatever `check_sender_id` actually is) and packages the result as a `functionResponse`.
5. **You send the `functionResponse` back to the model** (same conversation `contents`), and the model produces a final, user-facing answer that incorporates the real result.
6. This can repeat over multiple turns, and the model supports **parallel** function calls (several tool calls in one turn) and **compositional** calls (call A, see the result, decide to call B).
7. `functionCallingConfig.mode` controls how strongly this is enforced: `AUTO` (model decides), `ANY` (model must call a function — optionally restricted to an `allowedFunctionNames` allow-list), `NONE` (tools are declared but disabled), and `VALIDATED` (schema-constrained decoding so the arguments are guaranteed valid against your schema).

The current Python SDK (`google-genai`, `pip install google-genai`) makes this concrete. A plain Python function with type hints and a docstring *is* the tool declaration — the SDK generates the JSON schema from it and, by default, will even execute it for you and loop the result back to the model automatically (`automatic_function_calling`, on by default for `client.chats.create`, can be disabled to handle the call/response cycle manually):

```python
from google import genai
from google.genai import types

def check_sender_id(claimed_institution: str, sender_id: str) -> dict:
    """Look up whether `sender_id` is the registered sender ID for `claimed_institution`.

    Args:
        claimed_institution: institution name the message claims to be from, e.g. "GCB Bank".
        sender_id: the alphanumeric sender ID the SMS actually arrived under, e.g. "GCB-Bank" or "MTN-MoMo".
    """
    return sender_id_registry.lookup(claimed_institution, sender_id)  # real backend call, not the model

client = genai.Client(api_key=GEMINI_API_KEY)
response = client.models.generate_content(
    model="gemini-3.8-flash",   # confirm exact current model id in AI Studio/Vertex at build time
    contents=f"Assess this SMS for fraud risk: {sms_text!r}",
    config=types.GenerateContentConfig(
        tools=[check_sender_id],
        system_instruction=MOMOGUARD_SMS_SYSTEM_PROMPT,
    ),
)
```

With automatic function calling left on, the SDK (a) sees the model emit a `functionCall` for `check_sender_id`, (b) calls your real Python function with the model-supplied arguments, (c) sends the real return value back as a `functionResponse`, and (d) returns you the model's final text/JSON. With it disabled (recommended for a production decision path — see §2.4), you get `response.function_calls` and drive the loop yourself so you can log, rate-limit, and veto each call before it runs.

### 1.2 Gemini vs. Gemma — an important distinction for "(or Gemma)"

The user's framing ("Gemini (or Gemma)") treats these as interchangeable; they are not, for this purpose:

- **Gemini** (`gemini-*` models) is a **hosted API**: Google's servers run the model and the orchestration described above. Tool calling is a first-party feature of that hosted `generateContent` endpoint.
- **Gemma** (`gemma-*`) is a family of **open-weight models** you host yourself (via `transformers`, Ollama, llama.cpp, Vertex AI Model Garden, etc.). Gemma 4 (current generation, per [Gemma 4 model card](https://gemma.ai/models/gemma-4/model-card.md) and [Function calling and tool use with Gemma 4](https://gemma.ai/get-started/capabilities/function-calling/)) does have **native function-calling support in its chat template** — but *you* own the inference server and the request/response loop that parses the generated tool call, executes it, and feeds the result back in. There is no Google-hosted "Gemma API" that does this orchestration for you the way `generateContent` does for Gemini.

For a hackathon timeline, **Gemini is the only realistic choice of the two** — it needs an API key and the SDK shown above, not a GPU host. Gemma only becomes attractive for the production/local-hosting future-work idea in §4, where self-hosting is the whole point.

### 1.3 How MoMoGuard's backend would wire this up

Mapped onto the existing codebase shape (`controller/message_agent/agent.py` behind `POST /check-sms`, per [CONTRACT.md](../CONTRACT.md)):

1. **Keep the module boundary.** `assess_message(msg) -> dict` stays the function `POST /check-sms` calls; only its internals would change. The response shape (`message_type`, `classification`, `risk_level`, `labels`, `evidence`, `recommended_action`, `explanation`, `checker_status`, `source`) is the team's shared contract and should not change just because the engine underneath did.
2. **Declare one or two narrow tools, not a general one:**
   - `check_sender_id(claimed_institution: str, sender_id: str) -> dict` — looks up a (simulated, for the hackathon) sender-ID registry and returns something like `{"registered_sender_id": "GCB-Bank", "matches_claim": false, "source": "simulated"}`. This is a deterministic lookup against **our own data**, not something the model is trusted to know or recall.
   - Optionally `check_ledger_for_claimed_deposit(sender, amount, window) -> dict` — the existing "fake-claim rule" (handover §3.1 #7), reframed as a tool call instead of inline Python, so the *same* model call that reads the message can also verify its claims.
3. **Fail-open wrapping stays mandatory.** Per the project's hard rule (`CONTRACT.md`, README "Hard rules"), any agent error/timeout must still produce `{"checker_status": "not_checked", "recommended_action": "allow"}`. A hosted third-party API adds a new failure mode (network timeout, rate limit, outage, quota) that the current pure-local classifier does not have, so this wrapping is *more* important, not less, with Gemini in the loop.
4. **Never let the model's own words decide institutional authenticity.** The model should *request* `check_sender_id`; the **boolean match/no-match result the function returns** — not the model's prose — is what should drive `institutional_authenticity` and `recommended_action`. Use `functionCallingConfig.mode = "ANY"` with an `allowedFunctionNames` restriction when the message looks institutional, so the model is forced to call the lookup rather than guess from training knowledge (Gemini has no real-time knowledge of MTN's actual sender-ID assignments — it would otherwise hallucinate plausible-sounding ones).
5. **Structured final output.** Have the model's final turn emit a JSON object matching the existing `/check-sms` response shape (Gemini supports constrained/structured JSON output), so the FastAPI layer can validate it against the same contract tests that exist today (`tests/test_message_agent.py`), instead of parsing free text.
6. **Latency/cost budget.** A model call plus one or two tool round-trips is roughly 1–3 seconds and a small per-message cost, versus near-zero for the local TF-IDF model. For a live demo this is probably fine; for production MTN-scale SMS volume, this is the main argument for the local-model future-work idea in §4.

---

## 2. Proposed architecture

```
 Incoming SMS (sender_id or number, text, ts)
        |
        v
 ┌───────────────────────────┐
 │   SMS Security Engine      │   deterministic pre-filter (regex/rules, no model call)
 │  (new, in front of the AI  │   - is this financially/institutionally relevant at all?
 │   layer; subsumes today's  │   - does the claimed sender look like an institution
 │   _FINANCIAL_HINT regex)   │     (bank/MTN/government name, or a known sender-ID format)?
 └──────────────┬─────────────┘
                │ only institutional / suspicious-looking messages pass through
                │ (ordinary personal SMS exits here -> delivered untouched, "not_financial")
                v
 ┌───────────────────────────┐
 │        AI layer            │   Gemini call with two concerns in one pass:
 │  (Gemini + tool calling)   │   1. CONTENT check: does the text read like a scam
 │                             │      (urgency, credential/PIN ask, advance-fee, fake
 │                             │      reversal — same label vocabulary as today)?
 │                             │   2. IDENTITY check: calls check_sender_id(claimed_
 │                             │      institution, sender_id) against the MTN-style
 │                             │      sender-ID registry — a real backend lookup, not
 │                             │      something the model is trusted to "know"
 └──────────────┬─────────────┘
                │ {content_risk, identity_match, labels, evidence, explanation}
                v
 ┌───────────────────────────┐
 │  Security Policy Engine    │   same role as today's SENTENCE/band mapping in
 │  (deliver / warn / block)  │   controller/app.py — combines content risk +
 │                             │   identity mismatch into one decision, per the
 │                             │   project's existing "warn-only, never silently
 │                             │   delete" rule for SMS (CONTRACT.md)
 └──────────────┬─────────────┘
                │
                v
        Recipient's inbox (message delivered, optionally tagged with a warning)
```

### 2.1 Why the sender-ID check is a separate step from content analysis

This is the core idea the user is asking about, and it is genuinely different from what `/check-sms` does today. Today's agent only has `evidence.institutional_authenticity` with values `unsupported_method` / `missing_marker` (per CONTRACT.md's value set) because there is **no way at all**, in the current build, to check a claimed institution against anything — it is a placeholder. The proposed architecture gives that placeholder a real backend behind it:

- **Content can look perfectly legitimate** — correct tone, no urgency, no PIN request, properly formatted amounts — and still be fraudulent, because the *sender* is wrong. Example: an SMS reads exactly like a real GCB Bank balance alert, with no classic scam language at all. The content classifier (today's LR model, or Gemini doing the same job) would score it as **low risk**.
- **The identity check is orthogonal.** MTN (or any carrier) assigns a specific registered alphanumeric sender ID to each institution that pays for one (e.g. `GCB-Bank` for GCB Bank's SMS channel). If this message's envelope sender ID is actually `GCBank-Alert`, `GCB_Bank2`, a generic shortcode, or a normal phone number — anything other than the ID MTN has on file for "GCB Bank" — that is a strong, independent fraud signal **the text of the message cannot fix**, because the scammer controls the text but (in a real MTN deployment) does not control what sender ID the network actually stamped on the message.
- **`check_sender_id` is the function call that makes this real.** The model extracts `claimed_institution = "GCB Bank"` from the text and reads the actual `sender_id` off the message envelope (not from the text — from the transport metadata, which a scammer cannot easily spoof on a real registered-sender-ID network), then calls `check_sender_id("GCB Bank", sender_id)`. The function does a deterministic lookup against the registry and returns a match/no-match fact. **This is exactly why the check must be a function call and not something the model answers from its own knowledge**: Gemini has no real visibility into MTN's actual sender-ID assignment table, and asking it to just "know" whether an ID is right would produce confident, plausible-sounding hallucinations instead of a verifiable fact.
- **Policy combination.** A message that is `content_risk: low` but `identity_match: false` should still be flagged — arguably at a *higher* severity than many content-only flags, because it means someone is successfully impersonating a specific real institution's channel, which is a more sophisticated and more dangerous pattern than a generic "you have won a prize" text. This maps cleanly onto the existing `institutional_authenticity` value set in CONTRACT.md: a *real* lookup would let the project finally use `recognised_sender_id` and `invalid_marker` instead of only ever returning `missing_marker` / `unsupported_method`.

### 2.2 Where this plugs into what already exists

Two things already in this project's materials make this less hypothetical than it might seem:

1. **The sandbox already has a message-interception hook.** Per the MTN sandbox integration notes (`sms.deliver` fires *before* a text reaches a subscriber and lets an API answer allow/warn/reject — same shape for `call.connect`), the organisers' sandbox already exposes close to this exact architecture: a layer sitting between sender and recipient that gets to inspect a message and return a decision before delivery. That is the realistic home for the "AI layer sits between SMS sender and recipient" framing in production — not a separate app intercepting carrier traffic from outside (which would be the legally fraught version; see §5).
2. **This isn't a new idea for the project — it's the "agent-in-the-middle" pitch idea, now with a concrete model.** The project's own handover notes an already-discussed, not-yet-built pitch concept: "a layer that sits between MTN and the recipient, checking message format plus a hidden backend tag issued per financial institution, blocking messages that lack the tag." The Gemini-based design in this document is the same shape — content check + per-institution identity tag/ID check — with Gemini's function calling as the mechanism for the identity half, and an explicit content-risk half added. It remains, like that earlier idea, **a pitch-level/future-work architecture**, not something to build into `/check-sms` for the hackathon submission.

### 2.3 Relationship to the current TF-IDF + Logistic Regression agent

| | Current (`/check-sms` today) | Proposed Gemini-based agent |
|---|---|---|
| Content classification | TF-IDF + LR, trained on labelled SMS | Gemini, zero/few-shot, same label vocabulary as prompt/instructions |
| Institutional ID check | Not implemented (`unsupported_method`) | Real via `check_sender_id` function call |
| Determinism / testability | Fully deterministic, easy to unit test (`tests/test_message_agent.py`) | Non-deterministic generation; needs structured-output + schema validation + eval set, not just unit tests |
| Latency | Sub-millisecond, local | ~1–3s typical per message (network + tool round trip) |
| Cost | Free after training | Per-call API cost; scales with SMS volume |
| Explainability | Transparent regex + weights | Depends on the model's own `explanation` field; harder to audit *why* |
| Failure mode | Only "model file missing" (already handled, fails open) | Adds network/API outage, rate limit, quota, and prompt-injection-via-SMS-text as new failure modes — all must still fail open per the project's hard rule |
| Data leaving the device/server | None — stays local | Message **text** leaves to Google's API (see §5) |

This is not a strict upgrade — it trades a small, fast, fully-local, fully-auditable classifier for a more capable but slower, costlier, less deterministic, and (critically, see §5) data-leaving-the-building one. The sender-ID check is the one genuinely new capability; it does not require an LLM at all (it could be added as a plain function call from the *existing* classifier pipeline too) — Gemini's value-add here is mainly in understanding varied, unseen phrasing and in giving a single natural-language `explanation` field "for free."

### 2.4 Suggested guardrails if this is ever built

- Treat the model's `functionCall` request for `check_sender_id` as **untrusted input to validate**, not as a trusted action — confirm `claimed_institution` and `sender_id` are both non-empty strings extracted plausibly from the message before running the real lookup, and rate-limit/cap tool calls per message.
- Disable `automatic_function_calling` in production code (see §1.1) so every tool call and its result is logged to the existing `/audit` log before being trusted — the project's existing "never silently act" ethos.
- Run `functionCallingConfig.mode = "VALIDATED"` or `"ANY"` with `allowedFunctionNames` restricted, so the model cannot answer with free-text "yes it's registered" instead of calling the function.
- The policy engine, not the model, should own the final `recommended_action` mapping (`allow`/`warn`, matching the existing no-`hold`-for-SMS rule) — treat the model's output as one more signal into the existing Security Policy Engine, the same way today's classifier's `is_scam`/`prob` are signals into `_assess()`, not a replacement for it.

---

## 3. Hard constraint: institutional/suspicious SMS only — never personal chats

**This is a hard constraint, not a tuning preference.** The AI layer (whichever model implements it) must never inspect, score, or act on ordinary personal/friend-to-friend messages, with exactly one carve-out: **a personal-looking message that is itself trying to run a scam** (e.g. a compromised friend's number sending "send me GH₵200 now, I'm stranded").

Why this matters, concretely:

- **Minimality/purpose limitation**, already a live concern for this project (see §5) — reading friends' and family's ordinary conversations has no fraud-prevention purpose, is the single biggest privacy and trust risk in this whole idea, and is explicitly out of scope.
- **It is also already the project's existing design.** Today's `_assess()` already short-circuits to `not_financial` / `allow` when `_FINANCIAL_HINT` finds no financial/institutional language at all (`controller/message_agent/agent.py`). The proposed **SMS Security Engine pre-filter** in §2 is this same idea made explicit and load-bearing: it is the component responsible for deciding *whether the AI layer is invoked at all*, and it must be conservative about expanding scope, not the AI layer's own judgement.

**Proposed scoping test**, to be run by the SMS Security Engine *before* any Gemini call — a message proceeds to the AI layer only if it matches at least one of:

1. It names or claims to come from an institution, brand, or role of authority (bank name, "MTN", "government", "agent", a sender ID that is not a plain phone number, etc.) — the existing `_CLAIMS_OFFICIAL` logic and `sender_type` detection already approximate this.
2. It contains clear financial-transaction language (amounts, "sent"/"deposit"/"reversed"/"balance", OTP/PIN mentions) **and** looks like it's soliciting an action (send money back, share a code, click a link, pay a fee) — the existing `_FINANCIAL_HINT` + action-request regexes already approximate this.
3. It is a personal-looking message that nonetheless trips strong scam heuristics (urgency + money request + "I'm stranded"/emergency framing, or a request for PIN/OTP from any sender) — the one explicit carve-out, matching the project's own worked example ("a compromised friend's number").

A message that is just "see you at 6" or "happy birthday" never reaches the AI layer at all under this design — it is filtered out deterministically, before any model call, cost, or data exposure occurs. This should be written as an explicit, testable rule (and a corresponding test case) if this is ever built, not left to the model's discretion.

---

## 4. Future work (not to build now): MTN-trained, MTN-hosted local LLM

Flagged as a **future-work callout only**, consistent with the project's existing "Proposed for MTN" labelling convention (handover §0):

The long-term, production-scale version of this idea is not "MoMoGuard calls Google's Gemini API forever." It is: **MTN trains and hosts its own local LLM** (plausibly starting from an open-weight base like Gemma, given Gemma 4's native function-calling and its suitability for on-prem/edge deployment per Google's own positioning, e.g. [Gemma 4 model card](https://gemma.ai/models/gemma-4/model-card.md)) on a large, continuously-updated corpus of **real, labelled legitimate-vs-fraudulent Ghanaian MoMo/SMS traffic** that only MTN has access to. This would:

- Remove the dependency on a third-party US-headquartered API for reading customers' message content (directly addressing the biggest legal/sovereignty concern in §5).
- Let the model be fine-tuned on real local fraud patterns (Twi-English code-switching, Ghana-specific scam scripts, real sender-ID data) instead of generic prompting.
- Let the sender-ID "function call" become an actual internal database lookup inside MTN's own systems, with no external network hop at all.
- Fit MTN's own existing data-residency and regulatory obligations instead of creating new ones.

This is explicitly **not something to build for the hackathon or pitch as built** — it requires MTN's infrastructure, training data, and buy-in, matching the project's existing rule that anything requiring MTN's internals is "Proposed for MTN," never claimed as implemented.

---

## 5. Legal risk research: Ghana's Data Protection Act, 2012 (Act 843) and overlapping telecom law

**Method note:** this section cites the Data Protection Commission's published PDF of [Act 843](https://dpc.gov.gh/wp-content/uploads/2025/05/Data-Protection-Act-2012-Act-843.pdf), the [Electronic Communications Act, 2008 (Act 775)](https://nca.org.gh/wp-content/uploads/2020/09/Schedule-of-Penalties-Amendment-Gazette-Notice-May-2016.pdf) penalty schedule (which quotes Act 775's operative sections), a DLA Piper comparative-law summary ([Data Protection Laws of the World — Ghana](https://www.dlapiperdataprotection.com/guide.pdf?c=GH)), and the Data Protection Commission's own site ([dpc.gov.gh](https://dpc.gov.gh/for-individuals/)). This is **research, not legal advice** — the handover document already flags that "legal points... were only summarised, not legally reviewed" (§17), and that remains true here. A qualified Ghanaian lawyer should review before any real deployment.

### 5.1 The core tension, stated plainly

**Reading the content of someone's SMS to decide whether to warn or block it is "processing personal data" under Act 843, and for institutional-fraud messages it may also be "intercepting" a communication under Act 775 — regardless of whether the reader is a TF-IDF model, a rules engine, or Gemini.** The model choice (classic ML vs. LLM) does not change this; it is a pre-existing exposure the project already has with the current `/check-sms` classifier, and it is **larger**, not smaller, once message text starts leaving the server to a third-party cloud API. This section gives the specific statutory hooks.

### 5.2 Data Protection Act, 2012 (Act 843) — real, specific exposure points

1. **Consent is the default rule, with narrow exceptions (s.20).** "A person shall not process personal data without the prior consent of the data subject" unless the processing is necessary for a contract the data subject is party to, authorised/required by law, protects the data subject's own legitimate interest, is necessary for a statutory duty, or pursues "the legitimate interest of the data controller or a third party." A fraud-detection scan plausibly fits the "legitimate interest" exception — but the Act gives the data subject an explicit, enforceable **right to object** (s.20(2)): "a data subject may object to the processing of personal data," and if they do, "the person who processes the personal data shall stop" (s.20(3)). **Risk:** unless anti-fraud SMS scanning is itself backed by a specific legal mandate (an NCA directive, a Bank of Ghana rule, or similar), a customer who formally objects to having their messages read by either the current classifier or a Gemini-based one would have a textual basis to demand it stop for their account. This has not been tested and there is no cited case law on it for this specific scenario.
2. **Minimality (s.19).** "Personal data may only be processed if the purpose... is necessary, relevant and not excessive." This is the direct statutory backing for the hard scope constraint in §3 — scanning ordinary personal chats would be hard to defend as "necessary" for fraud prevention and is a real excess-processing risk on its own, independent of which model does the reading.
3. **Registration requirement (ss.27, 46–56).** "A data controller who intends to process personal data shall register with the Commission" and "a data controller who has not been registered... shall not process personal data" (s.53); failing to register is itself an offence (s.56). **For a live MTN-scale deployment, whoever is the data controller for this SMS-scanning function — MoMoGuard's operator, or MTN itself if it absorbs this — would need to be a registered data controller with Ghana's Data Protection Commission before processing real customers' messages.** The hackathon prototype, running only on the organisers' synthetic sandbox data, is not processing real personal data and so does not trigger this; a production rollout would.
4. **Sending message text to Google's Gemini API is a cross-border processor relationship Act 843 explicitly regulates (ss.29–30).** A "data processor" is "any person other than an employee of the data controller who processes the data on behalf of the data controller" (s.3, definitions) — Google, running the Gemini inference that reads the SMS text, squarely fits this. The Act requires:
   - The processor to "process the data only with the prior knowledge or authorisation of the data controller" and treat it "as confidential" (s.29(1)).
   - A **written contract** between controller and processor requiring the processor to maintain confidentiality and security measures (s.30(2)–(3)) — i.e., simply calling a public API with a click-through terms-of-service is not obviously sufficient; a specific data-processing agreement would likely be expected.
   - **"Where a data processor is not domiciled in this country, the data controller shall ensure that the data processor complies with the relevant laws of this country" (s.30(4)).** This is the single most on-point clause for "we're sending Ghanaian customers' SMS text to a US company's API": it puts the compliance burden explicitly on whoever operates MoMoGuard/this feature, not on Google.
   - Separately, Act 843 asserts its own jurisdiction over such processing regardless of where it physically happens: the Act applies wherever "processing is in respect of information which originates partly or wholly from this country" (s.45(1)(c)) — so routing the data through a foreign server does not place it outside Act 843's reach, it just adds the s.30(4) foreign-processor obligation on top.
5. **The "domestic purposes" exemption (s.67) likely does not help here.** Act 843 exempts personal data processed "only for that individual's personal, family or household affairs" — but that exemption is normally read as covering an *individual's own* processing of their own contacts/correspondence (e.g., a phone's own address book), not a *third-party company's* commercial processing of other people's messages for a fraud-detection product. This project should not rely on it.
6. **Security and confidentiality duties (ss.28–31)**, including a breach-notification duty to both the Commission and the affected data subject where personal data "has been accessed or acquired by an unauthorised person" (s.31) — relevant if message content or a sender-ID lookup pipeline is ever breached.
7. **Penalties are real, not nominal.** Per DLA Piper's summary of the Act: unlawful disclosure/sale of personal data carries fines up to 2,500 penalty units and/or up to 5 years' imprisonment; failure to comply with a Commission enforcement notice is itself a separate offence (fine and/or up to 1 year). (1 penalty unit ≈ GHS 12 as of recent gazette notices — DLA Piper's guide.)

### 5.3 Overlap with the National Communications Authority / telecom regulation

Ghana's telecom-sector law is the **Electronic Communications Act, 2008 (Act 775)**, which the NCA enforces, and it independently criminalises most of what an SMS-interception feature literally does, with narrow carve-outs:

1. **Interception without authorisation is a criminal offence.** Per Act 775's operative provisions (confirmed via the NCA's own penalty-schedule gazette, which quotes "Section 73(1)" of Act 775): a person who "intercepts or procures another person to intercept, **without the authorisation of the provider or user, or a court order**... unlawful access to communication transmitted over electronic communications network" commits an offence — on summary conviction, a fine of up to 5,000 penalty units or up to 10 years' imprisonment (the NCA's 2016 penalty gazette cites the lower bound for Act 775 interception offences at up to 3,000 penalty units / 5 years for the related obstruction/interception offences; figures should be re-confirmed against the latest consolidated Act text before relying on them). A separate offence attaches to a non-sender/non-recipient who "interferes with, alters or modifies, diverts, unlawfully discloses or decodes" a transmitted message.
2. **The narrow exception that matters for this design:** a network operator/service provider **may** intercept communication transmitted over *its own* network if the interception is needed to, among other things, "protect users" or "protect other network operators or service providers from the fraudulent use of their networks or services," or if done under a court order or presidential executive instrument. **This is precisely why the production architecture in §2.2 — the check running as an MTN-operated hook (like the sandbox's `sms.deliver` gate) rather than a separate app passively intercepting carrier SMS from outside — is the legally defensible shape.** A third party (not the network operator, not acting with the provider's or the specific user's authorisation) inspecting SMS content in transit is squarely the conduct Act 775 criminalises; **MTN doing it to its own network, framed as user/fraud protection, is the carve-out the Act anticipates.**
3. **"Authorisation of... the user" is a second, separate possible legal basis** — if the *recipient* affirmatively opts into "MoMoGuard scans incoming institutional SMS for fraud" as a feature of their line, that is arguably the user's own authorisation for messages addressed to them. It does less to cover the **sender's** side of the content (the bank/institution whose message is being scanned), though institutions typically already consent to monitoring as a condition of being issued a registered sender ID in the first place — which is itself a point in favour of only acting on registered-institutional traffic (§3) rather than open-ended personal content.
4. **The NCA also separately regulates the sender-ID registry itself.** A real "MTN-style sender-ID registry" of the kind this design assumes already exists as a telecom administrative function (carriers assign and gatekeep alphanumeric sender IDs for a fee/registration process) — this project's pitch does not need to invent that registry, only propose consuming it via a function call; but operating or materially altering such a registry is itself inside NCA's regulatory remit, separate from the Data Protection Commission's.
5. **There is recent, real-world friction in Ghana over exactly this kind of executive-ordered mass interception/metadata collection** (the 2020 "Establishment of Emergency Communications System Instrument" under Act 775 s.100, later challenged in court, and a High Court ruling cited by the Media Foundation for West Africa ordering a halt to a related personal-data-collection exercise) — concrete evidence that this is a live, contested area of Ghanaian law and not a theoretical risk.

### 5.4 Factual risk summary (flagging real concerns, not reassurance)

| Concern | Applies to current classifier too? | Changes with Gemini? |
|---|---|---|
| Reading SMS content without a clear lawful basis / against objection (Act 843 s.20) | **Yes, already** | No change in kind; same exposure |
| Minimality / scope creep into personal chats (Act 843 s.19) | **Yes, already** | No change in kind; §3's hard constraint matters either way |
| Data-controller registration for real production data (Act 843 ss.27/53/56) | **Yes, already**, once real customer data is used | No change in kind |
| Cross-border processor obligations — written contract, foreign-processor compliance with Ghanaian law (Act 843 ss.29–30) | **No** — today's model is fully local, nothing leaves the server | **Yes — new, Gemini-specific exposure.** Message text now leaves to a US company's API; this is the clearest *new* legal surface area Gemini adds |
| Unlawful-interception exposure under Act 775 unless the check runs as an MTN/network-operator function (or with clear sender+recipient-side authorisation) | **Yes, already**, architecturally | No change in kind, but production framing (§2.2, run it as the network operator's own gate) matters regardless of model |
| Penalties if gotten wrong | Real: up to 5 years / 2,500 penalty units (Act 843 disclosure offences); up to 10 years / 5,000 penalty units (Act 775 interception offences, pending re-confirmation of current figures) | Same statutes apply; a Gemini-based design does not reduce penalty exposure and arguably widens it (adds the foreign-processor failure mode) |

**Bottom line:** the hackathon prototype itself is low-risk because it only touches the organisers' synthetic sandbox data, not real subscribers' real messages — nothing here changes that. But as a **production pitch**, "an AI agent reads customers' SMS content" needs, at minimum: (a) a clear lawful basis under Act 843 s.20 (most plausibly framed as MTN's own legitimate interest in fraud prevention, ideally backed by sector regulation rather than resting on s.20(1)(e) alone), (b) the check running as the network operator's own function per Act 775's narrow interception exception rather than as an outside app, (c) Data Protection Commission registration as a data controller, and (d) if any external AI API is used, a written cross-border processing agreement satisfying Act 843 s.30. Item (d) specifically is why the "future work" MTN-hosted local model in §4 is not just a nice-to-have efficiency idea — it removes the one legal exposure (§5.2 point 4) that is genuinely new to the Gemini approach and absent from the current local classifier.

---

## 6. Recommendations

1. **Do not change `/check-sms` for this hackathon submission.** The current TF-IDF + LR agent is faster, free, fully local (no new legal surface), and already matches the project's `[DECIDED]` choice.
2. **Pitch the architecture in §2 as the production vision**, explicitly labelled "Proposed for MTN" like the project's other pitch-only ideas, with the sender-ID function-call mechanism as the concrete, demo-able technical detail that makes "Gemini can call our code" tangible to judges.
3. **If a live Gemini demo is wanted for the pitch** (separate from the submitted `/check-sms` behaviour), build it as an isolated proof-of-concept against synthetic/sandbox data only, with a mocked `check_sender_id` function, and state plainly in the pitch that production use would need the legal groundwork in §5 — judges reward honest "Demonstrated / Simulated / Proposed" labelling per the project's own convention.
4. **Carry the §3 scoping rule into any future `/check-sms` redesign**, model choice aside — it is the single biggest lever on both user trust and legal exposure.
5. **Get a real legal review of §5 before any production commitment** — this document is a starting map of the statutes involved, not a cleared-for-production legal sign-off.
