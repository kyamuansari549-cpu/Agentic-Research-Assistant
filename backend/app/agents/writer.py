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
invent facts that aren't in the notes.

If a "Key papers found" list is provided, include a "## Key Research Papers" \
section in the report (before "Sources"). For EACH paper on that list write \
one entry in exactly this format:
**[Paper title](paper page url)** (Year) — Author 1, Author 2. *Venue*. \
Cited by N.
[PDF](pdf url) — only if a real PDF link is given for that paper; omit \
the PDF line entirely otherwise.
One or two sentences on what the paper contributes, based ONLY on its \
abstract below.
Rules: use ONLY the papers from the provided list -- never invent, rename, \
or merge papers, authors, venues, or links. If a paper's page URL is NONE, \
write its title in bold WITHOUT a markdown link (never link to "NONE" or \
leave a half-written link). If the list is empty, omit the section entirely."""


def _format_papers(papers: list) -> str:
    """Renders the paper records as an LLM-safe reference block."""
    entries = []
    for i, p in enumerate(papers, 1):
        # Square brackets in a title would break the markdown link syntax
        # the Writer is asked to produce, so neutralize them up front.
        title = (p.get("title", "") or "").replace("[", "(").replace("]", ")")
        authors = ", ".join(p.get("authors", [])[:6])
        if len(p.get("authors", [])) > 6:
            authors += " et al."
        year = p.get("year") or "n.d."
        venue = p.get("venue") or "Unknown venue"
        cites = p.get("citations") or 0
        abstract = (p.get("abstract") or "")[:900]
        lines = [
            f"[{i}] Title: {title}",
            f"    Authors: {authors}",
            f"    Venue/year: {venue}, {year} | Cited by: {cites}",
            f"    Page URL: {p.get('url') or 'NONE'}",
            f"    PDF URL: {p.get('pdf_url') or 'NONE (paywalled or no open copy)'}",
            f"    Abstract: {abstract}",
        ]
        entries.append("\n".join(lines))
    return "\n\n".join(entries)


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
    papers = state.get("papers", [])
    papers_block = (
        f"\n\nKey papers found (cite ONLY these, exactly as listed):\n{_format_papers(papers)}"
        if papers
        else ""
    )

    print("[writer] drafting report", flush=True)
    draft = call_llm(
        SYSTEM_PROMPT,
        f"Original question: {state['query']}\n\n"
        f"Research notes:\n{notes_block}{code_block}{feedback_block}{papers_block}\n\n"
        f"Sources to cite:\n{sources_block}",
    )

    return {"draft_report": draft}
