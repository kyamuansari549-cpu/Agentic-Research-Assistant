import { useState, useRef, useEffect } from "react";
import Composer from "./components/Composer.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import AgentPipeline from "./components/AgentPipeline.jsx";
import ReportView from "./components/ReportView.jsx";
import HistorySidebar from "./components/HistorySidebar.jsx";
import ToolsPanel from "./components/ToolsPanel.jsx";
import { startResearch, streamResearch, fetchMe, loginUrl, fetchReport } from "./api";

/* ── Brand mark: custom "R" monogram for Research ─── */
function BrandMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="37" height="37" rx="10.5" fill="#211a15" stroke="#3a2e26" strokeWidth="1.5" />
      <g stroke="#d97757" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="14.5" y1="10.5" x2="14.5" y2="29.5" />
        <path d="M14.5 10.5 H22.8 A6 6 0 0 1 22.8 22.5 H14.5" />
        <line x1="19.5" y1="22.5" x2="27" y2="29.5" />
      </g>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <polyline points="14 9 9 12 14 15" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <polyline points="10 9 15 12 10 15" />
    </svg>
  );
}

const NAV_ITEMS = [
  { key: "research",   label: "Research",        icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )},
  { key: "paraphrase", label: "Paraphrase",       icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  )},
  { key: "plagiarism", label: "Plagiarism Check",  icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )},
  { key: "ai-detect",  label: "AI Detection",     icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h6"/>
    </svg>
  )},
  { key: "pdf-chat",   label: "PDF Chat",          icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  )},
  { key: "summarize",  label: "Summarize",         icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )},
  { key: "gaps",       label: "Research Gaps",     icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )},
];

const TOOL_META = {
  paraphrase: { title: "Paraphrase",        subtitle: "Rewrite text in an academic, casual, or concise style." },
  plagiarism: { title: "Plagiarism Check",  subtitle: "Scan text for originality and get a risk assessment." },
  "ai-detect":{ title: "AI Detection",      subtitle: "Estimate how likely a piece of text is AI-generated." },
  "pdf-chat": { title: "PDF Chat",          subtitle: "Upload a PDF and ask questions about its contents." },
  summarize:  { title: "Summarize",         subtitle: "Condense long text into clear key points." },
  gaps:       { title: "Research Gaps",     subtitle: "Surface open questions and future research directions." },
};

/* Tools shown as quick chips under the hero composer */
const CHIP_TOOLS = ["paraphrase", "plagiarism", "ai-detect", "pdf-chat", "summarize", "gaps"];

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [backendSlow, setBackendSlow] = useState(false);
  const [activePage, setActivePage] = useState("research");
  const [sidebarOpen, setSidebarOpen] = useState(false);       // mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // desktop collapse

  const [query, setQuery] = useState("");
  const [steps, setSteps] = useState([]);
  const [report, setReport] = useState("");
  const [chartPath, setChartPath] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeReportId, setActiveReportId] = useState(null);
  const closeStreamRef = useRef(null);

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

  function stopStream() {
    if (closeStreamRef.current) {
      try { closeStreamRef.current(); } catch { /* noop */ }
      closeStreamRef.current = null;
    }
  }

  function handleNewChat() {
    stopStream();
    setQuery("");
    setSteps([]);
    setReport("");
    setChartPath(null);
    setIsRunning(false);
    setHasStarted(false);
    setError(null);
    setActiveReportId(null);
    setActivePage("research");
    setSidebarOpen(false);
  }

  function goToPage(key) {
    setActivePage(key);
    setSidebarOpen(false);
  }

  async function handleSubmit() {
    stopStream();
    setSteps([]); setReport(""); setChartPath(null);
    setError(null); setIsRunning(true); setHasStarted(true);
    setActiveReportId(null);
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
    stopStream();
    setError(null); setSteps([]); setHasStarted(true);
    setActiveReportId(reportId);
    setActivePage("research");
    try {
      const r = await fetchReport(reportId);
      setQuery(r.query); setReport(r.report_markdown); setChartPath(r.chart_path);
    } catch (err) { setError(err.message); }
  }

  if (!authChecked) {
    return (
      <div className="loading-screen">
        <BrandMark size={40} />
        <div className="loading-logo">Research Assistant</div>
        <div className="loading-bar-wrap"><div className="loading-bar" /></div>
        {backendSlow && <p className="loading-hint">Backend waking up, please wait…</p>}
      </div>
    );
  }

  const firstName = user?.name ? user.name.split(" ")[0] : null;
  const greeting = firstName ? `What's cooking, ${firstName}?` : "What's cooking?";

  return (
    <div className={`shell ${sidebarCollapsed ? "shell--collapsed" : ""}`}>
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
        <div className="sidebar-top">
          <button className="brand" onClick={handleNewChat} title="New chat">
            <BrandMark size={26} />
            <span className="brand-text">Research Assistant</span>
          </button>
          <button
            className="icon-btn collapse-btn"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <CollapseIcon />
          </button>
        </div>

        <button className="new-chat-btn" onClick={handleNewChat}>
          <PlusIcon />
          New chat
        </button>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar-nav-item ${activePage === item.key ? "sidebar-nav-item--active" : ""}`}
              onClick={() => goToPage(item.key)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* History lives INSIDE the sidebar */}
        <HistorySidebar
          onSelect={handleSelectHistoryReport}
          refreshKey={historyRefreshKey}
          activeId={activeReportId}
          onNavigate={() => setSidebarOpen(false)}
        />

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
        <button
          className="reopen-btn"
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <ExpandIcon />
        </button>

        {error && <div className="error-bar" role="alert">{error}</div>}

        {activePage === "research" ? (
          hasStarted ? (
            /* ── Active conversation ── */
            <div className="convo">
              <div className="convo-query-card">{query}</div>

              {(steps.length > 0 || isRunning) && (
                <div className="convo-block">
                  <span className="eyebrow">Agent pipeline</span>
                  <AgentPipeline steps={steps} isRunning={isRunning} />
                </div>
              )}

              <div className="convo-block">
                <span className="eyebrow">Agent activity</span>
                <AgentTimeline steps={steps} isRunning={isRunning} />
              </div>

              <div className="convo-block">
                <span className="eyebrow">Final report</span>
                <ReportView report={report} chartPath={chartPath} isRunning={isRunning} hasStarted={hasStarted} />
              </div>

              <div className="convo-composer">
                <Composer
                  query={query}
                  setQuery={setQuery}
                  onSubmit={handleSubmit}
                  isRunning={isRunning}
                  placeholder="Ask a follow-up question…"
                />
              </div>
            </div>
          ) : (
            /* ── Idle hero, Claude-style ── */
            <div className="hero">
              <div className="hero-mark"><BrandMark size={46} /></div>
              <h1 className="hero-greeting">{greeting}</h1>
              <Composer
                query={query}
                setQuery={setQuery}
                onSubmit={handleSubmit}
                isRunning={isRunning}
                autoFocus
                placeholder="Ask a research question…"
              />
              <div className="chip-row">
                {CHIP_TOOLS.map((key) => {
                  const item = NAV_ITEMS.find((n) => n.key === key);
                  return (
                    <button key={key} className="chip" onClick={() => goToPage(key)}>
                      {item.icon}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          /* ── Tool page ── */
          <div className="tool-page">
            <div className="tool-page-head">
              <h1 className="tool-page-title">{TOOL_META[activePage].title}</h1>
              <p className="tool-page-subtitle">{TOOL_META[activePage].subtitle}</p>
            </div>
            <ToolsPanel activeTool={activePage} setActiveTool={setActivePage} />
          </div>
        )}
      </div>
    </div>
  );
}
