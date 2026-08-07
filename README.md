# Agentic Research & Report Assistant

A multi-agent system that takes a broad research question and produces a
cited, structured report — with a **self-correcting loop**: a Critic agent
reviews the draft and can send it back for another research pass before
approving it.

Built to demonstrate real agentic AI patterns (planning, tool use, code
execution, self-critique) rather than a single prompt-response wrapper
around an LLM API.

```
                ┌───────────┐
   query ─────► │  Planner  │
                └─────┬─────┘
                      ▼
                ┌───────────┐
        ┌─────► │Researcher │  (web search + summarize, per sub-task)
        │       └─────┬─────┘
        │             ▼
        │       ┌───────────┐
        │       │   Coder   │  (writes + RUNS python for charts/analysis)
        │       └─────┬─────┘
        │             ▼
        │       ┌───────────┐
        │       │  Writer   │  (drafts the report)
        │       └─────┬─────┘
        │             ▼
        │       ┌───────────┐
        │ REVISE│  Critic   │
        └───────┤(approve or│
                │  revise?) │
                └─────┬─────┘
                      │ APPROVE
                      ▼
                 ┌──────────┐
                 │ Finalize │──► final_report (streamed to UI)
                 └──────────┘
```

## Stack

- **Backend:** FastAPI, LangGraph (agent orchestration as a state graph),
  Groq (fast free-tier LLM inference), DuckDuckGo Search (no API key
  needed), Server-Sent Events for live streaming of agent activity.
- **Frontend:** React + Vite, plain CSS (no framework), live "flight
  recorder" timeline of what each agent is doing, rendered markdown report
  with any generated chart.

- Persist past reports so a user can browse research history.
