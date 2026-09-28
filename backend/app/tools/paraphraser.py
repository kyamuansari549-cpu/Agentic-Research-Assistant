"""
Paraphrasing tool — rewrites text in a chosen style using the Groq LLM.
Supports three modes: academic, casual, and concise.
"""
from app.tools.llm import call_llm

STYLE_PROMPTS = {
    "academic": (
        "You are an academic writing assistant. Rewrite the following text "
        "in a formal, scholarly tone suitable for a research paper. Preserve "
        "all factual information and meaning. Do not add new information."
    ),
    "casual": (
        "You are a writing assistant. Rewrite the following text in a clear, "
        "friendly, conversational tone that is easy for a general audience to "
        "understand. Preserve all factual information and meaning."
    ),
    "concise": (
        "You are a writing assistant. Rewrite the following text as concisely "
        "as possible while keeping every key fact and idea. Remove all filler "
        "words and redundancy. Do not add new information."
    ),
}


def paraphrase(text: str, style: str = "academic") -> str:
    """
    Paraphrase *text* in the requested *style*.
    Returns the rewritten text as a plain string.
    """
    if not text.strip():
        raise ValueError("Input text is empty.")

    style = style.lower()
    system_prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS["academic"])
    user_prompt = f"Text to rewrite:\n\n{text.strip()}"

    return call_llm(system_prompt, user_prompt, temperature=0.5)
