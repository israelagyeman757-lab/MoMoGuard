# Walo — Hackathon Implementation Blueprint (from the user, condensed faithfully)
Community-powered mobile money fraud intelligence, education and early-warning service. Track 4 Community (supporting Track 1 Spot It Early). "Individual experiences become collective protection." It does NOT promise to block scams, intercept transactions or recover money.

## A. Community reporting
Report: suspicious number (optional), scam type (fake MTN rep, PIN/OTP request, fake payment confirmation, reversal scam, suspicious call/message, job offer, other), description, loss occurred (optional), date. Never collect PINs, OTPs or passwords. On submit: validate, store, status UNVERIFIED, visible to moderators, update stats. Never an automatic public accusation.

## B. Intelligence and verification
Statuses: UNVERIFIED, UNDER_REVIEW, CORROBORATED, DISPUTED, ARCHIVED. Rule-based pattern matching by number AND by scam tactic (category plus similar description), so different numbers can share one tactic. No AI claims. Moderators review before publishing; disputed reports produce no public accusation; warnings describe behaviour and never expose reporters.

## C. Number lookup and alerts
Validate format, search Walo's DB, return NO REPORTS FOUND / UNDER REVIEW / MULTIPLE REPORTS / WARNING AVAILABLE, each with safety advice. "No reports found does not mean safe." Warnings are shown in the USSD simulator and smartphone UI. No real SMS.

## D. Education and training
Categories: fake agents, PIN/OTP requests, fake payment confirmations, reversal scams, impersonation/social engineering, fake jobs/payment requests, suspicious calls/messages. Each exercise: scenario, question, options, safest answer, explanation, score. Example: caller claims to be MTN and asks for the PIN; A give PIN, B follow instructions, C end the call and contact MTN officially (correct). Rule-based adaptive recommendations by weak category.

## Assessments
Pre-test of 10 questions across categories; post-test with comparable but not identical questions. Record user, questions, answers, correct, score, date. Score = correct/total x 100. Improvement = post - pre (percentage points). Dashboard: average pre, average post, improvement, users who completed both, most-missed categories.

## Interfaces (one FastAPI backend)
1. Feature-phone USSD simulator. Main menu: 1 Check a suspicious number, 2 Learn about scams, 3 Report suspicious activity, 4 Latest scam warnings, 5 Exit. Supports back, invalid input and session end. Labelled simulated, not a live MTN connection.
2. Smartphone training UI: welcome, categories, scenarios, feedback, pre/post assessment, score, history, recommended lessons. Large text, simple, low digital literacy.
3. Community admin dashboard (moderators, auth plus roles): overview (totals, under review, corroborated, published warnings, top tactics, training stats); reports (view, search/filter, update status, similar reports); number intelligence (search, history, tactics, reputation); warnings (create from reviewed info, edit, publish, archive); training analytics.
Stack: React + Tailwind frontend suggested, FastAPI, SQLite (the existing Supabase option may stay as an optional backend), REST.

## DB tables
users(id, display_name, role, created_at); reports(id, reporter_id, phone_number, scam_type, description, loss_reported, status, created_at); numbers(id, phone_number, current_status, updated_at); warnings(id, title, description, scam_type, status draft/published/archived, created_at); training_scenarios(id, title, description, scam_category, explanation); training_questions(id, scenario_id, question, answer_options, correct_answer, explanation); quiz_attempts(id, user_id, assessment_type pre/post/practice, score, total_questions, completed_at); quiz_responses(id, attempt_id, question_id, selected_answer, is_correct); training_recommendations(id, user_id, category, reason). Reports stay separate from number reputation.

## Endpoints
POST /reports; GET /reports (mod); GET /reports/{id}; PATCH /reports/{id}/status (mod); GET /numbers/check/{phone_number}; GET /warnings; POST /warnings (mod); PATCH /warnings/{id} (mod); GET /training/scenarios; GET /training/scenarios/{id}; POST /training/attempts; GET /training/results/{user_id}; GET /training/recommendations/{user_id}. Moderator endpoints need authentication and authorization. Validate input and hide reporter identities.

## Demo story
1 user reports a fake-MTN-rep number asking for PIN; 2 it appears on the dashboard as UNVERIFIED; 3 a second independent similar report is flagged as a shared tactic; 4 the moderator updates statuses (no auto-guilt); 5 the moderator publishes a warning; 6 another user checks the number in USSD and sees the warning; 7 the user does an impersonation training exercise; 8 the score is recorded and progress updated.

## Build order
P1 core: FastAPI, SQLite, tables, reports submit/retrieve, moderator status, lookup, warnings. P2: dashboard, USSD simulator, loading/error/success states. P3: training, pre/post, scoring, history, recommendations. P4: integrate, fictional demo data, test, deploy (Vercel is already set up), rehearse. A working end-to-end demo beats extra features.

## Real vs proposed
Working: report submit/storage, moderation, lookup against our DB, warnings in the prototype, training, scoring, rule-based recommendations. NOT integrated: live MTN DB, real MTN USSD, SIM Toolkit (needs MTN partnership), real SMS. Clearly label simulated parts and never claim MTN access.

## Safeguards
No PINs/OTPs requested or stored; minimal data; restricted moderators; confidential reporters; no public accusation from unverified reports; a dispute process; a protected number DB; consent; a retention policy; no recovery promises. Community reps are educators and reporting facilitators, not investigators or financial agents.

## Metrics
Reports submitted/reviewed, corroborated patterns, review time, warnings published, lookups/warnings views; training completion, average pre/post, improvement, most-missed categories, repeat participation.
