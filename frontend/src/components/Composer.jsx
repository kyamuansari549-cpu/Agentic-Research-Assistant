import { useRef, useEffect } from "react";

function LaunchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="6.6" cy="17.4" r="2.3" fill="currentColor" stroke="none" />
      <line x1="9.6" y1="14.4" x2="17" y2="7" />
      <polyline points="11 7 17 7 17 13" />
    </svg>
  );
}

function Spinner() {
  return (
    <span className="spinner" aria-label="Working">
      <span /><span /><span />
    </span>
  );
}

export default function Composer({
  query,
  setQuery,
  onSubmit,
  isRunning,
  autoFocus = false,
  placeholder = "Ask a research question…",
}) {
  const taRef = useRef(null);

  // Auto-grow the textarea as the user types.
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  }, [query]);

  function submit() {
    if (!isRunning && query.trim()) onSubmit();
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={taRef}
        rows={1}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        disabled={isRunning}
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label="Research question"
      />
      <div className="composer-footer">
        <div className="composer-meta">
          <span className="mode-pill">
            <span className="mode-dot" aria-hidden="true" />
            5 agents
          </span>
        </div>
        <button
          type="submit"
          className="send-btn"
          disabled={isRunning || !query.trim()}
          aria-label={isRunning ? "Agents are working" : "Send question"}
          title={isRunning ? "Agents are working" : "Send question"}
        >
          {isRunning ? <Spinner /> : <LaunchIcon />}
        </button>
      </div>
    </form>
  );
}
