"""
Plagiarism check tool — uses the LLM to analyse text for potential
plagiarism signals: uncommon phrase patterns, stylistic inconsistencies,
abrupt topic jumps, and citation mismatches.

Note: This is an AI-assisted heuristic check, not a database-backed
plagiarism detector (which would require access to a corpus like
Turnitin). It flags suspicious patterns and gives an estimated
originality score, with a clear disclaimer to the user.
"""
import json
from app.tools.llm import call_llm

_SYSTEM_PROMPT = """
You are a plagiarism-detection assistant. Analyse the following text for
potential plagiarism signals. Look for:
- Abrupt changes in writing style or vocabulary level
- Sentences that sound copied from formal sources but lack citations
- Overuse of well-known exact phrases without quotation marks
- Factual claims that appear to be lifted from external sources
- Mismatched tone (academic passages embedded in casual text, or vice versa)

Respond ONLY with a valid JSON object (no markdown, no explanation outside JSON)
in exactly this format:
{
  "originality_score": <integer 0-100, 100 = fully original>,
  "risk_level": "<Low|Medium|High>",
  "suspicious_segments": [
    {"segment": "<short excerpt>", "reason": "<why it looks copied>"}
  ],
  "overall_summary": "<2-3 sentence plain-English summary>",
  "disclaimer": "This is an AI-assisted heuristic analysis, not a certified plagiarism report. Use a database-backed tool (e.g. Turnitin, iThenticate) for academic or legal purposes."
}
""".strip()


def check_plagiarism(text: str) -> dict:
    """
    Analyse *text* for plagiarism signals.
    Returns a dict with keys: originality_score, risk_level,
    suspicious_segments, overall_summary, disclaimer.
    """
    if not text.strip():
        raise ValueError("Input text is empty.")

    raw = call_llm(_SYSTEM_PROMPT, text.strip(), temperature=0.2)

    # Strip accidental markdown fences if the model adds them
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        # drop the first and last fence lines
        cleaned = "\n".join(
            l for l in lines if not l.strip().startswith("```")
        )

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: return raw text inside the expected structure
        result = {
            "originality_score": None,
            "risk_level": "Unknown",
            "suspicious_segments": [],
            "overall_summary": raw,
            "disclaimer": (
                "This is an AI-assisted heuristic analysis, not a certified "
                "plagiarism report."
            ),
        }

    return result
