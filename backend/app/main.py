"""
FastAPI entrypoint.

Core endpoints:
  POST /api/research                  -> kicks off a research job, returns job_id
  GET  /api/research/{id}/stream      -> SSE stream of live agent activity

New tools endpoints:
  POST /api/paraphrase                -> rewrite text in academic/casual/concise style
  POST /api/plagiarism-check          -> AI-heuristic plagiarism analysis
  POST /api/ai-detect                 -> AI-content probability scoring
  POST /api/pdf-upload                -> upload a PDF, returns session_id + preview
  POST /api/pdf-chat                  -> ask a question about an uploaded PDF
  POST /api/summarize                 -> summarize text (brief or detailed)
  POST /api/research-gaps             -> identify research gaps in a paper/text
"""
import asyncio
import json
import os
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from starlette.middleware.sessions import SessionMiddleware

from app.schemas import (
    ResearchRequest, ResearchJobResponse,
    ParaphraseRequest, ParaphraseResponse,
    PlagiarismRequest, PlagiarismResponse,
    AIDetectRequest, AIDetectResponse,
    PDFUploadResponse, PDFChatRequest, PDFChatResponse,
    SummarizeRequest, SummarizeResponse,
    ResearchGapRequest, ResearchGapResponse,
    ResearchGap, SuspiciousSegment, AISignal,
)
from app.graph import research_graph
from app.config import settings
from app import db
from app.auth import (
    router as auth_router,
    get_current_user,
    get_current_user_from_query_or_header,
)
from app.tools.paraphraser import paraphrase
from app.tools.plagiarism_checker import check_plagiarism
from app.tools.ai_detector import detect_ai_content
from app.tools.pdf_parser import parse_pdf, store_pdf_session, get_pdf_session
from app.tools.gap_finder import find_research_gaps, chat_with_pdf
from app.tools.summarizer import summarize

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
    for o in settings.allowed_origins.split(",")
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


@app.delete("/api/reports/{report_id}")
def delete_report(report_id: str, user: dict = Depends(get_current_user)):
    deleted = db.delete_report(user["id"], report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"deleted": True}


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# Paraphrasing
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/paraphrase", response_model=ParaphraseResponse)
def paraphrase_text(req: ParaphraseRequest, user: dict = Depends(get_current_user)):
    """Rewrite text in the requested style (academic | casual | concise)."""
    valid_styles = {"academic", "casual", "concise"}
    style = req.style.lower() if req.style else "academic"
    if style not in valid_styles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid style '{style}'. Choose from: {', '.join(valid_styles)}",
        )
    try:
        result = paraphrase(req.text, style)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return ParaphraseResponse(original=req.text, paraphrased=result, style=style)


# ─────────────────────────────────────────────────────────────────────────────
# Plagiarism check
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/plagiarism-check", response_model=PlagiarismResponse)
def plagiarism_check(req: PlagiarismRequest, user: dict = Depends(get_current_user)):
    """Heuristic plagiarism analysis using the LLM."""
    try:
        result = check_plagiarism(req.text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    segments = [
        SuspiciousSegment(
            segment=s.get("segment", ""),
            reason=s.get("reason", ""),
        )
        for s in result.get("suspicious_segments", [])
        if isinstance(s, dict)
    ]

    return PlagiarismResponse(
        originality_score=result.get("originality_score"),
        risk_level=result.get("risk_level", "Unknown"),
        suspicious_segments=segments,
        overall_summary=result.get("overall_summary", ""),
        disclaimer=result.get("disclaimer", ""),
    )


# ─────────────────────────────────────────────────────────────────────────────
# AI content detection
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/ai-detect", response_model=AIDetectResponse)
def ai_detect(req: AIDetectRequest, user: dict = Depends(get_current_user)):
    """Score how likely the text was AI-generated."""
    try:
        result = detect_ai_content(req.text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    signals = [
        AISignal(
            signal=s.get("signal", ""),
            example=s.get("example", "N/A"),
        )
        for s in result.get("signals_found", [])
        if isinstance(s, dict)
    ]

    return AIDetectResponse(
        ai_probability=result.get("ai_probability"),
        verdict=result.get("verdict", "Unknown"),
        signals_found=signals,
        overall_summary=result.get("overall_summary", ""),
        disclaimer=result.get("disclaimer", ""),
    )


# ─────────────────────────────────────────────────────────────────────────────
# PDF upload + chat
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/pdf-upload", response_model=PDFUploadResponse)
async def pdf_upload(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Upload a PDF, extract its text, and return a session_id for follow-up
    chat questions.  The file must be a valid PDF (content-type check is
    advisory; text extraction failure is the real guard).
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:  # 20 MB hard cap
        raise HTTPException(status_code=413, detail="PDF must be smaller than 20 MB.")

    try:
        text = parse_pdf(contents, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse PDF: {e}")

    # Count pages from "--- Page N ---" markers inserted by the parser
    page_count = text.count("--- Page ")
    session_id = store_pdf_session(file.filename, text)
    preview = text[:300].replace("\n", " ").strip()

    return PDFUploadResponse(
        session_id=session_id,
        filename=file.filename,
        page_count=page_count,
        char_count=len(text),
        preview=preview,
    )


@app.post("/api/pdf-chat", response_model=PDFChatResponse)
def pdf_chat(req: PDFChatRequest, user: dict = Depends(get_current_user)):
    """Ask a question about a previously uploaded PDF."""
    session = get_pdf_session(req.session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="PDF session not found. Please re-upload the file.",
        )
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        answer = chat_with_pdf(session["text"], req.question)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return PDFChatResponse(
        session_id=req.session_id,
        question=req.question,
        answer=answer,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Summarization
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/summarize", response_model=SummarizeResponse)
def summarize_text(req: SummarizeRequest, user: dict = Depends(get_current_user)):
    """Summarize text in brief (3-5 sentences) or detailed (structured) mode."""
    mode = req.mode.lower() if req.mode else "brief"
    if mode not in {"brief", "detailed"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid mode. Choose 'brief' or 'detailed'.",
        )
    try:
        result = summarize(req.text, mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return SummarizeResponse(
        summary=result,
        mode=mode,
        original_length=len(req.text),
        summary_length=len(result),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Research gap finder
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/research-gaps", response_model=ResearchGapResponse)
def research_gaps(req: ResearchGapRequest, user: dict = Depends(get_current_user)):
    """Identify research gaps, limitations, and future directions in a paper."""
    try:
        result = find_research_gaps(req.text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    gaps = [
        ResearchGap(
            title=g.get("title", ""),
            description=g.get("description", ""),
            type=g.get("type", ""),
        )
        for g in result.get("gaps", [])
        if isinstance(g, dict)
    ]

    return ResearchGapResponse(
        gaps=gaps,
        limitations_noted_by_authors=result.get("limitations_noted_by_authors", ""),
        suggested_future_directions=result.get("suggested_future_directions", []),
        overall_assessment=result.get("overall_assessment", ""),
    )
