"""
Researcher agent.

For every sub-task from the Planner, searches the web and asks the
LLM to summarize the findings, grounded in the retrieved snippets
(not the model's own memory). Runs again -- with the Critic's
feedback appended -- if a revision cycle was triggered.
"""
import time
from app.state import AgentState
from app.tools.llm import call_llm
from app.tools.web_search import web_search

SYSTEM_PROMPT = """You are a research agent. You are given a sub-question and \
several raw web search results (title, url, snippet). Write a concise, \
factual summary (4-6 sentences) that answers the sub-question using ONLY \
the information in the search results. If the results don't contain a \
clear answer, say so plainly instead of guessing. Do not fabricate facts."""

# Gap between consecutive DDG searches -- without this, 5 sub-tasks fire
# 5+ searches back-to-back and DDG's free endpoint starts rate-limiting
# partway through, silently.
INTER_SEARCH_DELAY_SECONDS = 2


def researcher_node(state: AgentState) -> dict:
    subtasks = state["subtasks"]
    feedback = state.get("critic_feedback", "")

    notes: list[str] = []
    sources: list[str] = []

    for i, task in enumerate(subtasks):
        if i > 0:
            time.sleep(INTER_SEARCH_DELAY_SECONDS)

        print(f"[researcher] ({i + 1}/{len(subtasks)}) {task['description']!r}", flush=True)
        query = task["description"]
        if feedback:
            query = f"{query} (additional angle requested: {feedback})"

        results = web_search(query, max_results=5)
        snippet_block = "\n".join(
            f"- {r['title']}: {r['body']} ({r['href']})" for r in results
        )

        summary = call_llm(
            SYSTEM_PROMPT,
            f"Sub-question: {task['description']}\n\nSearch results:\n{snippet_block}",
        )

        task["findings"] = summary
        notes.append(f"### {task['description']}\n{summary}")
        sources.extend(r["href"] for r in results if r["href"])

    return {
        "subtasks": subtasks,
        "research_notes": notes,
        "sources": list(dict.fromkeys(sources)),  # de-dupe, keep order
    }
