const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function loginUrl() {
  return `${API_BASE}/auth/login`;
}

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchReports() {
  const res = await fetch(`${API_BASE}/api/reports`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load history");
  return res.json();
}

export async function fetchReport(reportId) {
  const res = await fetch(`${API_BASE}/api/reports/${reportId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load report");
  return res.json();
}

export async function startResearch(query) {
  const res = await fetch(`${API_BASE}/api/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ query }),
  });
  if (res.status === 401) throw new Error("UNAUTHENTICATED");
  if (!res.ok) throw new Error("Failed to start research job");
  const data = await res.json();
  return data.job_id;
}

// Opens an SSE connection and calls onStep for every agent_step event,
// onFinal once when the final_report event arrives.
// EventSource can't send custom headers, so the JWT goes in the URL
// as a query param instead (see get_current_user_from_query_or_header
// on the backend).
export function streamResearch(jobId, { onStep, onFinal, onError }) {
  const token = localStorage.getItem("token") || "";
  const source = new EventSource(
    `${API_BASE}/api/research/${jobId}/stream?token=${encodeURIComponent(token)}`
  );

  source.addEventListener("agent_step", (e) => {
    onStep(JSON.parse(e.data));
  });

  source.addEventListener("final_report", (e) => {
    onFinal(JSON.parse(e.data));
    source.close();
  });

  source.onerror = () => {
    onError?.();
    source.close();
  };

  return () => source.close();
}

export function chartUrl(path) {
  const filename = path.split(/[\\/]/).pop();
  return `${API_BASE}/api/charts/${filename}`;
}
