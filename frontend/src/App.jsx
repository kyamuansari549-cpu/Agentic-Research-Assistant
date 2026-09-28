import { useState, useRef, useEffect } from "react";
import QueryInput from "./components/QueryInput.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import AgentPipeline, { STAGES } from "./components/AgentPipeline.jsx";
import ReportView from "./components/ReportView.jsx";
import HistorySidebar from "./components/HistorySidebar.jsx";
import ToolsPanel from "./components/ToolsPanel.jsx";
import { startResearch, streamResearch, fetchMe, loginUrl, fetchReport } from "./api";

const NAV_TABS = [
  { key: "research", label: "Research", icon: "⚡" },
  { key: "tools",    label: "AI Tools",  icon: "🧰" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [backendSlow, setBackendSlow] = useState(false);
  const [activeNav, setActiveNav] = useState("research");

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

    const slowTimer = setTimeout(() => setBackendSlow(true), 3000);
    return () => clearTimeout(slowTimer);
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
          setError("Lost connection to the agent server.");
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
    return (
      <div className="app-loading-screen">
        <div className="loading-logo">
          <span className="loading-logo-icon">⚡</span>
          <span className="loading-logo-text">Research Assistant</span>
        </div>
        <div className="loading-bar-wrap">
          <div className="loading-bar" />
        </div>
        {backendSlow && (
          <p className="loading-hint">Backend waking up — this takes ~30s on free tier…</p>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* ── Top navbar ── */}
      <nav className="topnav">
        <div className="topnav-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-name">ResearchAI</span>
          <span className="brand-tag">Multi-Agent</span>
        </div>

        <div className="topnav-tabs">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`topnav-tab ${activeNav === tab.key ? "topnav-tab--active" : ""}`}
              onClick={() => setActiveNav(tab.key)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="topnav-auth">
          {user ? (
            <div className="user-chip">
              {user.picture && (
                <img src={user.picture} alt="" className="user-avatar" referrerPolicy="no-referrer" />
              )}
              <span className="user-name">{user.name || user.email}</span>
              <button className="signout-btn" onClick={handleLogout}>Sign out</button>
            </div>
          ) : (
            <a className="signin-btn" href={loginUrl()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </a>
          )}
        </div>
      </nav>

      {error && (
        <div className="error-banner" role="alert">
          <span>⚠</span> {error}
        </div>
      )}

      {/* ── Main content ── */}
      <main className="app-main">
        {activeNav === "research" ? (
          <div className="research-view">
            {/* Hero section */}
            <div className="research-hero">
              <h1 className="hero-title">
                Agentic Research &amp; Report Assistant
              </h1>
              <p className="hero-sub">
                Five autonomous agents — Planner, Researcher, Coder, Writer, Critic —
                collaborate in real time to produce a fully cited research report.
              </p>
              {/* Agent pipeline breadcrumb */}
              <div className="agent-flow">
                {STAGES.map((stage, i) => (
                  <span key={stage.key} className="agent-flow-wrap">
                    <span
                      className={`agent-flow-step ${currentAgent === stage.key ? "agent-flow-step--active" : ""}`}
                      style={{ "--stage-color": stage.color }}
                    >
                      {stage.label}
                    </span>
                    {i < STAGES.length - 1 && (
                      <span className="agent-flow-arrow">→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* Main research grid */}
            <div className="research-grid">
              {/* Left column */}
              <div className="research-left">
                <QueryInput
                  query={query}
                  setQuery={setQuery}
                  onSubmit={handleSubmit}
                  isRunning={isRunning}
                />

                {(steps.length > 0 || isRunning) && (
                  <div className="card pipeline-card">
                    <AgentPipeline steps={steps} isRunning={isRunning} />
                  </div>
                )}

                <div className="card">
                  <AgentTimeline steps={steps} isRunning={isRunning} />
                </div>

                {user && (
                  <div className="card">
                    <HistorySidebar
                      onSelect={handleSelectHistoryReport}
                      refreshKey={historyRefreshKey}
                    />
                  </div>
                )}
              </div>

              {/* Right column — report */}
              <div className="research-right">
                <ReportView
                  report={report}
                  chartPath={chartPath}
                  isRunning={isRunning}
                  hasStarted={hasStarted}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="tools-view">
            <div className="tools-hero">
              <h1 className="hero-title">AI Research Tools</h1>
              <p className="hero-sub">
                Six powerful tools for paraphrasing, plagiarism detection, AI content
                analysis, PDF chat, summarization, and research gap finding.
              </p>
            </div>
            <ToolsPanel />
          </div>
        )}
      </main>
    </div>
  );
}
