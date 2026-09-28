"""
AI-content detection tool — uses the LLM to analyse text for signals
commonly associated with AI-generated writing:
- Overly uniform sentence length and structure
- Absence of personal anecdotes or opinions
- Hedging phrases typical of LLMs ("It is worth noting that…", etc.)
- Lack of natural errors, colloquialisms, or idiomatic expressions
- Generic, broadly applicable conclusions

Note: AI detection is an inherently probabilistic task. This tool
provides a heuristic likelihood score with a clear disclaimer.
"""
import json
from app.tools.llm import call_llm

_SYSTEM_PROMPT = """
You are an AI-content detection expert. Analyse the following text and
determine the likelihood that it was generated (fully or partially) by
an AI language model.

Look for these AI writing signals:
- Unnaturally consistent sentence rhythm and length
- Heavy use of transitional filler ("Furthermore", "In conclusion", etc.)
- Absence of typos, self-corrections, or natural speech patterns
- Overly balanced, non-committal hedging language
- Generic examples that could apply to any situation
- Repetitive paragraph structures (topic → elaboration → summary)

Respond ONLY with a valid JSON object (no markdown, no explanation outside JSON)
in exactly this format:
{
  "ai_probability": <integer 0-100, 100 = almost certainly AI-generated>,
  "verdict": "<Human-written|Likely Human|Mixed|Likely AI|AI-generated>",
  "signals_found": [
    {"signal": "<name>", "example": "<short excerpt or 'N/A'>"}
  ],
  "overall_summary": "<2-3 sentence plain-English explanation>",
  "disclaimer": "AI detection models are not 100% accurate. Treat this as a probabilistic estimate, not a definitive judgement."
}
""".strip()


def detect_ai_content(text: str) -> dict:
    """
    Analyse *text* and return a likelihood assessment that it is
    AI-generated.  Returns a dict with keys: ai_probability, verdict,
    signals_found, overall_summary, disclaimer.
    """
    if not text.strip():
        raise ValueError("Input text is empty.")

    raw = call_llm(_SYSTEM_PROMPT, text.strip(), temperature=0.2)

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(
            l for l in lines if not l.strip().startswith("```")
        )

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        result = {
            "ai_probability": None,
            "verdict": "Unknown",
            "signals_found": [],
            "overall_summary": raw,
            "disclaimer": (
                "AI detection models are not 100% accurate. Treat this as "
                "a probabilistic estimate, not a definitive judgement."
            ),
        }

    return result
