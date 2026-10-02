"""
Shared state object passed between every node in the LangGraph graph.
This is the single source of truth the whole agent team reads/writes.
"""
from typing import TypedDict, List, Dict, Optional


class SubTask(TypedDict):
    id: str
    description: str
    findings: Optional[str]


class AgentState(TypedDict, total=False):
    job_id: str
    query: str

    # planner output
    subtasks: List[SubTask]

    # researcher output
    research_notes: List[str]
    sources: List[str]
    papers: List[Dict]  # real papers from paper_search (title/authors/venue/year/abstract/pdf)

    # coder output
    code_used: bool
    code_output: Optional[str]
    chart_path: Optional[str]

    # writer output
    draft_report: str
    final_report: str

    # critic output / control flow
    critic_feedback: str
    approved: bool
    revision_count: int
