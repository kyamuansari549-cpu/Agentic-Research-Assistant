import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { EASE, DUR, staggerParent, riseChild, viewMotion, Rise } from "./components/motion.jsx";
import Composer from "./components/Composer.jsx";
import AgentTimeline from "./components/AgentTimeline.jsx";
import ReportView from "./components/ReportView.jsx";
import HistorySidebar from "./components/HistorySidebar.jsx";
import ToolsPanel from "./components/ToolsPanel.jsx";
import { startResearch, streamResearch, fetchMe, loginUrl, fetchReport } from "./api";

/* ── Brand mark: custom "R" monogram for Research ─── */
function BrandMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="37" height="37" rx="10.5" fill="#211a15" stroke="#3a2e26" strokeWidth="1.5" />
      <g stroke="#5bb5a5" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
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

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="7" y2="7" />
      <line x1="17" y1="17" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="7" y2="17" />
      <line x1="17" y1="7" x2="19.1" y2="4.9" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
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
  const [activityOpen, setActivityOpen] = useState(false); // agent activity collapsed by default
  const [error, setError] = useState(null);
  const [errorRetryable, setErrorRetryable] = useState(false);
  // Helper pair: stream drops are retryable (backend often finishes the
  // job anyway), other errors are not.
  const showError = (message, retryable = false) => {
    setError(message);
    setErrorRetryable(retryable);
  };
  const clearError = () => {
    setError(null);
    setErrorRetryable(false);
  };
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeReportId, setActiveReportId] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("ra-theme") || "dark");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const closeStreamRef = useRef(null);

  /* Dark / light theme: attribute on <html> + a short cross-fade window */
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    localStorage.setItem("ra-theme", theme);
    root.classList.add("theming");
    const t = setTimeout(() => root.classList.remove("theming"), 340);
    return () => clearTimeout(t);
  }, [theme]);

  /* Account popover: close on outside tap or Escape */
  useEffect(() => {
    if (!userMenuOpen) return;
    function onPointerDown(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target))
        setUserMenuOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

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
    setUserMenuOpen(false);
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
    clearError();
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
    clearError(); setIsRunning(true); setHasStarted(true);
    setActivityOpen(false); // activity stays minimized like Claude's
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
          showError(
            "Connection to the agent server was interrupted. Your report may "
            + "still be generating — check history in a moment, or try again.",
            true, // retryable: starts a fresh job for the same query
          );
          setIsRunning(false);
        },
      });
    } catch (err) {
      showError(err.message === "UNAUTHENTICATED"
        ? "Please sign in to run a research query."
        : err.message);
      setIsRunning(false);
    }
  }

  async function handleSelectHistoryReport(reportId) {
    stopStream();
    clearError(); setSteps([]); setHasStarted(true);
    setActiveReportId(reportId);
    setActivePage("research");
    try {
      const r = await fetchReport(reportId);
      setQuery(r.query); setReport(r.report_markdown); setChartPath(r.chart_path);
    } catch (err) { showError(err.message); }
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
  const isLight = theme === "light";
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <MotionConfig reducedMotion="user">
    <div className={`shell ${sidebarCollapsed ? "shell--collapsed" : ""}`}>
      {/* ── Mobile header ── */}
      <header className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(v => !v)} aria-label="Menu">
          <span /><span /><span />
        </button>
        <span className="mobile-logo">Research Assistant</span>
        <button
          className="theme-icon-btn"
          onClick={toggleTheme}
          aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
          aria-pressed={isLight}
          title={isLight ? "Switch to dark theme" : "Switch to light theme"}
        >
          {isLight ? <MoonIcon /> : <SunIcon />}
        </button>
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
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-pressed={isLight}
            aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
            title={isLight ? "Switch to dark theme" : "Switch to light theme"}
          >
            {isLight ? <MoonIcon /> : <SunIcon />}
            <span className="theme-toggle-label">{isLight ? "Light" : "Dark"} theme</span>
            <span className="theme-switch" aria-hidden="true">
              <span className="theme-knob" />
            </span>
          </button>
          {user ? (
            <div className="user-menu-wrap" ref={userMenuRef}>
              <button
                className="sidebar-user"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Account menu"
                title="Account"
              >
                {user.picture
                  ? <img src={user.picture} alt="" className="sidebar-avatar" referrerPolicy="no-referrer" />
                  : <span className="sidebar-avatar-placeholder">{(user.name || user.email)[0].toUpperCase()}</span>
                }
                <div className="sidebar-user-info">
                  <span className="sidebar-user-name">{user.name || user.email}</span>
                </div>
                <span className={`sidebar-user-chevron ${userMenuOpen ? "open" : ""}`} aria-hidden="true">
                  <ChevronUpIcon />
                </span>
              </button>
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    className="user-menu"
                    role="menu"
                    aria-label="Account"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: EASE }}
                  >
                    <div className="user-menu-head">
                      {user.picture
                        ? <img src={user.picture} alt="" className="user-menu-avatar" referrerPolicy="no-referrer" />
                        : <span className="user-menu-avatar user-menu-avatar-placeholder">{(user.name || user.email)[0].toUpperCase()}</span>
                      }
                      <div className="user-menu-id">
                        <span className="user-menu-name">{user.name || user.email}</span>
                        {user.email && user.name && (
                          <span className="user-menu-email">{user.email}</span>
                        )}
                      </div>
                    </div>
                    <div className="user-menu-divider" aria-hidden="true" />
                    <button
                      className="user-menu-item user-menu-signout"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      <SignOutIcon />
                      Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
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

        {error && (
          <div className="error-bar" role="alert">
            <span className="error-text">{error}</span>
            {errorRetryable && (
              <button
                type="button"
                className="error-retry"
                onClick={() => { clearError(); handleSubmit(); }}
              >
                Try again
              </button>
            )}
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
        {activePage === "research" ? (
          hasStarted ? (
            /* ── Active conversation ── */
            <motion.div key="convo" className="convo" {...viewMotion}>
              <Rise className="convo-query-card">{query}</Rise>

              <Rise className="convo-block activity-block" delay={0.05}>
                <button
                  type="button"
                  className="activity-toggle"
                  onClick={() => setActivityOpen((o) => !o)}
                  aria-expanded={activityOpen}
                  aria-label={activityOpen ? "Collapse agent activity" : "Expand agent activity"}
                >
                  <span className="activity-toggle-label">Agent activity</span>
                  <span className="activity-summary">
                    {steps.length === 0 ? (
                      isRunning ? "Starting…" : "No activity yet"
                    ) : isRunning ? (
                      <>
                        <span className="live-dot" aria-hidden="true" />
                        {steps[steps.length - 1].message}
                      </>
                    ) : (
                      `${steps.length} step${steps.length === 1 ? "" : "s"}`
                    )}
                  </span>
                  <span
                    className={`activity-chevron${activityOpen ? " open" : ""}`}
                    aria-hidden="true"
                  >
                    <ChevronUpIcon />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {activityOpen && (
                    <motion.div
                      key="activity-body"
                      className="activity-body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: EASE }}
                    >
                      <AgentTimeline steps={steps} isRunning={isRunning} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Rise>

              {report && (
                <Rise className="convo-block" delay={0.1}>
                  <span className="eyebrow">Final report</span>
                  <ReportView report={report} chartPath={chartPath} isRunning={isRunning} hasStarted={hasStarted} />
                </Rise>
              )}

              {!isRunning && (
                <Rise className="convo-composer" delay={0.15}>
                  <Composer
                    query={query}
                    setQuery={setQuery}
                    onSubmit={handleSubmit}
                    isRunning={isRunning}
                    placeholder="Ask a follow-up question…"
                  />
                </Rise>
              )}
            </motion.div>
          ) : (
            /* ── Idle hero: staggered entrance ── */
            <motion.div
              key="hero"
              className="hero"
              variants={staggerParent}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -10, transition: { duration: DUR, ease: EASE } }}
            >
              <motion.div className="hero-mark" variants={riseChild}>
                <BrandMark size={46} />
              </motion.div>
              <motion.div className="hero-eyebrow" variants={riseChild}>
                Agentic research · 5 agents
              </motion.div>
              <motion.h1 className="hero-greeting" variants={riseChild}>
                What are we digging into today{firstName ? ", " : ""}
                {firstName && <span className="hero-name">{firstName}</span>}?
              </motion.h1>
              <motion.div className="hero-composer" variants={riseChild}>
                <Composer
                  query={query}
                  setQuery={setQuery}
                  onSubmit={handleSubmit}
                  isRunning={isRunning}
                  autoFocus
                  placeholder="Ask a research question…"
                />
              </motion.div>
              <div className="chip-row">
                {CHIP_TOOLS.map((key, idx) => {
                  const item = NAV_ITEMS.find((n) => n.key === key);
                  return (
                    <motion.button
                      key={key}
                      className="chip"
                      onClick={() => goToPage(key)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.32 + idx * 0.05, duration: 0.22, ease: EASE }}
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      {item.icon}
                      {item.label}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )
        ) : (
          /* ── Tool page ── */
          <motion.div key={`tool-${activePage}`} className="tool-page" {...viewMotion}>
            <Rise className="tool-page-head">
              <h1 className="tool-page-title">{TOOL_META[activePage].title}</h1>
              <p className="tool-page-subtitle">{TOOL_META[activePage].subtitle}</p>
            </Rise>
            <ToolsPanel activeTool={activePage} setActiveTool={setActivePage} />
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
    </MotionConfig>
  );
}
