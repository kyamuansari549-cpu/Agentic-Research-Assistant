"""
Research gap finder — analyses a research paper or literature excerpt
and identifies areas the authors did not address, contradictions with
other known work, methodological limitations, and open questions.
"""
import json
from app.tools.llm import call_llm

_SYSTEM_PROMPT = """
You are an expert academic reviewer. Analyse the following research text
and identify the research gaps, limitations, and open questions it leaves
unaddressed. Consider:

1. Topics the authors explicitly acknowledge as out of scope
2. Methodological weaknesses (sample size, lack of control groups, etc.)
3. Unanswered "why" or "how" questions implied by the findings
4. Contradictions or tensions with established knowledge in the field
5. Future research directions that would naturally follow from this work

Respond ONLY with a valid JSON object (no markdown, no explanation outside JSON)
in exactly this format:
{
  "gaps": [
    {
      "title": "<short gap title>",
      "description": "<1-3 sentence explanation>",
      "type": "<Methodological|Conceptual|Empirical|Theoretical|Future Work>"
    }
  ],
  "limitations_noted_by_authors": "<what the authors themselves admit as limits, or 'None mentioned'>",
  "suggested_future_directions": ["<direction 1>", "<direction 2>"],
  "overall_assessment": "<2-3 sentence summary of the paper's research coverage>"
}
""".strip()


def find_research_gaps(text: str) -> dict:
    """
    Analyse *text* (a research paper or excerpt) for research gaps.
    Returns a dict with keys: gaps, limitations_noted_by_authors,
    suggested_future_directions, overall_assessment.
    """
    if not text.strip():
        raise ValueError("Input text is empty.")

    raw = call_llm(_SYSTEM_PROMPT, text.strip(), temperature=0.3)

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
            "gaps": [],
            "limitations_noted_by_authors": "Unable to parse structured output.",
            "suggested_future_directions": [],
            "overall_assessment": raw,
        }

    return result


def chat_with_pdf(pdf_text: str, question: str) -> str:
    """
    Answer a user question about a PDF document using the LLM.
    *pdf_text* is the full extracted text (or a relevant chunk).
    *question* is the user's natural-language question.
    Returns the answer as a plain string.
    """
    if not pdf_text.strip():
        raise ValueError("PDF text is empty.")
    if not question.strip():
        raise ValueError("Question is empty.")

    system = (
        "You are a helpful research assistant. The user has uploaded a PDF "
        "document, and its text is provided below as context. Answer the user's "
        "question accurately and concisely based ONLY on the document content. "
        "If the answer is not in the document, say so clearly.\n\n"
        "--- DOCUMENT TEXT ---\n"
        f"{pdf_text[:12000]}"  # cap at ~12k chars to stay within context limits
    )
    return call_llm(system, question.strip(), temperature=0.3)
