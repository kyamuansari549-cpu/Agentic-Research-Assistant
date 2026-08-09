"""
Wires the five agents into a LangGraph StateGraph.

Flow:
  planner -> researcher -> coder -> writer -> critic
                 ^                              |
                 |__________ (REVISE) __________|
                                                 |
                                          (APPROVE) -> finalize -> END

The critic->researcher edge is what makes this a real agentic loop
instead of a fixed pipeline: the graph's path through the agents is
decided at runtime by the critic's judgement, not hard-coded upfront.
"""
from langgraph.graph import StateGraph, END

from app.state import AgentState
from app.agents.planner import planner_node
from app.agents.researcher import researcher_node
from app.agents.coder import coder_node
from app.agents.writer import writer_node
from app.agents.critic import critic_node, route_after_critic


def finalize_node(state: AgentState) -> dict:
    """Promotes the last approved (or cap-hit) draft to the final report.

    Also carries chart_path forward explicitly. main.py's save_report call
    reads chart_path off THIS node's output dict (not the whole accumulated
    graph state), so without this line it was always None here -- the
    chart would show during the live SSE run (the frontend grabs it
    straight off the coder step's payload) but silently never make it
    into the database, which is why it always vanished on refresh /
    when reopened from history, even after the base64 data-URI fix.
    """
    return {
        "final_report": state["draft_report"],
        "chart_path": state.get("chart_path"),
    }


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("planner", planner_node)
    graph.add_node("researcher", researcher_node)
    graph.add_node("coder", coder_node)
    graph.add_node("writer", writer_node)
    graph.add_node("critic", critic_node)
    graph.add_node("finalize", finalize_node)

    graph.set_entry_point("planner")
    graph.add_edge("planner", "researcher")
    graph.add_edge("researcher", "coder")
    graph.add_edge("coder", "writer")
    graph.add_edge("writer", "critic")

    graph.add_conditional_edges(
        "critic",
        route_after_critic,
        {"researcher": "researcher", "finalize": "finalize"},
    )
    graph.add_edge("finalize", END)

    return graph.compile()


research_graph = build_graph()
