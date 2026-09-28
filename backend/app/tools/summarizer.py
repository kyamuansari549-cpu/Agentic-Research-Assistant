"""
Summarization tool — condenses text using the Groq LLM.
Supports two length modes: brief (3-5 sentences) and detailed (structured).
"""
from app.tools.llm import call_llm

_BRIEF_SYSTEM = """
You are a summarization assistant. Read the following text and write a
clear, accurate summary in 3-5 sentences. Capture the main argument,
key findings, and any important conclusions. Do not add information
that is not in the original text.
""".strip()

_DETAILED_SYSTEM = """
You are a summarization assistant. Read the following text and produce
a structured summary with these sections:

**Overview** (1-2 sentences — the big picture)
**Key Points** (bullet list of the most important facts or arguments)
**Conclusions** (what the text concludes or recommends)

Use markdown formatting. Do not add information that is not in the
original text.
""".strip()


def summarize(text: str, mode: str = "brief") -> str:
    """
    Summarize *text*.
    *mode* is 'brief' (default) or 'detailed'.
    Returns the summary as a plain or markdown string.
    """
    if not text.strip():
        raise ValueError("Input text is empty.")

    system = _DETAILED_SYSTEM if mode == "detailed" else _BRIEF_SYSTEM
    user_prompt = f"Text to summarize:\n\n{text.strip()}"

    return call_llm(system, user_prompt, temperature=0.3)
