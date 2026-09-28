"""
Pydantic request/response models for the API layer.
"""
from typing import Optional, List, Any
from pydantic import BaseModel


# ── Original research pipeline ────────────────────────────────────────────────

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


# ── Paraphrasing ──────────────────────────────────────────────────────────────

class ParaphraseRequest(BaseModel):
    text: str
    style: str = "academic"    # academic | casual | concise


class ParaphraseResponse(BaseModel):
    original: str
    paraphrased: str
    style: str


# ── Plagiarism check ──────────────────────────────────────────────────────────

class PlagiarismRequest(BaseModel):
    text: str


class SuspiciousSegment(BaseModel):
    segment: str
    reason: str


class PlagiarismResponse(BaseModel):
    originality_score: Optional[int]
    risk_level: str
    suspicious_segments: List[SuspiciousSegment]
    overall_summary: str
    disclaimer: str


# ── AI content detection ──────────────────────────────────────────────────────

class AIDetectRequest(BaseModel):
    text: str


class AISignal(BaseModel):
    signal: str
    example: str


class AIDetectResponse(BaseModel):
    ai_probability: Optional[int]
    verdict: str
    signals_found: List[AISignal]
    overall_summary: str
    disclaimer: str


# ── PDF upload / chat ─────────────────────────────────────────────────────────

class PDFUploadResponse(BaseModel):
    session_id: str
    filename: str
    page_count: int
    char_count: int
    preview: str               # first ~300 chars of extracted text


class PDFChatRequest(BaseModel):
    session_id: str
    question: str


class PDFChatResponse(BaseModel):
    session_id: str
    question: str
    answer: str


# ── Summarization ─────────────────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    text: str
    mode: str = "brief"        # brief | detailed


class SummarizeResponse(BaseModel):
    summary: str
    mode: str
    original_length: int       # character count of input
    summary_length: int        # character count of summary


# ── Research gap finder ───────────────────────────────────────────────────────

class ResearchGapRequest(BaseModel):
    text: str


class ResearchGap(BaseModel):
    title: str
    description: str
    type: str


class ResearchGapResponse(BaseModel):
    gaps: List[ResearchGap]
    limitations_noted_by_authors: str
    suggested_future_directions: List[str]
    overall_assessment: str
