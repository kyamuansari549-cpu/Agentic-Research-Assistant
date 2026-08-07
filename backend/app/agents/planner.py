"""
Planner agent.

Breaks a broad, open-ended research query into a small set of
concrete, independently-answerable sub-tasks. This is the first node
in the graph and sets up everything the Researcher agent will do.
"""
import json
import re
from app.state import AgentState
from app.tools.llm import call_llm
from app.config import settings

SYSTEM_PROMPT = """You are a research planning agent. Given a broad research \
question, break it into a small number of concrete, independently \
researchable sub-questions that together would let someone answer the \
original question thoroughly.

Respond with ONLY a JSON array of strings, no prose, no markdown fences. \
Example: ["What is X's current market size in India?", "Who are X's top 3 competitors?"]"""


def planner_node(state: AgentState) -> dict:
    query = state["query"]
    raw = call_llm(
        SYSTEM_PROMPT,
        f"Research question: {query}\nMax sub-questions: {settings.max_subtasks}",
    )

    subtasks = _parse_subtasks(raw, fallback_query=query)

    return {
        "subtasks": [
            {"id": f"t{i}", "description": desc, "findings": None}
            for i, desc in enumerate(subtasks)
        ],
        "revision_count": 0,
        "research_notes": [],
        "sources": [],
    }


def _parse_subtasks(raw: str, fallback_query: str) -> list[str]:
    """LLMs don't always return clean JSON -- this degrades gracefully
    instead of crashing the whole pipeline on a formatting slip."""
    cleaned = re.sub(r"```json|```", "", raw).strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list) and parsed:
            return [str(x) for x in parsed][: settings.max_subtasks]
    except json.JSONDecodeError:
        pass

    # Fallback: split on newlines/numbering if JSON parsing failed
    lines = [re.sub(r"^[\d\.\-\)\s]+", "", l).strip() for l in cleaned.split("\n")]
    lines = [l for l in lines if l]
    if lines:
        return lines[: settings.max_subtasks]

    return [fallback_query]
