import { useRef, useEffect } from "react";

function ArrowUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
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
          {isRunning ? <Spinner /> : <ArrowUp />}
        </button>
      </div>
    </form>
  );
}
