/**
 * ToolsPanel — tabbed interface for all 6 new research tools:
 *   1. Paraphrase
 *   2. Plagiarism Check
 *   3. AI Content Detection
 *   4. PDF to Chat
 *   5. Summarize
 *   6. Research Gaps
 */
import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  paraphraseText,
  checkPlagiarism,
  detectAIContent,
  uploadPDF,
  chatWithPDF,
  summarizeText,
  findResearchGaps,
} from "../api";

// ─── Shared helpers ────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="tools-spinner" aria-label="Loading">
      <span /><span /><span />
    </span>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return <div className="tools-error">{message}</div>;
}

function ScoreBadge({ score, maxScore = 100, highIsGood = true }) {
  if (score == null) return <span className="score-badge score-unknown">N/A</span>;
  const pct = Math.round((score / maxScore) * 100);
  const good = highIsGood ? pct >= 60 : pct < 40;
  const mid = highIsGood ? pct >= 40 : pct < 60;
  const cls = good ? "score-good" : mid ? "score-mid" : "score-bad";
  return <span className={`score-badge ${cls}`}>{score}/{maxScore}</span>;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button className="copy-btn" onClick={handleCopy} title="Copy to clipboard">
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// ─── Tab definitions ───────────────────────────────────────────────────────

const TABS = [
  { key: "paraphrase",  label: "✏️ Paraphrase",      emoji: "✏️" },
  { key: "plagiarism",  label: "🔍 Plagiarism",       emoji: "🔍" },
  { key: "ai-detect",   label: "🤖 AI Detect",        emoji: "🤖" },
  { key: "pdf-chat",    label: "📄 PDF Chat",          emoji: "📄" },
  { key: "summarize",   label: "📝 Summarize",         emoji: "📝" },
  { key: "gaps",        label: "🔬 Research Gaps",     emoji: "🔬" },
];

// ─── Individual tool panels ────────────────────────────────────────────────

/* 1 — Paraphrase */
function ParaphraseTab() {
  const [text, setText] = useState("");
  const [style, setStyle] = useState("academic");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await paraphraseText(text, style);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tool-pane">
      <p className="tool-desc">
        Rewrite your text in a different style — academic, casual, or concise —
        while preserving the original meaning.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <label className="eyebrow">Text to paraphrase</label>
        <textarea
          rows={6}
          placeholder="Paste or type your text here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
        <div className="tool-row">
          <div className="tool-field">
            <label className="eyebrow">Style</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)} disabled={loading}>
              <option value="academic">Academic</option>
              <option value="casual">Casual</option>
              <option value="concise">Concise</option>
            </select>
          </div>
          <button type="submit" disabled={loading || !text.trim()}>
            {loading ? <><Spinner /> Paraphrasing…</> : "Paraphrase"}
          </button>
        </div>
      </form>
      <ErrorBanner message={error} />
      {result && (
        <div className="tool-result">
          <div className="result-header">
            <span className="eyebrow">Result · <em>{result.style}</em> style</span>
            <CopyButton text={result.paraphrased} />
          </div>
          <div className="result-text">{result.paraphrased}</div>
        </div>
      )}
    </div>
  );
}

