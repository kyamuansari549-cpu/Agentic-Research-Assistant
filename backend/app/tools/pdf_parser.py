"""
PDF parsing tool — extracts text from an uploaded PDF file and stores
it in a simple in-memory session store keyed by a session ID.
The /api/pdf-chat endpoint then uses the stored text as context for
follow-up questions.
"""
import io
import time
import uuid
from PyPDF2 import PdfReader

# In-memory store: {session_id: {"filename": str, "text": str,
#                                "user_id": str, "created_at": float}}
# Good enough for a demo; swap for Redis/DB in production.
_pdf_sessions: dict[str, dict] = {}

# Sessions expire after 2 hours and the store is capped at 50 entries --
# without this, uploaded PDF text (up to 20 MB each) accumulated in RAM
# forever and could OOM the server on the small Render free tier.
PDF_SESSION_TTL_SECONDS = 2 * 3600
PDF_SESSION_MAX_ENTRIES = 50


def _evict_expired() -> None:
    """Drop sessions older than the TTL. Called on every store/lookup."""
    now = time.time()
    expired = [
        sid for sid, s in _pdf_sessions.items()
        if now - s.get("created_at", 0) > PDF_SESSION_TTL_SECONDS
    ]
    for sid in expired:
        _pdf_sessions.pop(sid, None)


def parse_pdf(file_bytes: bytes, filename: str) -> str:
    """
    Extract all text from a PDF given its raw bytes.
    Returns the extracted plain text.
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(f"--- Page {i + 1} ---\n{text.strip()}")
    if not pages:
        raise ValueError(
            "No readable text could be extracted from this PDF. "
            "It may be a scanned image-only document."
        )
    return "\n\n".join(pages)


def store_pdf_session(filename: str, text: str, user_id: str) -> str:
    """
    Store extracted PDF text under a new session ID and return it.
    The session is owned by *user_id* (pdf-chat verifies ownership),
    expires after PDF_SESSION_TTL_SECONDS, and the store is capped so
    memory can't grow without bound.
    """
    _evict_expired()
    if len(_pdf_sessions) >= PDF_SESSION_MAX_ENTRIES:
        oldest = min(_pdf_sessions, key=lambda k: _pdf_sessions[k]["created_at"])
        _pdf_sessions.pop(oldest, None)
    session_id = uuid.uuid4().hex[:16]
    _pdf_sessions[session_id] = {
        "filename": filename,
        "text": text,
        "user_id": user_id,
        "created_at": time.time(),
    }
    return session_id


def get_pdf_session(session_id: str, user_id: str | None = None) -> dict | None:
    """
    Retrieve a stored PDF session by ID.
    Returns None if not found, expired, or (when *user_id* is given)
    owned by a different user.
    """
    _evict_expired()
    session = _pdf_sessions.get(session_id)
    if not session:
        return None
    if user_id is not None and session.get("user_id") != user_id:
        return None
    return session


def delete_pdf_session(session_id: str) -> None:
    """Remove a session once the user is done."""
    _pdf_sessions.pop(session_id, None)
