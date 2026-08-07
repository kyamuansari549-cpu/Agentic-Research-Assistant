const API_BASE = "https://agentic-research-assistant-2hue.onrender.com";

export async function startResearch(query) {
  const res = await fetch(`${API_BASE}/api/research`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error("Failed to start research job");
  }

  const data = await res.json();
  return data.job_id;
}

// Opens an SSE connection and calls onStep for every agent_step event,
// onFinal once when the final_report event arrives.
export function streamResearch(jobId, { onStep, onFinal, onError }) {
  const source = new EventSource(
    `${API_BASE}/api/research/${jobId}/stream`
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
  const filename = path.split("/").pop();
  return `${API_BASE}/api/charts/${filename}`;
}