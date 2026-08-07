"""
FastAPI entrypoint.

Two endpoints:
  POST /api/research             -> kicks off a job, returns a job_id
  GET  /api/research/{id}/stream -> Server-Sent Events stream of live
                                    agent activity as the LangGraph
                                    graph executes, ending with the
                                    final report.
"""

import asyncio
import json
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse

from app.schemas import ResearchRequest, ResearchJobResponse
from app.graph import research_graph
from app.tools.code_executor import CHARTS_DIR

app = FastAPI(title="Agentic Research Assistant")

# ===========================
# CORS CONFIGURATION
# ===========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://agentic-research-assistant-five.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
_jobs: dict[str, str] = {}

NODE_MESSAGES = {
    "planner": "Breaking your question into sub-tasks",
    "researcher": "Searching the web and summarizing findings",
    "coder": "Deciding whether a data analysis or chart is needed",
    "writer": "Drafting the report",
    "critic": "Reviewing the draft for gaps and unsupported claims",
    "finalize": "Finalizing the report",
}


@app.post("/api/research", response_model=ResearchJobResponse)
def start_research(req: ResearchRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    job_id = uuid.uuid4().hex[:12]
    _jobs[job_id] = req.query
    return ResearchJobResponse(job_id=job_id)


@app.get("/api/research/{job_id}/stream")
async def stream_research(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Unknown job_id")

    query = _jobs[job_id]
    NODE_TIMEOUT_SECONDS = 90

    async def event_generator():
        initial_state = {
            "job_id": job_id,
            "query": query,
        }

        revision_seen = set()

        try:
            agen = research_graph.astream(initial_state).__aiter__()

            while True:
                try:
                    step = await asyncio.wait_for(
                        agen.__anext__(),
                        timeout=NODE_TIMEOUT_SECONDS,
                    )
                except StopAsyncIteration:
                    break

                for node_name, node_output in step.items():

                    message = NODE_MESSAGES.get(
                        node_name,
                        f"{node_name} finished",
                    )

                    payload = None

                    if (
                        node_name == "critic"
                        and not node_output.get("approved")
                    ):
                        count = node_output.get("revision_count", 0)

                        if count not in revision_seen:
                            revision_seen.add(count)
                            message = (
                                f"Requested a revision (round {count}): "
                                f"{node_output.get('critic_feedback', '')}"
                            )

                    if node_name == "coder":
                        if node_output.get("code_used"):
                            message = "Wrote and ran a Python analysis script"
                        else:
                            message = "Decided no data analysis was needed"

                        payload = {
                            "code_used": node_output.get(
                                "code_used",
                                False,
                            ),
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
                        yield {
                            "event": "final_report",
                            "data": json.dumps(
                                {
                                    "report": node_output.get(
                                        "final_report",
                                        "",
                                    )
                                }
                            ),
                        }

        except asyncio.TimeoutError:
            yield {
                "event": "agent_step",
                "data": json.dumps(
                    {
                        "agent": "system",
                        "status": "error",
                        "message": (
                            f"A step took longer than "
                            f"{NODE_TIMEOUT_SECONDS}s "
                            "and was aborted."
                        ),
                    }
                ),
            }

        except Exception as exc:
            yield {
                "event": "agent_step",
                "data": json.dumps(
                    {
                        "agent": "system",
                        "status": "error",
                        "message": str(exc),
                    }
                ),
            }

        finally:
            _jobs.pop(job_id, None)

    return EventSourceResponse(event_generator())


@app.get("/api/charts/{filename}")
def get_chart(filename: str):
    path = CHARTS_DIR / filename

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Chart not found",
        )

    return FileResponse(path)


@app.get("/api/health")
def health():
    return {"status": "ok"}