"""
Thin wrapper around the Groq chat-completion API so every agent
calls the LLM the same way (same client, same error handling).
"""
from groq import Groq
from app.config import settings

_client = (
    Groq(api_key=settings.groq_api_key, timeout=30.0, max_retries=2)
    if settings.groq_api_key
    else None
)


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
    """
    Sends a single-turn (system + user) chat completion request to Groq
    and returns the plain text response. Raises a clear error if no
    API key has been configured, instead of failing deep inside a node.
    """
    if _client is None:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy backend/.env.example to backend/.env "
            "and add your key from https://console.groq.com"
        )

    response = _client.chat.completions.create(
        model=settings.groq_model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content.strip()
