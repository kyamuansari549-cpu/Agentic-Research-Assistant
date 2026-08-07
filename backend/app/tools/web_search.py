"""
Web search tool used by the Researcher agent.

Primary: Tavily (https://tavily.com) -- a proper search API built for LLM
agents, free tier 1000 searches/month. Used first when a key is configured
because it's far more reliable in practice than free DDG scraping (DDG's
free endpoint rate-limits/blocks aggressively and inconsistently -- this is
a widely reported issue across many projects, not just a burst-traffic
problem specific to this app).

Fallback: duckduckgo-search -- needs no API key at all, so the project
still runs for anyone who hasn't set up Tavily yet. Retried with backoff
since it's the less reliable path.
"""
import time
from typing import List, Dict
from duckduckgo_search import DDGS
from app.config import settings

MAX_RETRIES = 3
BASE_DELAY_SECONDS = 3


def web_search(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    Returns a list of {title, href, body} dicts for the query.
    Tries Tavily first if a key is configured (reliable, no rate-limit
    issues on the free tier), otherwise falls back to DDG with retries.
    """
    if settings.tavily_api_key:
        results, tavily_error = _search_tavily(query, max_results)
        if results:
            return results
        # Tavily failed (bad key, quota exhausted, etc) -- try DDG as backup
        ddg_results, ddg_error = _search_ddg(query, max_results)
        if ddg_results:
            return ddg_results
        return [
            {
                "title": "search_error",
                "href": "",
                "body": f"Tavily failed: {tavily_error} | DDG also failed: {ddg_error}",
            }
        ]

    results, error = _search_ddg(query, max_results)
    if results:
        return results
    return [{"title": "search_error", "href": "", "body": error}]


def _search_ddg(query: str, max_results: int):
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            with DDGS(timeout=15) as ddgs:
                raw = list(ddgs.text(query, max_results=max_results))
            if raw:
                return [
                    {
                        "title": r.get("title", ""),
                        "href": r.get("href", ""),
                        "body": r.get("body", ""),
                    }
                    for r in raw
                ], None
            last_error = "empty result set"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)

        if attempt < MAX_RETRIES - 1:
            time.sleep(BASE_DELAY_SECONDS * (attempt + 1))  # 3s, 6s, ...

    return [], f"DDG unavailable after {MAX_RETRIES} attempts: {last_error}"


def _search_tavily(query: str, max_results: int):
    try:
        from tavily import TavilyClient  # imported lazily -- optional dependency
    except ImportError:
        return [], "tavily-python not installed (pip install tavily-python)"

    try:
        client = TavilyClient(api_key=settings.tavily_api_key)
        response = client.search(query=query, max_results=max_results, timeout=20)
        raw = response.get("results", [])
        return [
            {
                "title": r.get("title", ""),
                "href": r.get("url", ""),
                "body": r.get("content", ""),
            }
            for r in raw
        ], None
    except Exception as exc:  # noqa: BLE001
        return [], str(exc)
