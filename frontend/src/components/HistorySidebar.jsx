import { useEffect, useState } from "react";
import { fetchReports } from "../api";

export default function HistorySidebar({ onSelect, refreshKey }) {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    fetchReports()
      .then(setReports)
      .catch(() => setReports([]));
  }, [refreshKey]);

  if (reports.length === 0) {
    return (
      <div className="history-sidebar">
        <h3>Your past reports</h3>
        <p className="muted">No reports yet -- run a query to see it here.</p>
      </div>
    );
  }

  return (
    <div className="history-sidebar">
      <h3>Your past reports</h3>
      <ul className="history-list">
        {reports.map((r) => (
          <li key={r.id}>
            <button className="history-item" onClick={() => onSelect(r.id)}>
              <span className="history-item-main">
                <span className="history-dot" aria-hidden="true" />
                <span className="history-query">{r.query}</span>
              </span>
              <span className="history-date">
                {new Date(r.created_at * 1000).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
