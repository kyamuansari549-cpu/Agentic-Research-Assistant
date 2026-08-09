"""
FastAPI entrypoint.

Two endpoints:
  POST /api/research          -> kicks off a job, returns a job_id
  GET  /api/research/{id}/stream -> Server-Sent Events stream of live
                                     agent activity as the LangGraph
                                     graph executes, ending with the
                                     final report.

SSE (rather than plain request/response) is what lets the frontend
show the "agents thinking" timeline in real time instead of a single
spinner until everything is done.
"""
import asyncio
import json
import os
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from starlette.middleware.sessions import SessionMiddleware

from app.schemas import ResearchRequest, ResearchJobResponse
from app.graph import research_graph
from app.config import settings
from app import db
from app.auth import (
    router as auth_router,
    get_current_user,
    get_current_user_from_query_or_header,
)

db.init_db()

app = FastAPI(title="Agentic Research Assistant")

# Required by Authlib to store the OAuth `state` between the /auth/login
# redirect and Google calling back to /auth/callback.
app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret)

# ALLOWED_ORIGINS env var: comma-separated list, e.g.
# "http://localhost:5173,https://your-frontend.vercel.app"
# Falls back to localhost only, so local dev keeps working unset.
_default_origins = "http://localhost:5173"
allowed_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)

# In-memory job store -- fine for a portfolio/demo project.
# A production version would use Redis so jobs survive a server restart.
# (job_id -> {"query": str, "user_id": str})
_jobs: dict[str, dict] = {}

NODE_MESSAGES = {
    "planner": "Breaking your question into sub-tasks",
    "researcher": "Searching the web and summarizing findings",
    "coder": "Deciding whether a data analysis or chart is needed",
    "writer": "Drafting the report",
    "critic": "Reviewing the draft for gaps and unsupported claims",
    "finalize": "Finalizing the report",
}


@app.post("/api/research", response_model=ResearchJobResponse)
def start_research(req: ResearchRequest, user: dict = Depends(get_current_user)):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    job_id = uuid.uuid4().hex[:12]
    _jobs[job_id] = {"query": req.query, "user_id": user["id"]}
    return ResearchJobResponse(job_id=job_id)


@app.get("/api/research/{job_id}/stream")
async def stream_research(
    job_id: str, user: dict = Depends(get_current_user_from_query_or_header)
):
    job = _jobs.get(job_id)
    if not job or job["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Unknown job_id")

    query = job["query"]

    # Per-node ceiling: if any single node (an LLM call, a search, etc.)
    # stalls past this, we abort with a visible error instead of leaving
    # the SSE connection open with no events and no exception -- that
    # silent-hang state is what previously showed a clean terminal log
    # while the frontend sat on "Waiting for the agent team to finish...".
    NODE_TIMEOUT_SECONDS = 150

    async def event_generator():
        initial_state = {"job_id": job_id, "query": query}
        revision_seen = set()

        try:
            agen = research_graph.astream(initial_state).__aiter__()
            while True:
                try:
                    step = await asyncio.wait_for(
                        agen.__anext__(), timeout=NODE_TIMEOUT_SECONDS
                    )
                except StopAsyncIteration:
                    break
                for node_name, node_output in step.items():
                    message = NODE_MESSAGES.get(node_name, f"{node_name} finished")
                    payload = None

                    # Flag when the critic sends work back for revision
                    if node_name == "critic" and not node_output.get("approved"):
                        count = node_output.get("revision_count", 0)
                        if count not in revision_seen:
                            revision_seen.add(count)
                            message = (
                                f"Requested a revision (round {count}): "
                                f"{node_output.get('critic_feedback', '')}"
                            )

                    if node_name == "coder":
                        message = (
                            "Wrote and ran a Python analysis script"
                            if node_output.get("code_used")
                            else "Decided no data analysis was needed"
                        )
                        payload = {
                            "code_used": node_output.get("code_used", False),
                            "code_output": node_output.get("code_output"),
                            "chart_path": node_output.get("chart_path"),
                        }

                    yield {
                        "event": "agent_step",
                        "data": json.dumps(
                            {
                                "agent": node_name,
                                "status": "completed",
                                "message": message,
                                "payload": payload,
                            }
                        ),
                    }

                    if node_name == "finalize":
                        report_text = node_output.get("final_report", "")
                        db.save_report(
                            user_id=user["id"],
                            query=query,
                            report_markdown=report_text,
                            chart_path=node_output.get("chart_path"),
                        )
                        yield {
                            "event": "final_report",
                            "data": json.dumps({"report": report_text}),
                        }
        except asyncio.TimeoutError:
            yield {
                "event": "agent_step",
                "data": json.dumps(
                    {
                        "agent": "system",
                        "status": "error",
                        "message": (
                            f"A step took longer than {NODE_TIMEOUT_SECONDS}s "
                            "(likely a stalled LLM or search API call) and was "
                            "aborted."
                        ),
                    }
                ),
            }
        except Exception as exc:  # noqa: BLE001
            yield {
                "event": "agent_step",
                "data": json.dumps(
                    {"agent": "system", "status": "error", "message": str(exc)}
                ),
            }
        finally:
            _jobs.pop(job_id, None)

    return EventSourceResponse(event_generator())


@app.get("/api/reports")
def get_reports(user: dict = Depends(get_current_user)):
    return db.list_reports(user["id"])


@app.get("/api/reports/{report_id}")
def get_report(report_id: str, user: dict = Depends(get_current_user)):
    report = db.get_report(user["id"], report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@app.get("/api/health")
def health():
    return {"status": "ok"}
