import { motion } from "framer-motion";
import { EASE } from "./motion.jsx";

const AGENT_META = {
  planner: { label: "PLANNER", color: "var(--c-planner)" },
  researcher: { label: "RESEARCHER", color: "var(--c-researcher)" },
  coder: { label: "CODER", color: "var(--c-coder)" },
  writer: { label: "WRITER", color: "var(--c-writer)" },
  critic: { label: "CRITIC", color: "var(--c-critic)" },
  finalize: { label: "FINALIZE", color: "var(--c-finalize)" },
  system: { label: "SYSTEM", color: "var(--c-system)" },
};

function ThinkingDots() {
  return (
    <span className="thinking-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function AgentTimeline({ steps, isRunning }) {
  if (steps.length === 0) {
    return (
      <div className="timeline empty">
        <div className="empty-pulse" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>Dispatch a question and you'll see the team plan, research, and revise it here — step by step.</p>
      </div>
    );
  }

  return (
    <ol className="timeline">
      {steps.map((step, i) => {
        const meta = AGENT_META[step.agent] || AGENT_META.system;
        const isRevision = step.message.startsWith("Requested a revision");
        const isLast = i === steps.length - 1;
        const isActive = isLast && isRunning;
        return (
          <motion.li
            key={i}
            className={`timeline-entry ${isRevision ? "revision" : ""} ${
              isActive ? "active" : ""
            }`}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <span className="dot" style={{ background: meta.color, "--dot-color": meta.color }} />
            <div className="entry-body">
              <div className="entry-head">
                <span className="agent-label" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                {isRevision && <span className="loop-badge">↻ loop back to RESEARCHER</span>}
              </div>
              <p>
                {step.message}
                {isActive && <ThinkingDots />}
              </p>
              {step.payload?.chart_path && (
                <span className="chart-tag">chart.png generated</span>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
