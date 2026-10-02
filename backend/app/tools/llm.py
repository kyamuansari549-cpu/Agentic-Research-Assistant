"""
LLM access for every agent: Groq is the primary provider, with an
automatic failover to Gemini when Groq rate-limits (HTTP 429).

Why failover instead of just retrying Groq? Waiting out Groq's limits
with exponential backoff costs 2+4+8+16+32 = 62s of pure waiting.
Failing over to a second provider turns that dead wait into one extra
API call, so the failed agent step resumes from where it stopped
instead of stalling the whole pipeline.

Failover is per call, not sticky: the NEXT call always tries Groq
first again. Only the failed call is retried on Gemini, so completed
pipeline stages are never redone.
"""
import time

import httpx
from groq import Groq, RateLimitError

from app.config import settings

_groq_client = (
    Groq(api_key=settings.groq_api_key, timeout=30.0, max_retries=2)
    if settings.groq_api_key
    else None
)

GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


def _call_groq(
    system_prompt: str, user_prompt: str, temperature: float, delays: list
) -> str:
    """One Groq chat completion; on 429 retries, sleeping `delays` between tries."""
    last_exc: RateLimitError | None = None
    for attempt in range(len(delays) + 1):
        try:
            response = _groq_client.chat.completions.create(
                model=settings.groq_model,
                temperature=temperature,
                tool_choice="none",  # force plain text (no tool-calling)
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content.strip()
        except RateLimitError as exc:
            last_exc = exc
            if attempt < len(delays):
                wait = delays[attempt]
                print(
                    f"[llm] Groq 429, waiting {wait}s... "
                    f"({attempt + 1}/{len(delays) + 1})",
                    flush=True,
                )
                time.sleep(wait)
    raise last_exc  # all attempts rate-limited


def _call_gemini(system_prompt: str, user_prompt: str, temperature: float) -> str:
    """Same (system + user) prompt via Gemini's generateContent REST API."""
    url = GEMINI_URL_TEMPLATE.format(model=settings.gemini_model)
    headers = {"x-goog-api-key": settings.google_api_key}
    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    for attempt in range(2):
        resp = httpx.post(url, headers=headers, json=body, timeout=30.0)
        if resp.status_code == 429 and attempt == 0:
            print("[llm] Gemini also 429, one retry...", flush=True)
            time.sleep(3)
            continue
        if resp.status_code != 200:
            raise RuntimeError(
                f"Gemini fallback failed (HTTP {resp.status_code}): "
                f"{resp.text[:200]}"
            )
        try:
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, ValueError) as exc:
            raise RuntimeError(
                f"Gemini returned an unexpected response: {resp.text[:200]}"
            ) from exc
        return text.strip()
    raise RuntimeError("Gemini fallback rate-limited after retry.")


def _fallback_ready() -> bool:
    return bool(settings.llm_fallback_enabled and settings.google_api_key)


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
    """
    Sends a single-turn (system + user) chat completion and returns plain
    text. Groq first (one quick 2s retry for transient blips); if Groq is
    truly rate-limited the SAME call fails over to Gemini instead of
    waiting ~60s. Without a GOOGLE_API_KEY configured, keeps the legacy
    Groq-only exponential backoff so nothing breaks.
    """
    if _groq_client is None:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy backend/.env.example to backend/.env "
            "and add your key from https://console.groq.com"
        )

    try:
        return _call_groq(system_prompt, user_prompt, temperature, delays=[2])
    except RateLimitError:
        if not _fallback_ready():
            # Legacy path: no fallback configured, wait Groq out.
            try:
                return _call_groq(
                    system_prompt, user_prompt, temperature,
                    delays=[2, 4, 8, 16, 32],
                )
            except RateLimitError as exc:
                raise RuntimeError(
                    "Groq rate limit hit after all retries. "
                    "Try a different model or upgrade your plan."
                ) from exc
        print("[llm] Groq rate-limited, failing over to Gemini...", flush=True)
        return _call_gemini(system_prompt, user_prompt, temperature)
