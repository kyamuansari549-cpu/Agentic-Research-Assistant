"""
LLM access for every agent: Groq is the primary provider, with Gemini as
the fallback. Transient provider errors (HTTP 429 rate-limit, 503
overload) are retried in a round-robin across the configured providers
with growing backoff, so a single busy provider never kills an agent
step -- the call simply moves to whichever provider can serve it.

Without a GOOGLE_API_KEY configured, the round-robin degrades to
Groq-only retries (same resilience, one provider).
"""
import time

import httpx
from groq import Groq, APIStatusError

from app.config import settings

_groq_client = (
    Groq(api_key=settings.groq_api_key, timeout=30.0, max_retries=2)
    if settings.groq_api_key
    else None
)

GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

# Transient HTTP statuses: safe to retry, possibly on the other provider.
_TRANSIENT_CODES = (429, 503)

# Waits (seconds) before attempts 2..6. Total patience ~= 67s + API time,
# comfortably under the 150s per-node ceiling in main.py.
_RETRY_DELAYS = [2, 5, 10, 20, 30]


class _TransientLLMError(Exception):
    """A 429/503 from an LLM provider -- retryable, maybe on the other one."""

    def __init__(self, provider: str, code: int, detail: str = ""):
        super().__init__(f"{provider} HTTP {code}: {detail[:120]}")
        self.provider = provider
        self.code = code


def _call_groq_once(system_prompt: str, user_prompt: str, temperature: float) -> str:
    """Single Groq attempt. 429/5xx -> _TransientLLMError (eligible for
    Gemini failover); anything else (bad key, bad request) raises as-is."""
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
    except APIStatusError as exc:
        # RateLimitError (429) is a subclass of APIStatusError, so this
        # covers both 429 and 5xx (overload / internal errors). Anything
        # else (401 bad key, 400 bad request, 404 retired model) is
        # non-transient: fail fast so the real cause surfaces.
        if exc.status_code == 429 or exc.status_code in (500, 502, 503, 529):
            raise _TransientLLMError("groq", exc.status_code, str(exc)) from exc
        raise


def _call_gemini_once(system_prompt: str, user_prompt: str, temperature: float) -> str:
    """Single Gemini attempt via generateContent REST. 429/503 -> transient."""
    url = GEMINI_URL_TEMPLATE.format(model=settings.gemini_model)
    headers = {"x-goog-api-key": settings.google_api_key}
    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    resp = httpx.post(url, headers=headers, json=body, timeout=30.0)
    if resp.status_code in _TRANSIENT_CODES:
        raise _TransientLLMError("gemini", resp.status_code, resp.text)
    if resp.status_code != 200:
        # Non-transient (bad key, retired model, bad request): fail fast so
        # the real cause surfaces instead of being retried blindly.
        raise RuntimeError(
            f"Gemini request failed (HTTP {resp.status_code}): {resp.text[:400]}"
        )
    try:
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, ValueError) as exc:
        raise RuntimeError(
            f"Gemini returned an unexpected response: {resp.text[:400]}"
        ) from exc
    return text.strip()


def _fallback_ready() -> bool:
    return bool(settings.llm_fallback_enabled and settings.google_api_key)


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
    """
    Sends a single-turn (system + user) chat completion and returns plain
    text. Tries Groq first, then round-robins across the available
    providers (Groq, Gemini) on transient 429/503 errors with growing
    backoff. Gives up only after every provider has been tried repeatedly.
    """
    if _groq_client is None:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy backend/.env.example to backend/.env "
            "and add your key from https://console.groq.com"
        )

    providers = ["groq"] + (["gemini"] if _fallback_ready() else [])
    last_exc: Exception | None = None

    for attempt in range(len(_RETRY_DELAYS) + 1):
        if attempt:
            wait = _RETRY_DELAYS[attempt - 1]
            print(
                f"[llm] waiting {wait}s before retry "
                f"{attempt + 1}/{len(_RETRY_DELAYS) + 1}...",
                flush=True,
            )
            time.sleep(wait)
        provider = providers[attempt % len(providers)]
        try:
            if provider == "groq":
                return _call_groq_once(system_prompt, user_prompt, temperature)
            return _call_gemini_once(system_prompt, user_prompt, temperature)
        except _TransientLLMError as exc:
            last_exc = exc
            nxt = providers[(attempt + 1) % len(providers)]
            print(f"[llm] {provider} busy (HTTP {exc.code})", flush=True)
            if nxt != provider and attempt < len(_RETRY_DELAYS):
                print(f"[llm] switching to {nxt}...", flush=True)

    raise RuntimeError(
        f"LLM providers unavailable after {len(_RETRY_DELAYS) + 1} attempts: "
        f"{last_exc}"
    ) from last_exc
