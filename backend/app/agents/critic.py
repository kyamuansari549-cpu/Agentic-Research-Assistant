"""
Critic agent.

This is the self-correction loop that makes the system "agentic"
rather than a straight-line pipeline: it reviews the Writer's draft
against the original question and either approves it or sends it
back with specific, actionable feedback for another research pass.
Bounded by MAX_REVISION_CYCLES so it can never loop forever.
"""
import re
from app.state import AgentState
from app.tools.llm import call_llm
from app.config import settings

SYSTEM_PROMPT = """You are a strict but fair editorial critic reviewing a \
research report draft against the original question.
Check for: missing angles, unsupported claims, vague statements, \
whether the question was fully answered, and -- if a "real papers" list \
is provided -- whether every paper cited in "Key Research Papers" appears \
on that list with matching title/authors/year/link (flag any hallucinated \
or renamed papers, invented authors, or mismatched links as unsupported).

Respond in exactly this format:
VERDICT: APPROVE or REVISE
FEEDBACK: <one or two sentences of specific, actionable feedback, or "None" if approved>"""


def critic_node(state: AgentState) -> dict:
    revision_count = state.get("revision_count", 0)

    print(f"[critic] reviewing draft (revision_count={revision_count})", flush=True)

    papers = state.get("papers", [])
    papers_block = ""
    if papers:
        titles = "\n".join(
            f"- {p.get('title', '')} ({p.get('year') or 'n.d.'}) -- "
            f"{', '.join(p.get('authors', [])[:3])} | {p.get('url') or 'no url'}"
            for p in papers
        )
        papers_block = f"\n\nReal papers retrieved by the search tool (citations must match these):\n{titles}"

    result = call_llm(
        SYSTEM_PROMPT,
        f"Original question: {state['query']}\n\nDraft report:\n{state['draft_report']}{papers_block}",
    )

    verdict_match = re.search(r"VERDICT:\s*(APPROVE|REVISE)", result, re.IGNORECASE)
    feedback_match = re.search(r"FEEDBACK:\s*(.*)", result, re.IGNORECASE | re.DOTALL)

    approved = bool(verdict_match) and verdict_match.group(1).upper() == "APPROVE"
    feedback = feedback_match.group(1).strip() if feedback_match else ""

    # Force approval once we hit the revision cap so the graph always terminates
    if revision_count >= settings.max_revision_cycles:
        approved = True

    return {
        "approved": approved,
        "critic_feedback": "" if approved else feedback,
        "revision_count": revision_count + 1,
    }


def route_after_critic(state: AgentState) -> str:
    """Conditional edge: loop back to research, or finish."""
    return "finalize" if state.get("approved") else "researcher"
