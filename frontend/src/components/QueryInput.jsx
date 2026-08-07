export default function QueryInput({ query, setQuery, onSubmit, isRunning }) {
  return (
    <form
      className="query-panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isRunning && query.trim()) onSubmit();
      }}
    >
      <label className="eyebrow" htmlFor="query">Research question</label>
      <textarea
        id="query"
        rows={4}
        placeholder="e.g. Analyze the competitive landscape for EV startups in India"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={isRunning}
      />
      <button type="submit" disabled={isRunning || !query.trim()}>
        {isRunning ? "Agents are working…" : "Dispatch the agent team"}
      </button>
    </form>
  );
}