/* 2 — Plagiarism Check */
function PlagiarismTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await checkPlagiarism(text);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const riskClass = result
    ? { Low: "risk-low", Medium: "risk-medium", High: "risk-high" }[result.risk_level] || ""
    : "";

  return (
    <div className="tool-pane">
      <p className="tool-desc">
        Analyse text for potential plagiarism signals — stylistic inconsistencies,
        unsupported claims, and copied phrases. AI-heuristic, not database-backed.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <label className="eyebrow">Text to check</label>
        <textarea
          rows={7}
          placeholder="Paste the text you want to check…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Analysing…</> : "Check for Plagiarism"}
        </button>
      </form>
      <ErrorBanner message={error} />
      {result && (
        <div className="tool-result">
          <div className="plagiarism-scores">
            <div className="score-card">
              <span className="score-label">Originality Score</span>
              <ScoreBadge score={result.originality_score} highIsGood={true} />
            </div>
            <div className="score-card">
              <span className="score-label">Risk Level</span>
              <span className={`risk-badge ${riskClass}`}>{result.risk_level}</span>
            </div>
          </div>
          <p className="result-summary">{result.overall_summary}</p>
          {result.suspicious_segments?.length > 0 && (
            <div className="segments-list">
              <p className="eyebrow">Suspicious segments</p>
              {result.suspicious_segments.map((seg, i) => (
                <div key={i} className="segment-item">
                  <blockquote className="segment-quote">"{seg.segment}"</blockquote>
                  <p className="segment-reason">{seg.reason}</p>
                </div>
              ))}
            </div>
          )}
          <p className="disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

/* 3 — AI Content Detection */
function AIDetectTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await detectAIContent(text);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const verdictClass = result
    ? {
        "Human-written": "verdict-human",
        "Likely Human": "verdict-likely-human",
        "Mixed": "verdict-mixed",
        "Likely AI": "verdict-likely-ai",
        "AI-generated": "verdict-ai",
      }[result.verdict] || ""
    : "";

  return (
    <div className="tool-pane">
      <p className="tool-desc">
        Estimate how likely a piece of text was generated by an AI language model
        based on stylistic signals. Probabilistic — not a definitive judge.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <label className="eyebrow">Text to analyse</label>
        <textarea
          rows={7}
          placeholder="Paste the text you want to analyse…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Detecting…</> : "Detect AI Content"}
        </button>
      </form>
      <ErrorBanner message={error} />
      {result && (
        <div className="tool-result">
          <div className="plagiarism-scores">
            <div className="score-card">
              <span className="score-label">AI Probability</span>
              <ScoreBadge score={result.ai_probability} highIsGood={false} />
            </div>
            <div className="score-card">
              <span className="score-label">Verdict</span>
              <span className={`verdict-badge ${verdictClass}`}>{result.verdict}</span>
            </div>
          </div>
          <p className="result-summary">{result.overall_summary}</p>
          {result.signals_found?.length > 0 && (
            <div className="segments-list">
              <p className="eyebrow">Signals detected</p>
              {result.signals_found.map((sig, i) => (
                <div key={i} className="segment-item">
                  <strong className="signal-name">{sig.signal}</strong>
                  {sig.example && sig.example !== "N/A" && (
                    <blockquote className="segment-quote">"{sig.example}"</blockquote>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

/* 4 — PDF to Chat */
function PDFChatTab() {
  const [session, setSession] = useState(null);  // {session_id, filename, page_count, preview}
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef();
  const chatEndRef = useRef();

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setSession(null); setChatHistory([]);
    try {
      const data = await uploadPDF(file);
      setSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim() || !session) return;
    const q = question.trim();
    setQuestion("");
    setChatHistory((prev) => [...prev, { role: "user", content: q }]);
    setChatLoading(true);
    try {
      const data = await chatWithPDF(session.session_id, q);
      setChatHistory((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        { role: "error", content: err.message },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="tool-pane">
      <p className="tool-desc">
        Upload a PDF and ask questions about its content. The assistant answers
        strictly from the document — great for research papers and reports.
      </p>

      {/* Upload area */}
      <div className="pdf-upload-area">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          style={{ display: "none" }}
          id="pdf-file-input"
        />
        <label htmlFor="pdf-file-input" className={`pdf-drop-label ${uploading ? "uploading" : ""}`}>
          {uploading ? (
            <><Spinner /> Uploading &amp; parsing…</>
          ) : session ? (
            <>
              <span className="pdf-icon">📄</span>
              <strong>{session.filename}</strong>
              <span className="pdf-meta">{session.page_count} page{session.page_count !== 1 ? "s" : ""} · {(session.char_count / 1000).toFixed(1)}k chars</span>
              <span className="pdf-change">Click to change file</span>
            </>
          ) : (
            <>
              <span className="pdf-icon">📤</span>
              <span>Click to upload a PDF</span>
              <span className="pdf-meta">Max 20 MB</span>
            </>
          )}
        </label>
      </div>

      <ErrorBanner message={error} />

      {/* Chat area */}
      {session && (
        <div className="pdf-chat-area">
          <div className="pdf-chat-messages">
            {chatHistory.length === 0 && (
              <p className="chat-placeholder">Ask anything about <em>{session.filename}</em>…</p>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`chat-bubble chat-${msg.role}`}>
                {msg.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-bubble chat-assistant chat-thinking">
                <Spinner />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleAsk} className="pdf-chat-form">
            <input
              type="text"
              placeholder="Ask a question about the PDF…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={chatLoading}
            />
            <button type="submit" disabled={chatLoading || !question.trim()}>
              {chatLoading ? <Spinner /> : "Ask"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* 5 — Summarize */
function SummarizeTab() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("brief");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await summarizeText(text, mode);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tool-pane">
      <p className="tool-desc">
        Condense any text into a brief 3-5 sentence summary or a structured
        detailed breakdown with key points and conclusions.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <label className="eyebrow">Text to summarize</label>
        <textarea
          rows={7}
          placeholder="Paste the text you want to summarize…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
        <div className="tool-row">
          <div className="tool-field">
            <label className="eyebrow">Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={loading}>
              <option value="brief">Brief (3-5 sentences)</option>
              <option value="detailed">Detailed (structured)</option>
            </select>
          </div>
          <button type="submit" disabled={loading || !text.trim()}>
            {loading ? <><Spinner /> Summarizing…</> : "Summarize"}
          </button>
        </div>
      </form>
      <ErrorBanner message={error} />
      {result && (
        <div className="tool-result">
          <div className="result-header">
            <span className="eyebrow">
              Summary · <em>{result.mode}</em> ·{" "}
              {result.original_length.toLocaleString()} → {result.summary_length.toLocaleString()} chars
            </span>
            <CopyButton text={result.summary} />
          </div>
          <div className="markdown-body result-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.summary}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* 6 — Research Gaps */
function ResearchGapsTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await findResearchGaps(text);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const typeColors = {
    Methodological: "#6c8ebf",
    Conceptual: "#82b366",
    Empirical: "#d6a520",
    Theoretical: "#9c6fba",
    "Future Work": "#d55b5b",
  };

  return (
    <div className="tool-pane">
      <p className="tool-desc">
        Paste a research paper or literature review to automatically surface
        gaps, limitations, unanswered questions, and suggested future directions.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <label className="eyebrow">Paper or excerpt</label>
        <textarea
          rows={8}
          placeholder="Paste the full paper text or a section of it…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Analysing…</> : "Find Research Gaps"}
        </button>
      </form>
      <ErrorBanner message={error} />
      {result && (
        <div className="tool-result">
          <p className="result-summary">{result.overall_assessment}</p>

          {result.gaps?.length > 0 && (
            <div className="gaps-section">
              <p className="eyebrow">Identified gaps ({result.gaps.length})</p>
              <div className="gaps-list">
                {result.gaps.map((gap, i) => (
                  <div key={i} className="gap-card">
                    <div className="gap-card-header">
                      <span className="gap-title">{gap.title}</span>
                      <span
                        className="gap-type-badge"
                        style={{ background: typeColors[gap.type] || "#888" }}
                      >
                        {gap.type}
                      </span>
                    </div>
                    <p className="gap-desc">{gap.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.limitations_noted_by_authors &&
            result.limitations_noted_by_authors !== "None mentioned" && (
              <div className="gaps-section">
                <p className="eyebrow">Author-noted limitations</p>
                <p className="result-text">{result.limitations_noted_by_authors}</p>
              </div>
            )}

          {result.suggested_future_directions?.length > 0 && (
            <div className="gaps-section">
              <p className="eyebrow">Suggested future directions</p>
              <ul className="future-directions">
                {result.suggested_future_directions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root ToolsPanel component ─────────────────────────────────────────────

const TAB_COMPONENTS = {
  paraphrase: ParaphraseTab,
  plagiarism: PlagiarismTab,
  "ai-detect": AIDetectTab,
  "pdf-chat": PDFChatTab,
  summarize: SummarizeTab,
  gaps: ResearchGapsTab,
};

export default function ToolsPanel() {
  const [activeTab, setActiveTab] = useState("paraphrase");
  const [isOpen, setIsOpen] = useState(false);

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className={`tools-panel ${isOpen ? "tools-panel--open" : ""}`}>
      {/* Toggle button */}
      <button
        className="tools-toggle"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <span className="tools-toggle-icon">{isOpen ? "▾" : "▸"}</span>
        Research Tools
        <span className="tools-badge">{TABS.length}</span>
      </button>

      {isOpen && (
        <div className="tools-body">
          {/* Tab bar */}
          <div className="tools-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`tools-tab ${activeTab === tab.key ? "tools-tab--active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="tab-emoji">{tab.emoji}</span>
                <span className="tab-label">{tab.label.replace(/^\S+\s/, "")}</span>
              </button>
            ))}
          </div>

          {/* Active tab content */}
          <div className="tools-content" role="tabpanel">
            <ActiveComponent />
          </div>
        </div>
      )}
    </div>
  );
}
