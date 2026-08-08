export const STAGES = [
  { key: "planner", label: "Planner", color: "var(--c-planner)" },
  { key: "researcher", label: "Researcher", color: "var(--c-researcher)" },
  { key: "coder", label: "Coder", color: "var(--c-coder)" },
  { key: "writer", label: "Writer", color: "var(--c-writer)" },
  { key: "critic", label: "Critic", color: "var(--c-critic)" },
];

// Shows how far the agent team has gotten through the pipeline for the
// query currently running/displayed. A stage is "touched" once any step
// from it has arrived, and "active" only while it's the most recent one
// and the job is still running.
export default function AgentPipeline({ steps, isRunning }) {
  if (steps.length === 0 && !isRunning) return null;

  const seen = new Set(steps.map((s) => s.agent));
  const lastAgent = steps.length ? steps[steps.length - 1].agent : null;

  return (
    <ol className="agent-pipeline" aria-label="Agent pipeline progress">
      {STAGES.map((stage) => {
        const isTouched = seen.has(stage.key);
        const isActive = isRunning && stage.key === lastAgent;
        return (
          <li
            key={stage.key}
            className={`pipeline-step ${isTouched ? "touched" : ""} ${isActive ? "active" : ""}`}
            style={{ "--dot-color": stage.color }}
          >
            <span className="pipeline-dot" />
            <span className="pipeline-label">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
