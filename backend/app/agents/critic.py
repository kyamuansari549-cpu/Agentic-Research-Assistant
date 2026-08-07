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
Check for: missing angles, unsupported claims, vague statements, and \
whether the question was fully answered.

Respond in exactly this format:
VERDICT: APPROVE or REVISE
FEEDBACK: """

def critic_node(state: AgentState) -> dict:
    revision_count = state.get("revision_count", 0)

    # Agar cap hit ho gaya, seedha approve kar do — LLM call mat karo
    if revision_count >= settings.max_revision_cycles:
        print(f"[critic] revision cap hit ({revision_count}), auto-approving", flush=True)
        return {
            "approved": True,
            "critic_feedback": "",
            "revision_count": revision_count + 1,
        }

    print(f"[critic] reviewing draft (revision_count={revision_count})", flush=True)
    result = call_llm(
        SYSTEM_PROMPT,
        f"Original question: {state['query']}\n\nDraft report:\n{state['draft_report']}",
    )

    verdict_match = re.search(r"VERDICT:\s*(APPROVE|REVISE)", result, re.IGNORECASE)
    feedback_match = re.search(r"FEEDBACK:\s*(.*)", result, re.IGNORECASE | re.DOTALL)

    approved = bool(verdict_match) and verdict_match.group(1).upper() == "APPROVE"
    feedback = feedback_match.group(1).strip() if feedback_match else ""

    return {
        "approved": approved,
        "critic_feedback": "" if approved else feedback,
        "revision_count": revision_count + 1,
    }

def route_after_critic(state: AgentState) -> str:
    """Conditional edge: loop back to research, or finish."""
    return "finalize" if state.get("approved") else "researcher"