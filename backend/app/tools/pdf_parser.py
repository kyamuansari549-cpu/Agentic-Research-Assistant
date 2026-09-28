"""
PDF parsing tool — extracts text from an uploaded PDF file and stores
it in a simple in-memory session store keyed by a session ID.
The /api/pdf-chat endpoint then uses the stored text as context for
follow-up questions.
"""
import io
import uuid
from PyPDF2 import PdfReader

# In-memory store: {session_id: {"filename": str, "text": str}}
# Good enough for a demo; swap for Redis/DB in production.
_pdf_sessions: dict[str, dict] = {}


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


def store_pdf_session(filename: str, text: str) -> str:
    """
    Store extracted PDF text under a new session ID and return it.
    """
    session_id = uuid.uuid4().hex[:16]
    _pdf_sessions[session_id] = {"filename": filename, "text": text}
    return session_id


def get_pdf_session(session_id: str) -> dict | None:
    """
    Retrieve a stored PDF session by ID.
    Returns None if not found.
    """
    return _pdf_sessions.get(session_id)


def delete_pdf_session(session_id: str) -> None:
    """Remove a session once the user is done."""
    _pdf_sessions.pop(session_id, None)
