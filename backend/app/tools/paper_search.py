"""
Paper search tool used by the Researcher agent.

Finds REAL, published research papers for a query (not LLM-generated
summaries) across free scholarly APIs, and resolves a legal full-text
PDF link wherever one exists:

  1. Semantic Scholar (https://www.semanticscholar.org/product/api)
     - title, abstract, authors, venue, year, citation counts, DOI,
       arXiv id, and an openAccessPdf link when available.
     - Free, no key needed (anonymous: ~100 req / 5 min). An optional
       SEMANTICSCHOLAR_API_KEY raises the limit via the x-api-key header.
  2. arXiv (https://arxiv.org/help/api) -- free preprints, mostly CS /
     physics / maths. Always ships a legal PDF link.
  3. OpenAlex (https://openalex.org) -- fallback if Semantic Scholar
     fails. Free, no key needed.
  4. Unpaywall (https://unpaywall.org) -- finds a LEGAL open-access PDF
     for a DOI (author self-archived copies, etc.). Needs an email
     address; skipped silently when UNPAYWALL_EMAIL is not configured.

Only legal, openly-available PDFs are ever returned. Paywalled papers
(IEEE / ACM / Springer / Elsevier) come back as metadata + abstract +
landing-page link only -- we never attempt to bypass a paywall.

Every function here is defensive: any API failure returns [] / None
instead of raising, so the research pipeline keeps working even when
a scholarly API is down or rate-limited.
"""
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional, Tuple

import httpx

from app.config import settings

TIMEOUT_SECONDS = 8  # scholarly APIs answer in 1-3s normally; don't hang on a slow one
S2_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
S2_FIELDS = "title,abstract,authors,venue,year,citationCount,url,openAccessPdf,externalIds"
ARXIV_URL = "https://export.arxiv.org/api/query"
OPENALEX_URL = "https://api.openalex.org/works"
UNPAYWALL_URL = "https://api.unpaywall.org/v2"

ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom"}

# In-memory cache: same query asked twice (common when re-running /
# demoing) returns instantly instead of re-hitting 3 APIs + Unpaywall.
_paper_cache: Dict[Tuple[str, int], Tuple[float, List[Dict]]] = {}
PAPER_CACHE_TTL_SECONDS = 3600
PAPER_CACHE_MAX_ENTRIES = 200


def _cache_get(query: str, max_results: int) -> Optional[List[Dict]]:
    hit = _paper_cache.get((_norm_title(query), max_results))
    if hit and time.time() - hit[0] < PAPER_CACHE_TTL_SECONDS:
        print(f"[paper_search] cache hit for {query!r}", flush=True)
        return hit[1]
    return None


def _cache_put(query: str, max_results: int, papers: List[Dict]) -> None:
    if len(_paper_cache) >= PAPER_CACHE_MAX_ENTRIES:
        _paper_cache.clear()
    _paper_cache[(_norm_title(query), max_results)] = (time.time(), papers)


def _norm_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (title or "").lower())


def _dedup_key(p: Dict) -> str:
    if p.get("doi"):
        return "doi:" + p["doi"].lower()
    if p.get("arxiv_id"):
        return "arxiv:" + p["arxiv_id"].lower()
    return "title:" + _norm_title(p.get("title", ""))


# ---------------------------------------------------------------------------
# Source 1: Semantic Scholar
# ---------------------------------------------------------------------------

