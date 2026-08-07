"""
Thin wrapper around the Groq chat-completion API so every agent
calls the LLM the same way (same client, same error handling).
"""
import time
from groq import Groq, RateLimitError
from app.config import settings

_client = (
    Groq(api_key=settings.groq_api_key, timeout=30.0, max_retries=2)
    if settings.groq_api_key
    else None
)


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
    if _client is None:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy backend/.env.example to backend/.env "
            "and add your key from https://console.groq.com"
        )

    max_retries = 5
    base_delay = 2

    for attempt in range(max_retries):
        try:
            response = _client.chat.completions.create(
                model=settings.groq_model,
                temperature=temperature,
                tool_choice="none",  # ← FORCE PLAIN TEXT RESPONSE
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content.strip()

        except RateLimitError as exc:
            wait = base_delay * (2 ** attempt)
            if attempt < max_retries - 1:
                print(
                    f"[llm] 429 rate limit, waiting {wait}s... "
                    f"({attempt + 1}/{max_retries})",
                    flush=True,
                )
                time.sleep(wait)
            else:
                raise RuntimeError(
                    "Groq rate limit hit after all retries. "
                    "Try a different model or upgrade your plan."
                ) from exc

        except Exception:
            raise