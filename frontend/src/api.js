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

export async function deleteReport(reportId) {
  const res = await fetch(`${API_BASE}/api/reports/${reportId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete report");
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


// ─────────────────────────────────────────────────────────────────────────────
// Tools API — Paraphrase, Plagiarism, AI Detect, PDF, Summarize, Gaps
// ─────────────────────────────────────────────────────────────────────────────

export async function paraphraseText(text, style = "academic") {
  const res = await fetch(`${API_BASE}/api/paraphrase`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text, style }),
  });
  if (res.status === 401) throw new Error("UNAUTHENTICATED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Paraphrase failed");
  }
  return res.json();
}

export async function checkPlagiarism(text) {
  const res = await fetch(`${API_BASE}/api/plagiarism-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (res.status === 401) throw new Error("UNAUTHENTICATED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Plagiarism check failed");
  }
  return res.json();
}

export async function detectAIContent(text) {
  const res = await fetch(`${API_BASE}/api/ai-detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (res.status === 401) throw new Error("UNAUTHENTICATED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "AI detection failed");
  }
  return res.json();
}

export async function uploadPDF(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/pdf-upload`, {
    method: "POST",
    headers: authHeaders(),   // no Content-Type — browser sets multipart boundary
    body: formData,
  });
  if (res.status === 401) throw new Error("UNAUTHENTICATED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "PDF upload failed");
  }
  return res.json();
}

export async function chatWithPDF(sessionId, question) {
  const res = await fetch(`${API_BASE}/api/pdf-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, question }),
  });
  if (res.status === 401) throw new Error("UNAUTHENTICATED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "PDF chat failed");
  }
  return res.json();
}

export async function summarizeText(text, mode = "brief") {
  const res = await fetch(`${API_BASE}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text, mode }),
  });
  if (res.status === 401) throw new Error("UNAUTHENTICATED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Summarization failed");
  }
  return res.json();
}

export async function findResearchGaps(text) {
  const res = await fetch(`${API_BASE}/api/research-gaps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (res.status === 401) throw new Error("UNAUTHENTICATED");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Research gap analysis failed");
  }
  return res.json();
}
