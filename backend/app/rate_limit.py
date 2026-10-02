"""In-memory sliding-window rate limiter (no new dependencies).

Protects expensive endpoints (LLM calls, web searches, PDF parsing) from
accidental or deliberate abuse. Keyed per user so one heavy user can't
starve others.

NOTE: state lives in process memory. On a multi-worker deployment (e.g.
gunicorn with >1 worker) each worker tracks separately -- use Redis for
exact global limits in that case. Render runs a single uvicorn worker,
so this is exact there.
"""
from __future__ import annotations

import time
from collections import deque
from threading import Lock

from fastapi import HTTPException

_windows: dict[str, deque[float]] = {}
_lock = Lock()
_LAST_CLEANUP = [0.0]
_CLEANUP_INTERVAL = 300.0  # seconds


def _cleanup(now: float) -> None:
    """Drop expired windows so the dict can't grow without bound."""
    if now - _LAST_CLEANUP[0] < _CLEANUP_INTERVAL:
        return
    _LAST_CLEANUP[0] = now
    for key in list(_windows.keys()):
        dq = _windows[key]
        while dq and dq[0] <= now - 3600:
            dq.popleft()
        if not dq:
            del _windows[key]


def check_rate_limit(key: str, max_requests: int, window_seconds: int = 60) -> None:
    """Raise HTTP 429 if `key` exceeded `max_requests` in the last window."""
    now = time.monotonic()
    with _lock:
        _cleanup(now)
        dq = _windows.setdefault(key, deque())
        cutoff = now - window_seconds
        while dq and dq[0] <= cutoff:
            dq.popleft()
        if len(dq) >= max_requests:
            raise HTTPException(
                status_code=429,
                detail="Too many requests -- please slow down and try again shortly.",
            )
        dq.append(now)


def limit_user(user_id: str, scope: str, max_requests: int, window_seconds: int = 60) -> None:
    """Per-user rate limit for one endpoint scope."""
    check_rate_limit(f"{scope}:{user_id}", max_requests, window_seconds)
