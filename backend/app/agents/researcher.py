"""
Researcher agent.

For every sub-task from the Planner, searches the web and asks the
LLM to summarize the findings, grounded in the retrieved snippets
(not the model's own memory). Runs again -- with the Critic's
feedback appended -- if a revision cycle was triggered.
"""
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from app.state import AgentState
from app.tools.llm import call_llm
from app.tools.web_search import web_search
from app.tools.paper_search import search_papers
from app.config import settings

SYSTEM_PROMPT = """You are a research agent. You are given a sub-question and \
several raw web search results (title, url, snippet). Write a concise, \
factual summary (4-6 sentences) that answers the sub-question using ONLY \
the information in the search results. If the results don't contain a \
clear answer, say so plainly instead of guessing. Do not fabricate facts."""

# Only DDG's free endpoint needs artificial spacing between requests --
# Tavily (used whenever a key is configured) doesn't have this problem,
# so we skip the throttle entirely in that case and let every sub-task's
# search run fully in parallel too, not just the LLM summarization step.
_search_lock = threading.Lock()
_last_search_time = [0.0]
INTER_SEARCH_DELAY_SECONDS = 2
_NEEDS_THROTTLE = not bool(settings.tavily_api_key)


def _throttled_search(query: str, max_results: int = 5):
    if not _NEEDS_THROTTLE:
        return web_search(query, max_results=max_results)

    with _search_lock:
        wait = INTER_SEARCH_DELAY_SECONDS - (time.time() - _last_search_time[0])
        if wait > 0:
            time.sleep(wait)
        results = web_search(query, max_results=max_results)
        _last_search_time[0] = time.time()
    return results


def _research_one(task: dict, feedback: str) -> dict:
    print(f"[researcher] starting: {task['description']!r}", flush=True)
    query = task["description"]
    if feedback:
        query = f"{query} (additional angle requested: {feedback})"

    results = _throttled_search(query, max_results=5)
    snippet_block = "\n".join(
        f"- {r['title']}: {r['body']} ({r['href']})" for r in results
    )

    summary = call_llm(
        SYSTEM_PROMPT,
        f"Sub-question: {task['description']}\n\nSearch results:\n{snippet_block}",
    )

    task["findings"] = summary
    print(f"[researcher] done: {task['description']!r}", flush=True)
    return {
        "note": f"### {task['description']}\n{summary}",
        "sources": [r["href"] for r in results if r["href"]],
    }


def researcher_node(state: AgentState) -> dict:
    subtasks = state["subtasks"]
    feedback = state.get("critic_feedback", "")

    # Real-paper search runs ONCE per job on the original query (not per
    # sub-task, and not again on REVISE loops -- results are deterministic
    # for a given query, so re-fetching would just burn API calls).
    papers = state.get("papers") or search_papers(state["query"], max_results=6)
    paper_urls = [p["url"] for p in papers if p.get("url")]

    # Run all sub-tasks concurrently. Search calls stay throttled (via the
    # lock above) but LLM calls overlap, so total wall-clock time is close
    # to the SLOWEST single sub-task instead of the SUM of all of them.
    with ThreadPoolExecutor(max_workers=min(5, len(subtasks) or 1)) as pool:
        results = list(pool.map(lambda t: _research_one(t, feedback), subtasks))

    notes = [r["note"] for r in results]
    sources = [href for r in results for href in r["sources"]]

    return {
        "subtasks": subtasks,
        "research_notes": notes,
        "sources": list(dict.fromkeys(paper_urls + sources)),  # de-dupe, keep order
        "papers": papers,
    }
