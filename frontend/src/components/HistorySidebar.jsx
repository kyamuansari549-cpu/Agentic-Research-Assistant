import { useEffect, useState } from "react";
import { fetchReports, deleteReport } from "../api";

function TrashIcon() {
  return (
    <svg
      width="13"
      height="13"
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

function ChevronDown() {
  return (
    <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * HistorySidebar — renders as a collapsible "Chats and tasks" section
 * INSIDE the left sidebar, Claude-style.
 */
export default function HistorySidebar({ onSelect, refreshKey, activeId, onNavigate }) {
  const [reports, setReports] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [open, setOpen] = useState(true);

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

  function handleSelect(id) {
    onSelect(id);
    if (onNavigate) onNavigate();
  }

  return (
    <section className={`history-section ${open ? "" : "history-section--closed"}`}>
      <button
        className="history-section-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Chats and tasks
        <ChevronDown />
      </button>
      <div className="history-scroll">
        {reports.length === 0 ? (
          <p className="history-empty">No reports yet — run a query to see it here.</p>
        ) : (
          <ul className="history-list">
            {reports.map((r) => (
              <li key={r.id} className="history-row">
                <button
                  className={`history-item ${activeId === r.id ? "history-item--active" : ""}`}
                  onClick={() => handleSelect(r.id)}
                  title={r.query}
                >
                  <span className="history-query">{r.query}</span>
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
        )}
      </div>
    </section>
  );
}
