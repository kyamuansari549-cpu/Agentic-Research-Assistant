import { useEffect, useState } from "react";
import { fetchReports, deleteReport } from "../api";

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export default function HistorySidebar({ onSelect, refreshKey }) {
  const [reports, setReports] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchReports()
      .then(setReports)
      .catch(() => setReports([]));
  }, [refreshKey]);

  async function handleDelete(e, reportId) {
    // Stop the click from bubbling up to the parent history-item
    // button, which would otherwise also fire onSelect() and open
    // the report we're about to delete.
    e.stopPropagation();

    const confirmed = window.confirm("Delete this report? This can't be undone.");
    if (!confirmed) return;

    setDeletingId(reportId);
    try {
      await deleteReport(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      window.alert("Couldn't delete this report. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

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
          <li key={r.id} className="history-row">
            <button className="history-item" onClick={() => onSelect(r.id)}>
              <span className="history-item-main">
                <span className="history-dot" aria-hidden="true" />
                <span className="history-query">{r.query}</span>
              </span>
              <span className="history-date">
                {new Date(r.created_at * 1000).toLocaleDateString()}
              </span>
            </button>
            <button
              className="history-delete-btn"
              onClick={(e) => handleDelete(e, r.id)}
              disabled={deletingId === r.id}
              aria-label={`Delete report: ${r.query}`}
              title="Delete this report"
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
