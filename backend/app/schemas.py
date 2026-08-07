"""
Pydantic request/response models for the API layer.
"""
from typing import Optional
from pydantic import BaseModel


class ResearchRequest(BaseModel):
    query: str


class ResearchJobResponse(BaseModel):
    job_id: str


class AgentEvent(BaseModel):
    """
    A single event emitted while the agent graph runs.
    Streamed to the frontend over Server-Sent Events (SSE) so the
    UI can render a live "agents at work" timeline.
    """
    job_id: str
    agent: str                 # planner | researcher | coder | critic | writer | system
    status: str                # started | completed | error
    message: str
    payload: Optional[dict] = None