def _search_semanticscholar(query: str, limit: int) -> List[Dict]:
    try:
        headers = {}
        if settings.semanticscholar_api_key:
            headers["x-api-key"] = settings.semanticscholar_api_key
        resp = httpx.get(
            S2_URL,
            params={"query": query, "limit": limit, "fields": S2_FIELDS},
            headers=headers,
            timeout=TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
    except Exception as exc:  # noqa: BLE001 -- API down / rate-limited / no net
        print(f"[paper_search] Semantic Scholar failed: {exc}", flush=True)
        return []

    papers = []
    for item in data:
        ext = item.get("externalIds") or {}
        oa_pdf = item.get("openAccessPdf") or {}
        papers.append(
            {
                "title": item.get("title") or "",
                "authors": [a.get("name", "") for a in item.get("authors", []) if a.get("name")],
                "venue": item.get("venue") or "",
                "year": item.get("year"),
                "abstract": item.get("abstract") or "",
                "doi": ext.get("DOI"),
                "arxiv_id": ext.get("ArXiv"),
                "url": item.get("url") or "",
                "pdf_url": oa_pdf.get("url"),
                "citations": item.get("citationCount") or 0,
                "is_open_access": bool(oa_pdf.get("url")),
            }
        )
    return [p for p in papers if p["title"]]


# ---------------------------------------------------------------------------
# Source 2: arXiv
# ---------------------------------------------------------------------------

def _arxiv_id_from(abs_url: str) -> Optional[str]:
    m = re.search(r"arxiv\.org/abs/([0-9]+\.[0-9]+(?:v\d+)?|[a-z\-]+/\d+)", abs_url or "")
    return m.group(1) if m else None


def _search_arxiv(query: str, limit: int) -> List[Dict]:
    try:
        resp = httpx.get(
            ARXIV_URL,
            params={
                "search_query": f"all:{query}",
                "start": 0,
                "max_results": limit,
                "sortBy": "relevance",
                "sortOrder": "descending",
            },
            timeout=TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
    except Exception as exc:  # noqa: BLE001
        print(f"[paper_search] arXiv failed: {exc}", flush=True)
        return []

    papers = []
    for entry in root.findall("atom:entry", ARXIV_NS):
        abs_url = (entry.findtext("atom:id", default="", namespaces=ARXIV_NS) or "").strip()
        arxiv_id = _arxiv_id_from(abs_url)
        pdf_url = None
        for link in entry.findall("atom:link", ARXIV_NS):
            if link.get("title") == "pdf":
                pdf_url = link.get("href")
                break
        if not pdf_url and arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        authors = [
            (a.findtext("atom:name", default="", namespaces=ARXIV_NS) or "").strip()
            for a in entry.findall("atom:author", ARXIV_NS)
        ]
        published = entry.findtext("atom:published", default="", namespaces=ARXIV_NS) or ""
        year = int(published[:4]) if published[:4].isdigit() else None
        papers.append(
            {
                "title": re.sub(r"\s+", " ", (entry.findtext("atom:title", default="", namespaces=ARXIV_NS) or "")).strip(),
                "authors": [a for a in authors if a],
                "venue": "arXiv",
                "year": year,
                "abstract": re.sub(r"\s+", " ", (entry.findtext("atom:summary", default="", namespaces=ARXIV_NS) or "")).strip(),
                "doi": None,
                "arxiv_id": arxiv_id,
                "url": abs_url,
                "pdf_url": pdf_url,
                "citations": 0,
                "is_open_access": True,
            }
        )
    return [p for p in papers if p["title"]]


# ---------------------------------------------------------------------------
# Source 3: OpenAlex (fallback)
# ---------------------------------------------------------------------------

def _decode_abstract(inverted: Optional[Dict]) -> str:
    if not inverted:
        return ""
    try:
        positions = [(pos, word) for word, idxs in inverted.items() for pos in idxs]
        positions.sort()
        return " ".join(w for _, w in positions)
    except Exception:  # noqa: BLE001
        return ""


def _search_openalex(query: str, limit: int) -> List[Dict]:
    try:
        params = {
            "search": query,
            "per-page": limit,
            "select": "doi,title,publication_year,primary_location,authorships,cited_by_count,abstract_inverted_index,open_access",
        }
        if settings.unpaywall_email:
            params["mailto"] = settings.unpaywall_email  # polite pool
        resp = httpx.get(OPENALEX_URL, params=params, timeout=TIMEOUT_SECONDS)
        resp.raise_for_status()
        results = resp.json().get("results", [])
    except Exception as exc:  # noqa: BLE001
        print(f"[paper_search] OpenAlex failed: {exc}", flush=True)
        return []

    papers = []
    for w in results:
        doi = (w.get("doi") or "").replace("https://doi.org/", "") or None
        loc = w.get("primary_location") or {}
        source = loc.get("source") or {}
        oa = w.get("open_access") or {}
        pdf_url = loc.get("pdf_url") or oa.get("oa_url")
        landing = loc.get("landing_page_url") or ""
        # OpenAlex often mirrors the arXiv copy -- grab its id so S2/arXiv
        # records for the same paper dedupe instead of doubling up.
        arxiv_id = _arxiv_id_from(landing) or _arxiv_id_from(pdf_url or "")
        papers.append(
            {
                "title": w.get("title") or "",
                "authors": [
                    (a.get("author") or {}).get("display_name", "")
                    for a in w.get("authorships", [])
                    if (a.get("author") or {}).get("display_name")
                ],
                "venue": source.get("display_name") or "",
                "year": w.get("publication_year"),
                "abstract": _decode_abstract(w.get("abstract_inverted_index")),
                "doi": doi,
                "arxiv_id": arxiv_id,
                "url": f"https://doi.org/{doi}" if doi else (w.get("id") or ""),
                "pdf_url": pdf_url,
                "citations": w.get("cited_by_count") or 0,
                "is_open_access": bool(oa.get("is_oa")),
            }
        )
    return [p for p in papers if p["title"]]


# ---------------------------------------------------------------------------
# Source 4: Unpaywall -- legal OA PDF lookup by DOI
# ---------------------------------------------------------------------------

def _unpaywall_pdf(doi: str) -> Optional[str]:
    if not doi or not settings.unpaywall_email:
        return None
    try:
        resp = httpx.get(
            f"{UNPAYWALL_URL}/{doi}",
            params={"email": settings.unpaywall_email},
            timeout=TIMEOUT_SECONDS,
        )
        if resp.status_code != 200:
            return None
        best = (resp.json().get("best_oa_location") or {})
        return best.get("url_for_pdf") or best.get("url")
    except Exception:  # noqa: BLE001
        return None


RELEVANCE_SYSTEM = (
    "You are a precise research assistant filtering academic papers by "
    "relevance. Reply with only the requested paper numbers or NONE -- "
    "no explanations, no other text."
)


def filter_relevant_papers(query: str, papers: List[Dict], max_keep: int = 6) -> List[Dict]:
    """LLM relevance gate.

    Scholarly APIs (especially the OpenAlex/arXiv fallbacks) rank loosely:
    a paper can match on a stray keyword like a year in its title while
    being about something entirely different. This asks the LLM to keep
    only papers genuinely about the query. Any failure -> keep the
    original order (never silently drop everything).
    """
    if not papers:
        return papers
    try:
        from app.tools.llm import call_llm  # lazy: avoids import cycles
    except Exception:  # noqa: BLE001
        return papers[:max_keep]

    listing = "\n".join(
        f"[{i + 1}] {p.get('title', '')} -- {(p.get('abstract') or '')[:280]}"
        for i, p in enumerate(papers)
    )
    try:
        resp = call_llm(
            RELEVANCE_SYSTEM,
            f"Research query: {query}\n\nCandidate papers:\n{listing}\n\n"
            "Which of these papers are directly relevant to the research query? "
            "Reply with ONLY the relevant paper numbers, comma-separated "
            f"(e.g. '1,3,5'), at most {max_keep}. If none are relevant, reply 'NONE'.",
        )
    except Exception as exc:  # noqa: BLE001 -- LLM down: don't break research
        print(f"[paper_search] relevance filter failed: {exc}", flush=True)
        return papers[:max_keep]

    if "NONE" in resp.upper():
        print("[paper_search] relevance filter: no papers relevant", flush=True)
        return []

    keep: List[Dict] = []
    for n in re.findall(r"\d+", resp):
        idx = int(n) - 1
        if 0 <= idx < len(papers) and papers[idx] not in keep:
            keep.append(papers[idx])
        if len(keep) >= max_keep:
            break

    print(
        f"[paper_search] relevance filter: kept {len(keep)}/{len(papers)}",
        flush=True,
    )
    return keep if keep else papers[:max_keep]


# ---------------------------------------------------------------------------
# Merge / dedupe / public entry point
# ---------------------------------------------------------------------------

def _merge(primary: List[Dict], secondary: List[Dict]) -> List[Dict]:
    """Dedupe by DOI -> arXiv id -> title. Keeps the richer (primary)
    record, but backfills a missing pdf_url / abstract from the other."""
    merged: Dict[str, Dict] = {}
    order: List[str] = []
    for p in primary + secondary:
        key = _dedup_key(p)
        if key in merged:
            existing = merged[key]
            for field in ("pdf_url", "abstract", "doi", "arxiv_id", "url"):
                if not existing.get(field) and p.get(field):
                    existing[field] = p[field]
            existing["citations"] = max(existing.get("citations", 0), p.get("citations", 0))
            existing["is_open_access"] = existing.get("is_open_access") or p.get("is_open_access")
        else:
            merged[key] = p
            order.append(key)
    return [merged[k] for k in order]


def search_papers(query: str, max_results: int = 6) -> List[Dict]:
    """
    Returns up to max_results normalized paper dicts:
    {title, authors, venue, year, abstract, doi, arxiv_id, url,
     pdf_url, citations, is_open_access}.

    pdf_url is only ever a legal open-access PDF (Semantic Scholar OA,
    arXiv, or Unpaywall). Paywalled papers return metadata + abstract
    with pdf_url=None.
    """
    cached = _cache_get(query, max_results)
    if cached is not None:
        return cached

    fetch_n = max(max_results, 8)

    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_s2 = pool.submit(_search_semanticscholar, query, fetch_n)
        fut_ax = pool.submit(_search_arxiv, query, fetch_n)
        s2_papers = fut_s2.result()
        ax_papers = fut_ax.result()

    if not s2_papers:
        # Semantic Scholar down/rate-limited -- OpenAlex as the fallback
        s2_papers = _search_openalex(query, fetch_n)

    papers = _merge(s2_papers, ax_papers)

    # Resolve legal PDFs for records that still lack one (DOI -> Unpaywall)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {
            pool.submit(_unpaywall_pdf, p["doi"]): p
            for p in papers
            if not p.get("pdf_url") and p.get("doi")
        }
        for fut, p in futs.items():
            try:
                pdf = fut.result()
            except Exception:  # noqa: BLE001
                pdf = None
            if pdf:
                p["pdf_url"] = pdf
                p["is_open_access"] = True

    # Stable sort: papers with an accessible PDF first (most useful),
    # otherwise keep the APIs' relevance order.
    papers.sort(key=lambda p: (not p.get("pdf_url"),))

    print(
        f"[paper_search] query={query!r} -> {len(papers)} papers "
        f"({sum(1 for p in papers if p.get('pdf_url'))} with PDF)",
        flush=True,
    )
    result = papers[:max_results]
    _cache_put(query, max_results, result)
    return result
