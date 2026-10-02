"""
AI-content detection tool -- statistical, not vibes.

The old approach asked an LLM to guess AI-likelihood from stylistic
impressions -- ungrounded, the same flaw the original plagiarism checker
had (similar-looking scores for different inputs). This version computes
measurable stylistic features that research has shown to distinguish
AI-generated text from human writing:

- Sentence-length uniformity: LLMs produce unnaturally consistent
  sentence lengths; human writing varies much more (burstiness).
- AI-marker phrases: LLMs overuse certain words ("delve", "tapestry",
  "furthermore", "it's worth noting", ...).
- Transition-filler density: heavy use of formal connectors.

Each feature yields a 0-100 AI-likeness score; the final probability is a
weighted average. Every number in the result is computed from the input
text, so different texts get genuinely different, explainable results.
"""
import re
from typing import Dict, List

# Words/phrases LLMs are known to overuse (from public analyses of
# AI-generated text). Kept disjoint from TRANSITION_FILLERS.
AI_MARKERS = [
    "delve", "tapestry", "ever-evolving", "cutting-edge",
    "in today's fast-paced", "dive into", "unlock", "harness",
    "leverage", "pivotal", "multifaceted", "intricate",
    "comprehensive", "robust", "landscape", "realm",
    "it's worth noting", "it is worth noting",
    "it's important to note", "it is important to note",
    "as an ai language model", "as an ai",
]

TRANSITION_FILLERS = [
    "furthermore", "moreover", "additionally", "in addition",
    "consequently", "therefore", "thus", "hence",
    "in conclusion", "to summarize",
    "firstly", "secondly", "thirdly",
]

MIN_SENTENCES = 3
MIN_WORDS = 60

_DISCLAIMER = (
    "Statistical estimate based on measurable writing features "
    "(sentence uniformity, AI-marker phrases, filler density). "
    "Not 100% accurate -- treat as a probabilistic signal, not a "
    "definitive judgement."
)


def _sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) > 0]


def _words(text: str) -> List[str]:
    return re.findall(r"[a-zA-Z']+", text.lower())


def _count_phrases(low_text: str, phrases: List[str]) -> Dict[str, int]:
    """Case-insensitive counts; returns {phrase: count} for hits only."""
    hits = {}
    for p in phrases:
        c = low_text.count(p)
        if c:
            hits[p] = c
    return hits


def _uniformity_score(sentences: List[str]) -> Dict:
    lens = [len(_words(s)) for s in sentences]
    mean = sum(lens) / len(lens)
    var = sum((x - mean) ** 2 for x in lens) / len(lens)
    cv = (var ** 0.5) / mean if mean else 0.0
    # CV < 0.2 -> very uniform (AI-like); CV > 0.7 -> human-like variation
    score = max(0.0, min(100.0, (0.7 - cv) / 0.5 * 100.0))
    return {
        "score": round(score),
        "cv": round(cv, 2),
        "min_len": min(lens),
        "max_len": max(lens),
        "n": len(sentences),
    }


def _density_score(hits: Dict[str, int], n_words: int, per_100_for_max: float) -> Dict:
    total = sum(hits.values())
    per_100 = total / n_words * 100 if n_words else 0.0
    score = min(100.0, per_100 / per_100_for_max * 100.0)
    return {
        "score": round(score),
        "count": total,
        "per_100": round(per_100, 1),
        "phrases": sorted(hits, key=hits.get, reverse=True)[:6],
    }


def _verdict(prob: int) -> str:
    if prob >= 80:
        return "AI-generated"
    if prob >= 60:
        return "Likely AI"
    if prob >= 40:
        return "Mixed"
    if prob >= 20:
        return "Likely Human"
    return "Human-written"


def detect_ai_content(text: str) -> Dict:
    """
    Analyse *text* with statistical features and return a likelihood
    assessment that it is AI-generated. Returns a dict with keys:
    ai_probability (0-100), verdict, signals_found (each with
    signal/example), overall_summary, disclaimer. Same shape as before,
    so the frontend needs no changes.
    """
    if not text or not text.strip():
        raise ValueError("Input text is empty.")

    clean = text.strip()
    sentences = _sentences(clean)
    words = _words(clean)
    low = clean.lower()

    if len(sentences) < MIN_SENTENCES or len(words) < MIN_WORDS:
        return {
            "ai_probability": None,
            "verdict": "Unknown",
            "signals_found": [],
            "overall_summary": (
                "Text too short for statistical analysis -- need at least "
                f"{MIN_SENTENCES} sentences and {MIN_WORDS} words."
            ),
            "disclaimer": _DISCLAIMER,
            "method": "statistical",
        }

    uni = _uniformity_score(sentences)
    markers = _density_score(_count_phrases(low, AI_MARKERS), len(words), 2.5)
    fillers = _density_score(_count_phrases(low, TRANSITION_FILLERS), len(words), 4.0)

    probability = round(uni["score"] * 0.45 + markers["score"] * 0.35 + fillers["score"] * 0.20)

    signals = [
        {
            "signal": "Sentence-length uniformity",
            "example": (
                f"{uni['n']} sentences ranging {uni['min_len']}-{uni['max_len']} words "
                f"(variation {uni['cv']}; lower = more uniform, more AI-like)"
            ),
        },
    ]
    if markers["count"]:
        signals.append({
            "signal": "AI-marker phrases",
            "example": f"{markers['count']} found ({markers['per_100']}/100 words): {', '.join(markers['phrases'])}",
        })
    else:
        signals.append({
            "signal": "AI-marker phrases",
            "example": "None found -- no typical LLM-favorite words detected",
        })
    if fillers["count"]:
        signals.append({
            "signal": "Transition fillers",
            "example": f"{fillers['count']} found ({fillers['per_100']}/100 words): {', '.join(fillers['phrases'])}",
        })

    top = max(
        [("uniformity", uni["score"]), ("markers", markers["score"]), ("fillers", fillers["score"])],
        key=lambda x: x[1],
    )
    if probability >= 60:
        summary = (
            f"Statistical analysis suggests AI-generated text (score {probability}/100). "
            f"Strongest signal: {top[0]} ({top[1]}/100)."
        )
    elif probability >= 40:
        summary = (
            f"Mixed signals (score {probability}/100) -- the text shows some "
            f"AI-like patterns but isn't conclusive either way."
        )
    else:
        summary = (
            f"Statistical analysis suggests human-written text (score {probability}/100). "
            f"Sentence variation and word choice look natural."
        )

    return {
        "ai_probability": probability,
        "verdict": _verdict(probability),
        "signals_found": signals,
        "overall_summary": summary,
        "disclaimer": _DISCLAIMER,
        "method": "statistical",
    }
