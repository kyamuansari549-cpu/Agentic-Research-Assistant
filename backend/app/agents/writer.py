"""
Writer agent.

Synthesizes everything gathered so far (research notes + any code
analysis) into a structured report. Runs once to produce a draft for
the Critic, and once more (implicitly, by reusing the same node) to
produce the polished final version after the Critic approves.
"""
from app.state import AgentState
from app.tools.llm import call_llm

SYSTEM_PROMPT = """You are a report-writing agent. Combine the research notes \
and (optional) code analysis into a clear, well-structured markdown report \
that directly answers the original research question. Use headings, and a \
short "Sources" section at the end listing the URLs given to you. Do not \
invent facts that aren't in the notes."""


def writer_node(state: AgentState) -> dict:
    notes_block = "\n\n".join(state.get("research_notes", []))
    code_block = (
        f"\n\nCode analysis output:\n{state['code_output']}"
        if state.get("code_used")
        else ""
    )
    feedback_block = (
        f"\n\nAddress this reviewer feedback in this revision:\n{state['critic_feedback']}"
        if state.get("critic_feedback")
        else ""
    )
    sources_block = "\n".join(f"- {s}" for s in state.get("sources", []))

    print("[writer] drafting report", flush=True)
    draft = call_llm(
        SYSTEM_PROMPT,
        f"Original question: {state['query']}\n\n"
        f"Research notes:\n{notes_block}{code_block}{feedback_block}\n\n"
        f"Sources to cite:\n{sources_block}",
    )

    return {"draft_report": draft}
