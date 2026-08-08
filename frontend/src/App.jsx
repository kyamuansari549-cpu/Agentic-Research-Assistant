import { useState, useRef, useEffect } from "react";
import QueryInput from "./components/QueryInput.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import AgentPipeline, { STAGES } from "./components/AgentPipeline.jsx";
import ReportView from "./components/ReportView.jsx";
import HistorySidebar from "./components/HistorySidebar.jsx";
import { startResearch, streamResearch, fetchMe, loginUrl, fetchReport } from "./api";

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [query, setQuery] = useState("");
  const [steps, setSteps] = useState([]);
  const [report, setReport] = useState("");
  const [chartPath, setChartPath] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const closeStreamRef = useRef(null);

  const currentAgent = steps.length ? steps[steps.length - 1].agent : null;

  // On first load: if Google redirected us back with ?token=..., save it.
  // Either way, then check whether we have a valid session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      localStorage.setItem("token", token);
      window.history.replaceState({}, "", window.location.pathname);
    }
    fetchMe()
      .then(setUser)
      .finally(() => setAuthChecked(true));
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null);
  }

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
          setHistoryRefreshKey((k) => k + 1);
        },
        onError: () => {
          setError("Lost connection to the agent server. Is the backend running on :8000?");
          setIsRunning(false);
        },
      });
    } catch (err) {
      if (err.message === "UNAUTHENTICATED") {
        setError("Please sign in to run a research query.");
      } else {
        setError(err.message);
      }
      setIsRunning(false);
    }
  }

  async function handleSelectHistoryReport(reportId) {
    setError(null);
    setSteps([]);
    setHasStarted(true);
    try {
      const r = await fetchReport(reportId);
      setQuery(r.query);
      setReport(r.report_markdown);
      setChartPath(r.chart_path);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!authChecked) {
    return <div className="app-shell app-loading">Loading...</div>;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-top-row">
          <p className="eyebrow breadcrumb">
            <span className="breadcrumb-label">Multi-agent system</span>
            <span className="breadcrumb-sep">·</span>
            {STAGES.map((stage, i) => (
              <span key={stage.key} className="breadcrumb-stage-wrap">
                <span
                  className={`breadcrumb-stage ${currentAgent === stage.key ? "active" : ""}`}
                  style={{ "--stage-color": stage.color }}
                >
                  {stage.label}
                </span>
                {i < STAGES.length - 1 && <span className="breadcrumb-arrow">→</span>}
              </span>
            ))}
          </p>
          {user ? (
            <div className="user-badge">
              {user.picture && (
                <img
                  src={user.picture}
                  alt=""
                  className="avatar"
                  referrerPolicy="no-referrer"
                />
              )}
              <span>{user.name || user.email}</span>
              <button className="link-button" onClick={handleLogout}>Sign out</button>
            </div>
          ) : (
            <a className="login-button" href={loginUrl()}>Sign in with Google</a>
          )}
        </div>
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
          {(steps.length > 0 || isRunning) && (
            <div className="pipeline-panel">
              <AgentPipeline steps={steps} isRunning={isRunning} />
            </div>
          )}
          <AgentTimeline steps={steps} isRunning={isRunning} />
          {user && (
            <HistorySidebar onSelect={handleSelectHistoryReport} refreshKey={historyRefreshKey} />
          )}
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
