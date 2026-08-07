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

## Why this project is a good interview talking point

- **It's a real agent loop, not a chain.** The Critic → Researcher edge is
  a *conditional* edge in the LangGraph graph — the path through the system
  is decided at runtime, bounded by `MAX_REVISION_CYCLES` so it can't loop
  forever. This is the detail most "agent" student projects skip.
- **The Coder agent actually executes code** in a subprocess sandbox
  (`app/tools/code_executor.py`), not just prints code as text — you can
  speak to real design trade-offs (timeouts, isolation, what a production
  sandbox would add: containers, no filesystem/network access, resource
  limits).
- **Everything is grounded**, not hallucinated: the Researcher summarizes
  only from retrieved search snippets, and the Writer is explicitly told
  not to invent facts. Good springboard to talk about grounding/RAG
  concepts you already know from your other project.
- **Resilient tool use**: the search tool prefers Tavily (a reliable API
  built for LLM agents) when a key is configured, and falls back to
  DuckDuckGo otherwise — worth mentioning if asked about failure handling,
  since free DDG scraping is known to rate-limit/block unpredictably.
- **Streaming architecture**: SSE was chosen over polling so the frontend
  reflects agent state live — worth explaining the trade-off vs WebSockets
  (SSE is simpler/one-directional, which is all this needs).

## Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# edit .env and paste a free key from https://console.groq.com
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, enter a research question (e.g. *"Analyze the
competitive landscape for EV startups in India"*), and watch the agents work.

## Security notes (for your interview / viva)

This is a portfolio-grade sandbox, not production-grade. If asked "how
would you harden this":
- Run the Coder agent's code in a container (Docker/gVisor/Firecracker)
  with no network access and a read-only filesystem, not a bare subprocess.
- Rate-limit and auth-gate the `/api/research` endpoint.
- Move the in-memory job store to Redis so jobs survive a restart and can
  scale across multiple backend instances.
- Add a max-token / cost budget per job since every research question fans
  out into several LLM calls.

## Possible extensions

- Swap DuckDuckGo for Tavily or a real search API for more reliable results.
- Let the Planner's sub-tasks run in parallel (LangGraph supports fan-out/
  fan-in) instead of sequentially, for faster responses.
- Add a PDF export of the final report (reuse the `pdf` skill / a library
  like `reportlab` or `weasyprint`).
- Persist past reports so a user can browse research history.
