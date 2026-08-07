"""
Coder agent.

Looks at what the Researcher found and decides whether the question
would benefit from a small data analysis / chart (e.g. "compare
market share", "growth trend"). If so, it asks the LLM to write a
short, self-contained Python script and actually executes it via the
sandboxed code_executor tool -- this is what makes the pipeline agentic
rather than "LLM writes code nobody runs".
"""
import re
from app.state import AgentState
from app.tools.llm import call_llm
from app.tools.code_executor import run_python_code

DECISION_PROMPT = """You decide whether a research write-up would benefit \
from a small Python data analysis or chart (e.g. numeric comparisons, \
trends, rankings). Reply with exactly one word: YES or NO."""

CODE_PROMPT = """Write a short, self-contained Python script that analyzes \
or visualizes the numeric information implied by the research notes below.
Rules:
- Use only the standard library, pandas, and matplotlib (already installed).
- If you make a chart, save it as exactly "chart.png" in the current directory \
using matplotlib -- do not call plt.show().
- Print a short plain-text summary of the result with print().
- Do not read or write any files other than chart.png.
- Return ONLY the raw Python code, no markdown fences, no explanation."""


def coder_node(state: AgentState) -> dict:
    notes_block = "\n\n".join(state.get("research_notes", []))

    print("[coder] deciding whether a chart/analysis is warranted", flush=True)
    decision = call_llm(DECISION_PROMPT, notes_block).strip().upper()
    if "YES" not in decision:
        return {"code_used": False, "code_output": None, "chart_path": None}

    print("[coder] generating analysis script", flush=True)
    code = call_llm(CODE_PROMPT, notes_block)
    code = re.sub(r"```python|```", "", code).strip()

    print("[coder] running generated script", flush=True)
    output, chart_path = run_python_code(code)

    return {
        "code_used": True,
        "code_output": output,
        "chart_path": chart_path,
    }
