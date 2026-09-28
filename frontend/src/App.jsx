import { useState, useRef, useEffect } from "react";
import QueryInput from "./components/QueryInput.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import AgentPipeline, { STAGES } from "./components/AgentPipeline.jsx";
import ReportView from "./components/ReportView.jsx";
import HistorySidebar from "./components/HistorySidebar.jsx";
import ToolsPanel from "./components/ToolsPanel.jsx";
import { startResearch, streamResearch, fetchMe, loginUrl, fetchReport } from "./api";

const NAV_ITEMS = [
  { key: "research", label: "Research" },
  { key: "paraphrase", label: "Paraphrase" },
  { key: "plagiarism", label: "Plagiarism Check" },
  { key: "ai-detect", label: "AI Detection" },
  { key: "pdf-chat", label: "PDF Chat" },
  { key: "summarize", label: "Summarize" },
  { key: "gaps", label: "Research Gaps" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [backendSlow, setBackendSlow] = useState(false);
  const [activePage, setActivePage] = useState("research");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    fetchMe().then(setUser).finally(() => setAuthChecked(true));
    const t = setTimeout(() => setBackendSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  async function handleSubmit() {
    setSteps([]); setReport(""); setChartPath(null);
    setError(null); setIsRunning(true); setHasStarted(true);
    try {
      const jobId = await startResearch(query);
      closeStreamRef.current = streamResearch(jobId, {
        onStep: (step) => {
          setSteps((prev) => [...prev, step]);
          if (step.agent === "coder" && step.payload?.chart_path)
            setChartPath(step.payload.chart_path);
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
      setError(err.message === "UNAUTHENTICATED"
        ? "Please sign in to run a research query."
        : err.message);
      setIsRunning(false);
    }
  }

  async function handleSelectHistoryReport(reportId) {
    setError(null); setSteps([]); setHasStarted(true);
    try {
      const r = await fetchReport(reportId);
      setQuery(r.query); setReport(r.report_markdown); setChartPath(r.chart_path);
    } catch (err) { setError(err.message); }
  }

  if (!authChecked) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">Research Assistant</div>
        <div className="loading-bar-wrap"><div className="loading-bar" /></div>
        {backendSlow && <p className="loading-hint">Backend waking up, please wait…</p>}
      </div>
    );
  }

  const isToolPage = activePage !== "research";

  return (
    <div className="shell">
      {/* ── Mobile header ── */}
      <header className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(v => !v)} aria-label="Menu">
          <span /><span /><span />
        </button>
        <span className="mobile-logo">Research Assistant</span>
      </header>

      {/* ── Sidebar overlay on mobile ── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Left sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <span className="sidebar-logo-mark">R</span>
          <span className="sidebar-logo-text">Research Assistant</span>
        </div>

        {/* Nav items */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar-nav-item ${activePage === item.key ? "sidebar-nav-item--active" : ""}`}
              onClick={() => { setActivePage(item.key); setSidebarOpen(false); }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom: user / login */}
        <div className="sidebar-bottom">
          {user ? (
            <div className="sidebar-user">
              {user.picture
                ? <img src={user.picture} alt="" className="sidebar-avatar" referrerPolicy="no-referrer" />
                : <span className="sidebar-avatar-placeholder">{(user.name || user.email)[0].toUpperCase()}</span>
              }
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{user.name || user.email}</span>
                <button className="sidebar-signout" onClick={handleLogout}>Sign out</button>
              </div>
            </div>
          ) : (
            <a className="sidebar-login-btn" href={loginUrl()}>
              Sign in with Google
            </a>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="main-content">
        {error && <div className="error-bar" role="alert">{error}</div>}

        {activePage === "research" ? (
          <div className="research-page">
            {/* Hero */}
            <div className="page-header">
              <h1 className="page-title">Agentic Research Assistant</h1>
              <p className="page-subtitle">
                Five autonomous agents plan, research, run code, write, and critique until the report holds up.
              </p>
              <div className="agent-flow">
                {STAGES.map((s, i) => (
                  <span key={s.key} className="agent-flow-wrap">
                    <span
                      className={`agent-flow-step ${currentAgent === s.key ? "agent-flow-step--active" : ""}`}
                      style={{ "--sc": s.color }}
                    >{s.label}</span>
                    {i < STAGES.length - 1 && <span className="agent-flow-sep">›</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div className="research-grid">
              <div className="research-left">
                <QueryInput query={query} setQuery={setQuery} onSubmit={handleSubmit} isRunning={isRunning} />
                {(steps.length > 0 || isRunning) && (
                  <div className="panel">
                    <AgentPipeline steps={steps} isRunning={isRunning} />
                  </div>
                )}
                <div className="panel">
                  <AgentTimeline steps={steps} isRunning={isRunning} />
                </div>
                {user && (
                  <div className="panel">
                    <HistorySidebar onSelect={handleSelectHistoryReport} refreshKey={historyRefreshKey} />
                  </div>
                )}
              </div>
              <div className="research-right">
                <ReportView report={report} chartPath={chartPath} isRunning={isRunning} hasStarted={hasStarted} />
              </div>
            </div>
          </div>
        ) : (
          <div className="tool-page">
            <ToolsPanel activeTool={activePage} setActiveTool={setActivePage} />
          </div>
        )}
      </div>
    </div>
  );
}
