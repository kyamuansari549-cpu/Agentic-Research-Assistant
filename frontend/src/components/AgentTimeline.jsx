const AGENT_META = {
  planner: { label: "PLANNER", color: "var(--c-planner)" },
  researcher: { label: "RESEARCHER", color: "var(--c-researcher)" },
  coder: { label: "CODER", color: "var(--c-coder)" },
  writer: { label: "WRITER", color: "var(--c-writer)" },
  critic: { label: "CRITIC", color: "var(--c-critic)" },
  finalize: { label: "FINALIZE", color: "var(--c-finalize)" },
  system: { label: "SYSTEM", color: "var(--c-system)" },
};

export default function AgentTimeline({ steps }) {
  if (steps.length === 0) {
    return (
      <div className="timeline empty">
        <p>The agent team's activity log will appear here once you dispatch a question.</p>
      </div>
    );
  }

  return (
    <ol className="timeline">
      {steps.map((step, i) => {
        const meta = AGENT_META[step.agent] || AGENT_META.system;
        const isRevision = step.message.startsWith("Requested a revision");
        return (
          <li key={i} className={`timeline-entry ${isRevision ? "revision" : ""}`}>
            <span className="dot" style={{ background: meta.color }} />
            <div className="entry-body">
              <div className="entry-head">
                <span className="agent-label" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                {isRevision && <span className="loop-badge">↻ loop back to RESEARCHER</span>}
              </div>
              <p>{step.message}</p>
              {step.payload?.chart_path && (
                <span className="chart-tag">chart.png generated</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
