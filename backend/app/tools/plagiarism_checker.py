"""
Plagiarism check tool -- web-match based (real detection).

How it works: the input is split into sentences and the most
distinctive ones are searched verbatim on the public web via Tavily.
A sentence that appears word-for-word on a webpage is hard evidence
of copying -- grounded in the actual input text, so different inputs
give different results (unlike a pure LLM guess, which has no corpus
to compare against and returns similar-looking scores for everything).

Limits (stated honestly in the disclaimer): this finds VERBATIM copies
on the indexed web only. Paraphrased copying, or sources outside the
search index (e.g. Turnitin's academic database), will not be flagged.
"""
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional

from app.config import settings

MIN_SENTENCE_LEN = 40  # shorter fragments aren't distinctive enough to check
MAX_SENTENCES = 6  # Tavily calls per check -- quota-friendly
SEARCH_RESULTS = 3
SEARCH_TIMEOUT = 20
_QUERY_MAX_LEN = 250  # quoted query truncation -- very long queries degrade
_FINGERPRINT_LEN = 120  # chars of a sentence used as the match fingerprint

_DISCLAIMER = (
    "Web-match check: compares distinctive sentences from your text against "
    "the public web via search. It detects verbatim copying only -- "
    "paraphrased text, or sources outside the search index, may not be "
    "flagged. For certified academic or legal use, use a database-backed "
    "tool (e.g. Turnitin, iThenticate)."
)


def _split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) >= MIN_SENTENCE_LEN]


def _pick_sentences(sentences: List[str]) -> List[str]:
    """Longest (most distinctive) sentences first, then restore text order."""
    ranked = sorted(enumerate(sentences), key=lambda x: len(x[1]), reverse=True)
    picked = sorted(ranked[:MAX_SENTENCES], key=lambda x: x[0])
    return [s for _, s in picked]


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def _search_sentence(client, sentence: str) -> List[Dict]:
    """Verbatim web search for one sentence; returns raw Tavily results."""
    try:
        resp = client.search(
            query=f'"{sentence[:_QUERY_MAX_LEN]}"',
            max_results=SEARCH_RESULTS,
            timeout=SEARCH_TIMEOUT,
        )
        return resp.get("results", [])
    except Exception as exc:  # noqa: BLE001 -- one bad search must not kill the check
        print(f"[plagiarism] search failed: {exc}", flush=True)
        return []


def _find_match(sentence: str, results: List[Dict]) -> Optional[str]:
    """URL of the first result verifiably containing the sentence, else None."""
    fingerprint = _normalize(sentence)[:_FINGERPRINT_LEN]
    for r in results:
        haystack = _normalize(f"{r.get('title', '')} {r.get('content', '')}")
        if fingerprint and fingerprint in haystack:
            return r.get("url", "")
    return None


def _check_one(client, sentence: str) -> Dict:
    results = _search_sentence(client, sentence)
    return {"sentence": sentence, "match_url": _find_match(sentence, results)}


def _unavailable(summary: str) -> Dict:
    return {
        "originality_score": None,
        "risk_level": "Unknown",
        "suspicious_segments": [],
        "overall_summary": summary,
        "disclaimer": _DISCLAIMER,
        "method": "web-match",
        "sentences_checked": 0,
    }


def check_plagiarism(text: str) -> Dict:
    """
    Web-match plagiarism check. Returns a dict with keys:
    originality_score (0-100), risk_level, suspicious_segments (each with
    segment/reason/sources), overall_summary, disclaimer, method,
    sentences_checked. Same shape as before, so the frontend needs no changes.
    """
    if not text or not text.strip():
        raise ValueError("Input text is empty.")

    sentences = _pick_sentences(_split_sentences(text))
    if not sentences:
        return _unavailable(
            "Text too short for a web-match check -- need at least one "
            f"sentence of {MIN_SENTENCE_LEN}+ characters."
        )

    if not settings.tavily_api_key:
        return _unavailable(
            "Web-match plagiarism check needs a Tavily API key "
            "(TAVILY_API_KEY), which is not configured on the server."
        )

    try:
        from tavily import TavilyClient  # lazy: optional dependency
    except ImportError:
        return _unavailable(
            "Web-match plagiarism check needs the tavily-python package, "
            "which is not installed on the server."
        )

    client = TavilyClient(api_key=settings.tavily_api_key)
    with ThreadPoolExecutor(max_workers=min(6, len(sentences))) as pool:
        checked = list(pool.map(lambda s: _check_one(client, s), sentences))

    matched = [c for c in checked if c["match_url"]]
    n = len(checked)
    score = round(100 * (n - len(matched)) / n)
    ratio = len(matched) / n
    risk = "High" if ratio >= 0.5 else ("Medium" if matched else "Low")

    segments = [
        {
            "segment": m["sentence"][:220] + "..." if len(m["sentence"]) > 220 else m["sentence"],
            "reason": f"Found verbatim on the public web: {m['match_url']}",
            "sources": [m["match_url"]],
        }
        for m in matched
    ]

    if matched:
        summary = (
            f"{len(matched)} of {n} checked sentences were found verbatim on "
            f"the public web -- strong plagiarism signal. "
            f"Originality score: {score}/100."
        )
    else:
        summary = (
            f"No verbatim web matches for any of the {n} checked distinctive "
            f"sentences -- no plagiarism detected by web-match. "
            f"Originality score: {score}/100."
        )

    return {
        "originality_score": score,
        "risk_level": risk,
        "suspicious_segments": segments,
        "overall_summary": summary,
        "disclaimer": _DISCLAIMER,
        "method": "web-match",
        "sentences_checked": n,
    }
