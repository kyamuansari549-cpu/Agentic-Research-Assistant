"""Per-user rate limiting via the token-bucket algorithm (stdlib only).

Replaced the earlier sliding-window limiter with the token bucket from the
standalone token-bucket-rate-limiter project, keeping the same public API
(``check_rate_limit`` / ``limit_user``) so callers did not change:

- Every key (``scope:user_id``) owns a bucket that starts full.
- Bucket capacity = the endpoint's ``max_requests``; tokens refill
  continuously at ``max_requests / window_seconds`` per second, so the
  long-run rate matches the old per-window limits exactly, while short
  bursts up to the full capacity are allowed and recovery is smooth
  (no cliff-edge window reset).
- A denied request gets HTTP 429 with a ``Retry-After`` header saying
  exactly how many seconds to wait for the next token.

NOTE: state lives in process memory. On a multi-worker deployment each
worker tracks separately -- use Redis for exact global limits in that
case. Render runs a single uvicorn worker, so this is exact there.
"""
from __future__ import annotations

import math
import time
from threading import Lock

from fastapi import HTTPException


class TokenBucket:
    """One thread-safe token bucket with lazy (on-access) refill."""

    def __init__(self, capacity: float, refill_rate: float, clock=time.monotonic) -> None:
        if capacity <= 0:
            raise ValueError(f"capacity must be > 0, got {capacity!r}")
        if refill_rate <= 0:
            raise ValueError(f"refill_rate must be > 0, got {refill_rate!r}")
        self.capacity = float(capacity)
        self.refill_rate = float(refill_rate)
        self._clock = clock
        self._tokens = float(capacity)  # buckets start full
        self._last_refill = float(clock())
        self._lock = Lock()

    def _refill(self, now: float) -> None:
        elapsed = now - self._last_refill
        if elapsed > 0:
            self._tokens = min(self.capacity, self._tokens + elapsed * self.refill_rate)
            self._last_refill = now

    def allow(self, cost: float = 1.0) -> tuple[bool, float]:
        """Try to consume ``cost`` tokens.

        Returns ``(allowed, retry_after_seconds)``; when denied no tokens
        are consumed and ``retry_after_seconds`` is the exact wait until
        enough tokens have refilled.
        """
        with self._lock:
            now = float(self._clock())
            self._refill(now)
            if self._tokens >= cost:
                self._tokens -= cost
                return True, 0.0
            return False, (cost - self._tokens) / self.refill_rate

    def is_full(self) -> bool:
        with self._lock:
            self._refill(float(self._clock()))
            return self._tokens >= self.capacity


class _Entry:
    """A bucket plus the last time its key was seen (for cleanup)."""

    __slots__ = ("bucket", "last_seen")

    def __init__(self, bucket: TokenBucket, now: float) -> None:
        self.bucket = bucket
        self.last_seen = now


_buckets: dict[str, _Entry] = {}
_lock = Lock()
_LAST_CLEANUP = [0.0]
_CLEANUP_INTERVAL = 300.0  # seconds
_IDLE_DROP_SECONDS = 3600.0


def _cleanup(now: float) -> None:
    """Drop full, long-idle buckets so the dict can't grow without bound.

    Only full buckets are dropped: removing a partly-drained bucket would
    hand that key a free refill.
    """
    if now - _LAST_CLEANUP[0] < _CLEANUP_INTERVAL:
        return
    _LAST_CLEANUP[0] = now
    for key in list(_buckets.keys()):
        entry = _buckets[key]
        if now - entry.last_seen > _IDLE_DROP_SECONDS and entry.bucket.is_full():
            del _buckets[key]


def _get_bucket(key: str, max_requests: int, window_seconds: int, now: float) -> TokenBucket:
    entry = _buckets.get(key)
    if entry is None:
        bucket = TokenBucket(
            capacity=max_requests,
            refill_rate=max_requests / window_seconds,
        )
        entry = _Entry(bucket, now)
        _buckets[key] = entry
    entry.last_seen = now
    return entry.bucket


def check_rate_limit(key: str, max_requests: int, window_seconds: int = 60) -> None:
    """Raise HTTP 429 if ``key``'s bucket is empty.

    The bucket holds ``max_requests`` tokens and refills at
    ``max_requests / window_seconds`` tokens per second.
    """
    now = time.monotonic()
    with _lock:
        _cleanup(now)
        bucket = _get_bucket(key, max_requests, window_seconds, now)
    allowed, retry_after = bucket.allow(1.0)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests -- please slow down and try again shortly.",
            headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
        )


def limit_user(user_id: str, scope: str, max_requests: int, window_seconds: int = 60) -> None:
    """Per-user rate limit for one endpoint scope."""
    check_rate_limit(f"{scope}:{user_id}", max_requests, window_seconds)


def _reset() -> None:
    """Clear all buckets (test helper)."""
    with _lock:
        _buckets.clear()
