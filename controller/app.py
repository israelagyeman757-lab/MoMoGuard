"""MoMoGuard Community API — FastAPI backend for hackathon blueprint."""

from __future__ import annotations

import os
import uuid

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from controller.auth import require_moderator
from controller.momoguard_store import validate_phone, normalize_phone
from controller.patterns import find_similar_reports, lookup_result
from controller.seed import ensure_demo_seed, seed_demo
from controller.store_factory import create_store
from controller.ussd import CommunityUssdRouter


def create_app(store=None, *, seed: bool = True) -> FastAPI:
    app = FastAPI(title="Walɔ Community", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    db = store or create_store()
    if seed:
        if db.backend == "sqlite":
            seed_demo(db)
        else:
            ensure_demo_seed(db)

    async def lookup_number(phone: str) -> dict:
        n = normalize_phone(phone)
        reports = db.reports_for_number(n)
        warnings = db.list_warnings(status="published")
        return {**lookup_result(n, reports, warnings), "phone_number": n, "source": "walo_db"}

    async def submit_report(payload: dict) -> dict:
        try:
            report = db.insert_report(payload)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {**report, "reporter_hidden": True}

    async def list_warnings() -> list:
        return db.list_warnings()

    ussd = CommunityUssdRouter(lookup_number, submit_report, list_warnings)
    app.state.db = db
    app.state.ussd = ussd
    stk_outbox: list[dict] = []
    stk_seen: dict[str, set[str]] = {}

    def _mod_auth(authorization: str | None, allow_viewer: bool = False):
        try:
            return require_moderator(authorization, allow_viewer=allow_viewer)
        except PermissionError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    @app.get("/health")
    async def health():
        return {"status": "ok", "backend": db.backend, "simulated_ussd": True}

    @app.post("/reports")
    async def post_report(body: dict):
        for field in ("reporter_id", "scam_type"):
            if field not in body:
                raise HTTPException(status_code=422, detail=f"missing {field}")
        phone = body.get("phone_number", "")
        if phone and not validate_phone(phone):
            raise HTTPException(status_code=422, detail="invalid phone_number format")
        report = db.insert_report(body)
        return {**report, "reporter_id": "[hidden]"}

    @app.get("/reports")
    async def get_reports(
        authorization: str | None = Header(default=None),
        status: str | None = None,
        phone_number: str | None = None,
        scam_type: str | None = None,
    ):
        _mod_auth(authorization, allow_viewer=True)
        items = db.list_reports(status=status, phone_number=phone_number, scam_type=scam_type)
        for r in items:
            r["reporter_id"] = "[hidden]"
        return {"reports": items}

    @app.get("/reports/{report_id}")
    async def get_report(report_id: int, authorization: str | None = Header(default=None)):
        _mod_auth(authorization, allow_viewer=True)
        report = db.get_report(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="not found")
        all_reports = db.list_reports()
        similar = find_similar_reports(report, all_reports)
        report = {**report, "reporter_id": "[hidden]", "similar_reports": similar}
        return report

    @app.patch("/reports/{report_id}/status")
    async def patch_report_status(
        report_id: int,
        body: dict,
        authorization: str | None = Header(default=None),
    ):
        _mod_auth(authorization)
        status = body.get("status")
        if not status:
            raise HTTPException(status_code=422, detail="missing status")
        try:
            report = db.update_report_status(report_id, status)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if not report:
            raise HTTPException(status_code=404, detail="not found")
        return report

    @app.get("/numbers/check/{phone_number}")
    async def check_number(phone_number: str):
        if not validate_phone(phone_number):
            raise HTTPException(status_code=422, detail="invalid phone_number")
        n = normalize_phone(phone_number)
        reports = db.reports_for_number(n)
        warnings = db.list_warnings(status="published")
        number_row = db.get_number(n)
        return {
            **lookup_result(n, reports, warnings),
            "phone_number": n,
            "number_status": (number_row or {}).get("current_status", "unknown"),
            "source": "walo_db",
            "disclaimer": "No reports found does not mean safe.",
        }

    @app.get("/warnings")
    async def get_warnings(status: str | None = "published"):
        if status in (None, "", "all"):
            items = db.list_warnings()
        else:
            items = db.list_warnings(status=status)
        return {"warnings": items, "source": "walo_db"}

    @app.post("/warnings")
    async def post_warning(body: dict, authorization: str | None = Header(default=None)):
        _mod_auth(authorization)
        if "title" not in body:
            raise HTTPException(status_code=422, detail="missing title")
        return db.insert_warning(body)

    @app.patch("/warnings/{warning_id}")
    async def patch_warning(
        warning_id: int,
        body: dict,
        authorization: str | None = Header(default=None),
    ):
        _mod_auth(authorization)
        try:
            warning = db.update_warning(warning_id, body)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if not warning:
            raise HTTPException(status_code=404, detail="not found")
        return warning

    @app.get("/training/scenarios")
    async def training_scenarios():
        return {"scenarios": db.list_scenarios()}

    @app.get("/training/scenarios/{scenario_id}")
    async def training_scenario(scenario_id: int):
        scenario = db.get_scenario(scenario_id)
        if not scenario:
            raise HTTPException(status_code=404, detail="not found")
        return scenario

    @app.get("/training/questions")
    async def training_questions(assessment_type: str | None = None):
        tag = assessment_type or "practice"
        return {"questions": db.list_questions(assessment_tag=tag)}

    @app.post("/training/attempts")
    async def training_attempt(body: dict):
        user_id = body.get("user_id")
        assessment_type = body.get("assessment_type", "practice")
        answers = body.get("answers", [])
        if not user_id or not answers:
            raise HTTPException(status_code=422, detail="missing user_id or answers")
        db.upsert_user(user_id, body.get("display_name", user_id), "user")
        responses = []
        for a in answers:
            q = db.get_question(int(a["question_id"]))
            if not q:
                continue
            selected = a.get("selected_answer", "")
            responses.append(
                {
                    "question_id": q["id"],
                    "selected_answer": selected,
                    "is_correct": selected == q["correct_answer"],
                }
            )
        result = db.save_quiz_attempt(user_id, assessment_type, responses)
        return result

    @app.get("/training/results/{user_id}")
    async def training_results(user_id: str):
        history = db.quiz_history(user_id)
        return {"user_id": user_id, "history": history, "stats": db.training_stats()}

    @app.get("/training/recommendations/{user_id}")
    async def training_recommendations(user_id: str):
        return {"user_id": user_id, "recommendations": db.get_recommendations(user_id)}

    @app.get("/moderator/overview")
    async def moderator_overview(authorization: str | None = Header(default=None)):
        _mod_auth(authorization, allow_viewer=True)
        return db.overview_stats()

    @app.post("/auth/demo-login")
    async def demo_login(body: dict):
        role = body.get("role", "moderator")
        token = os.environ.get("MODERATOR_DEMO_TOKEN", "demo-mod-token") if role == "moderator" else os.environ.get("VIEWER_DEMO_TOKEN", "demo-view-token")
        return {
            "token": token,
            "role": role,
            "message": "Demo token only — not for production.",
        }

    @app.post("/ussd")
    async def ussd_endpoint(body: dict):
        session_id = body.get("session_id")
        sender = body.get("sender", "ussd-user")
        if not session_id:
            raise HTTPException(status_code=422, detail="missing session_id")
        return await ussd.handle(session_id, body.get("key", ""), sender)

    @app.post("/reset-demo")
    async def reset_demo():
        db.reset()
        seed_demo(db)
        ussd.reset()
        stk_outbox.clear()
        stk_seen.clear()
        return {"status": "ok", "message": "Demo data reloaded."}

    @app.get("/stk/push")
    async def stk_poll(consumer: str = Query(default="phone-user-1")):
        for message in stk_outbox:
            delivered = stk_seen.setdefault(message["id"], set())
            if consumer in delivered:
                continue
            delivered.add(consumer)
            return {**message, "pending": True}
        return {"pending": False}

    @app.post("/stk/push")
    async def stk_enqueue(body: dict):
        message = {
            "id": uuid.uuid4().hex[:12],
            "text": body.get("text", "Walɔ alert"),
            "more": bool(body.get("more")),
            "report": bool(body.get("report")),
        }
        stk_outbox.append(message)
        return message

    return app


_auto_seed = os.environ.get("MOMOGUARD_AUTO_SEED", "1") != "0"
app = create_app(seed=_auto_seed)