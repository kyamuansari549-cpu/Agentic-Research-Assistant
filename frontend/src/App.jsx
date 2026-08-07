import { useState, useRef } from "react";
import QueryInput from "./components/QueryInput.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import ReportView from "./components/ReportView.jsx";
import { startResearch, streamResearch } from "./api";

export default function App() {
  const [query, setQuery] = useState("");
  const [steps, setSteps] = useState([]);
  const [report, setReport] = useState("");
  const [chartPath, setChartPath] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState(null);
  const closeStreamRef = useRef(null);

  async function handleSubmit() {
    setSteps([]);
    setReport("");
    setChartPath(null);
    setError(null);
    setIsRunning(true);
    setHasStarted(true);

    try {
      const jobId = await startResearch(query);
      closeStreamRef.current = streamResearch(jobId, {
        onStep: (step) => {
          setSteps((prev) => [...prev, step]);
          if (step.agent === "coder" && step.payload?.chart_path) {
            setChartPath(step.payload.chart_path);
          }
        },
        onFinal: (final) => {
          setReport(final.report);
          setIsRunning(false);
        },
        onError: () => {
          setError("Lost connection to the agent server. Is the backend running on :8000?");
          setIsRunning(false);
        },
      });
    } catch (err) {
      setError(err.message);
      setIsRunning(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Multi-agent system · Planner → Researcher → Coder → Writer → Critic</p>
        <h1>Agentic Research &amp; Report Assistant</h1>
        <p className="subtitle">
          Give it a broad question. Five autonomous agents plan, research, run
          code, write, and critique each other until the report holds up.
        </p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="app-grid">
        <section className="left-col">
          <QueryInput
            query={query}
            setQuery={setQuery}
            onSubmit={handleSubmit}
            isRunning={isRunning}
          />
          <AgentTimeline steps={steps} />
        </section>

        <section className="right-col">
          <ReportView
            report={report}
            chartPath={chartPath}
            isRunning={isRunning}
            hasStarted={hasStarted}
          />
        </section>
      </main>
    </div>
  );
}
