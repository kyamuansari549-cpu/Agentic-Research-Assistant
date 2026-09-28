/**
 * ToolsPanel — full-width, top-level tabbed interface for all 6 AI tools.
 * Lives in its own "AI Tools" page tab (not a collapsed sidebar widget).
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

// ─── Shared micro-components ───────────────────────────────────────────────

function Spinner() {
  return (
    <span className="tp-spinner" aria-label="Loading">
      <span /><span /><span />
    </span>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div className="tp-error" role="alert">
      <span className="tp-error-icon">⚠</span>
      {msg}
    </div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="tp-copy-btn"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

function ScoreRing({ value, max = 100, highIsGood = true }) {
  if (value == null) return <span className="tp-score-na">N/A</span>;
  const pct = Math.round((value / max) * 100);
  const good = highIsGood ? pct >= 60 : pct < 40;
  const mid  = highIsGood ? pct >= 35 : pct < 65;
  const cls  = good ? "good" : mid ? "mid" : "bad";
  const r = 26, stroke = 5, norm = r - stroke / 2;
  const circ = 2 * Math.PI * norm;
  const dash = circ * (pct / 100);
  return (
    <span className={`tp-score-ring tp-score-ring--${cls}`}>
      <svg width={r * 2} height={r * 2} viewBox={`0 0 ${r * 2} ${r * 2}`}>
        <circle cx={r} cy={r} r={norm} fill="none" strokeWidth={stroke} className="tp-ring-track" />
        <circle
          cx={r} cy={r} r={norm} fill="none" strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${r} ${r})`}
          className="tp-ring-fill"
        />
        <text x={r} y={r + 5} textAnchor="middle" className="tp-ring-text">{value}</text>
      </svg>
    </span>
  );
}

function Badge({ label, variant = "default" }) {
  return <span className={`tp-badge tp-badge--${variant}`}>{label}</span>;
}

function ResultCard({ children }) {
  return <div className="tp-result-card">{children}</div>;
}

// ─── Tab definitions ────────────────────────────────────────────────────────

const TABS = [
  { key: "paraphrase", label: "Paraphrase",      icon: "✏️",  desc: "Rewrite text in a different style" },
  { key: "plagiarism", label: "Plagiarism Check", icon: "🔍",  desc: "Detect copied or suspicious content" },
  { key: "ai-detect",  label: "AI Detection",    icon: "🤖",  desc: "Score AI-generated content likelihood" },
  { key: "pdf-chat",   label: "PDF Chat",         icon: "📄",  desc: "Ask questions about any PDF" },
  { key: "summarize",  label: "Summarize",        icon: "📝",  desc: "Condense text to key points" },
  { key: "gaps",       label: "Research Gaps",    icon: "🔬",  desc: "Find gaps and future directions" },
];

// ─── 1. Paraphrase ──────────────────────────────────────────────────────────

function ParaphraseTab() {
  const [text, setText] = useState("");
  const [style, setStyle] = useState("academic");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await paraphraseText(text, style)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="tp-pane">
      <form onSubmit={run} className="tp-form">
        <div className="tp-form-grid">
          <div className="tp-field tp-field--full">
            <label className="tp-label">Text to paraphrase</label>
            <textarea
              rows={7}
              placeholder="Paste or type your text here…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={loading}
              className="tp-textarea"
            />
          </div>
          <div className="tp-field">
            <label className="tp-label">Style</label>
            <div className="tp-style-pills">
              {["academic", "casual", "concise"].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`tp-style-pill ${style === s ? "tp-style-pill--active" : ""}`}
                  onClick={() => setStyle(s)}
                  disabled={loading}
                >
                  {s === "academic" ? "🎓 Academic" : s === "casual" ? "💬 Casual" : "⚡ Concise"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button type="submit" className="tp-submit-btn" disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Paraphrasing…</> : "✏️ Paraphrase Text"}
        </button>
      </form>
      <ErrorMsg msg={error} />
      {result && (
        <ResultCard>
          <div className="tp-result-header">
            <span className="tp-result-label">Paraphrased · <em>{result.style}</em></span>
            <CopyBtn text={result.paraphrased} />
          </div>
          <div className="tp-compare-grid">
            <div className="tp-compare-col">
              <p className="tp-compare-heading">Original</p>
              <p className="tp-compare-text tp-compare-text--muted">{result.original}</p>
            </div>
            <div className="tp-compare-divider" />
            <div className="tp-compare-col">
              <p className="tp-compare-heading">Rewritten</p>
              <p className="tp-compare-text">{result.paraphrased}</p>
            </div>
          </div>
        </ResultCard>
      )}
    </div>
  );
}

// ─── 2. Plagiarism Check ────────────────────────────────────────────────────

function PlagiarismTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await checkPlagiarism(text)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const riskVariant = result
    ? { Low: "success", Medium: "warning", High: "danger" }[result.risk_level] || "default"
    : "default";

  return (
    <div className="tp-pane">
      <form onSubmit={run} className="tp-form">
        <div className="tp-field">
          <label className="tp-label">Text to check</label>
          <textarea rows={8} placeholder="Paste the text you want to check…"
            value={text} onChange={(e) => setText(e.target.value)}
            disabled={loading} className="tp-textarea" />
        </div>
        <button type="submit" className="tp-submit-btn" disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Analysing…</> : "🔍 Check for Plagiarism"}
        </button>
      </form>
      <ErrorMsg msg={error} />
      {result && (
        <ResultCard>
          <div className="tp-metrics-row">
            <div className="tp-metric">
              <ScoreRing value={result.originality_score} highIsGood={true} />
              <span className="tp-metric-label">Originality</span>
            </div>
            <div className="tp-metric">
              <Badge label={result.risk_level} variant={riskVariant} />
              <span className="tp-metric-label">Risk Level</span>
            </div>
          </div>
          <p className="tp-summary-text">{result.overall_summary}</p>
          {result.suspicious_segments?.length > 0 && (
            <div className="tp-segments">
              <p className="tp-section-title">Suspicious Segments</p>
              {result.suspicious_segments.map((s, i) => (
                <div key={i} className="tp-segment-item">
                  <blockquote className="tp-segment-quote">"{s.segment}"</blockquote>
                  <p className="tp-segment-reason">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
          <p className="tp-disclaimer">{result.disclaimer}</p>
        </ResultCard>
      )}
    </div>
  );
}

// ─── 3. AI Detection ────────────────────────────────────────────────────────

function AIDetectTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await detectAIContent(text)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const verdictVariant = result ? {
    "Human-written": "success", "Likely Human": "success",
    "Mixed": "warning", "Likely AI": "danger", "AI-generated": "danger",
  }[result.verdict] || "default" : "default";

  return (
    <div className="tp-pane">
      <form onSubmit={run} className="tp-form">
        <div className="tp-field">
          <label className="tp-label">Text to analyse</label>
          <textarea rows={8} placeholder="Paste the text to analyse…"
            value={text} onChange={(e) => setText(e.target.value)}
            disabled={loading} className="tp-textarea" />
        </div>
        <button type="submit" className="tp-submit-btn" disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Detecting…</> : "🤖 Detect AI Content"}
        </button>
      </form>
      <ErrorMsg msg={error} />
      {result && (
        <ResultCard>
          <div className="tp-metrics-row">
            <div className="tp-metric">
              <ScoreRing value={result.ai_probability} highIsGood={false} />
              <span className="tp-metric-label">AI Probability</span>
            </div>
            <div className="tp-metric">
              <Badge label={result.verdict} variant={verdictVariant} />
              <span className="tp-metric-label">Verdict</span>
            </div>
          </div>
          <p className="tp-summary-text">{result.overall_summary}</p>
          {result.signals_found?.length > 0 && (
            <div className="tp-segments">
              <p className="tp-section-title">Signals Detected</p>
              <div className="tp-signals-grid">
                {result.signals_found.map((s, i) => (
                  <div key={i} className="tp-signal-chip">
                    <strong>{s.signal}</strong>
                    {s.example && s.example !== "N/A" && (
                      <span className="tp-signal-example">"{s.example}"</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="tp-disclaimer">{result.disclaimer}</p>
        </ResultCard>
      )}
    </div>
  );
}

// ─── 4. PDF Chat ────────────────────────────────────────────────────────────

function PDFChatTab() {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef();
  const chatEndRef = useRef();

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setSession(null); setChatHistory([]);
    try { setSession(await uploadPDF(file)); }
    catch (err) { setError(err.message); }
    finally { setUploading(false); e.target.value = ""; }
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
      setChatHistory((prev) => [...prev, { role: "error", content: err.message }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="tp-pane">
      <input ref={fileInputRef} type="file" accept=".pdf"
        onChange={handleFile} style={{ display: "none" }} id="pdf-upload-input" />

      <label htmlFor="pdf-upload-input"
        className={`tp-pdf-dropzone ${uploading ? "tp-pdf-dropzone--busy" : ""} ${session ? "tp-pdf-dropzone--loaded" : ""}`}>
        {uploading ? (
          <><Spinner /><span>Parsing PDF…</span></>
        ) : session ? (
          <>
            <span className="tp-pdf-icon">📄</span>
            <div className="tp-pdf-info">
              <strong>{session.filename}</strong>
              <span>{session.page_count} pages · {(session.char_count / 1000).toFixed(1)}k chars</span>
            </div>
            <span className="tp-pdf-change">Click to swap file</span>
          </>
        ) : (
          <>
            <span className="tp-pdf-upload-icon">📤</span>
            <span className="tp-pdf-upload-text">Click to upload a PDF</span>
            <span className="tp-pdf-upload-hint">Max 20 MB · Any research paper or document</span>
          </>
        )}
      </label>

      <ErrorMsg msg={error} />

      {session && (
        <div className="tp-chat-container">
          <div className="tp-chat-messages">
            {chatHistory.length === 0 && (
              <div className="tp-chat-empty">
                <span>💬</span>
                <p>Ask anything about <strong>{session.filename}</strong></p>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`tp-chat-msg tp-chat-msg--${msg.role}`}>
                {msg.role === "assistant"
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  : <p>{msg.content}</p>}
              </div>
            ))}
            {chatLoading && (
              <div className="tp-chat-msg tp-chat-msg--assistant tp-chat-thinking">
                <Spinner />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleAsk} className="tp-chat-input-row">
            <input
              type="text"
              className="tp-chat-input"
              placeholder="Ask a question about the PDF…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={chatLoading}
            />
            <button type="submit" className="tp-chat-send" disabled={chatLoading || !question.trim()}>
              {chatLoading ? <Spinner /> : "Send →"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── 5. Summarize ───────────────────────────────────────────────────────────

function SummarizeTab() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("brief");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await summarizeText(text, mode)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const ratio = result
    ? Math.round((1 - result.summary_length / result.original_length) * 100)
    : 0;

  return (
    <div className="tp-pane">
      <form onSubmit={run} className="tp-form">
        <div className="tp-form-grid">
          <div className="tp-field tp-field--full">
            <label className="tp-label">Text to summarize</label>
            <textarea rows={8} placeholder="Paste the text you want to summarize…"
              value={text} onChange={(e) => setText(e.target.value)}
              disabled={loading} className="tp-textarea" />
          </div>
          <div className="tp-field">
            <label className="tp-label">Mode</label>
            <div className="tp-style-pills">
              {[
                { v: "brief",    label: "⚡ Brief",    hint: "3-5 sentences" },
                { v: "detailed", label: "📋 Detailed", hint: "Structured" },
              ].map(({ v, label, hint }) => (
                <button key={v} type="button"
                  className={`tp-style-pill ${mode === v ? "tp-style-pill--active" : ""}`}
                  onClick={() => setMode(v)} disabled={loading}>
                  {label}<span className="tp-pill-hint">{hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <button type="submit" className="tp-submit-btn" disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Summarizing…</> : "📝 Summarize"}
        </button>
      </form>
      <ErrorMsg msg={error} />
      {result && (
        <ResultCard>
          <div className="tp-result-header">
            <span className="tp-result-label">
              Summary · <em>{result.mode}</em> · <strong>{ratio}% shorter</strong>
            </span>
            <CopyBtn text={result.summary} />
          </div>
          <div className="tp-compression-bar">
            <div className="tp-compression-fill" style={{ width: `${100 - ratio}%` }} />
          </div>
          <div className="markdown-body tp-result-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.summary}</ReactMarkdown>
          </div>
        </ResultCard>
      )}
    </div>
  );
}

// ─── 6. Research Gaps ───────────────────────────────────────────────────────

const GAP_TYPE_COLORS = {
  Methodological: "#6c8ebf",
  Conceptual:     "#82b366",
  Empirical:      "#d6a520",
  Theoretical:    "#9c6fba",
  "Future Work":  "#d55b5b",
};

function ResearchGapsTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await findResearchGaps(text)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="tp-pane">
      <form onSubmit={run} className="tp-form">
        <div className="tp-field">
          <label className="tp-label">Research paper or excerpt</label>
          <textarea rows={9}
            placeholder="Paste the full paper text, abstract, or any section…"
            value={text} onChange={(e) => setText(e.target.value)}
            disabled={loading} className="tp-textarea" />
        </div>
        <button type="submit" className="tp-submit-btn" disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Analysing…</> : "🔬 Find Research Gaps"}
        </button>
      </form>
      <ErrorMsg msg={error} />
      {result && (
        <ResultCard>
          <p className="tp-summary-text">{result.overall_assessment}</p>

          {result.gaps?.length > 0 && (
            <div className="tp-gaps-section">
              <p className="tp-section-title">
                Identified Gaps
                <span className="tp-count-badge">{result.gaps.length}</span>
              </p>
              <div className="tp-gaps-grid">
                {result.gaps.map((g, i) => (
                  <div key={i} className="tp-gap-card">
                    <div className="tp-gap-card-top">
                      <span className="tp-gap-title">{g.title}</span>
                      <span className="tp-gap-type"
                        style={{ background: GAP_TYPE_COLORS[g.type] || "#555" }}>
                        {g.type}
                      </span>
                    </div>
                    <p className="tp-gap-desc">{g.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.limitations_noted_by_authors &&
            result.limitations_noted_by_authors !== "None mentioned" && (
            <div className="tp-gaps-section">
              <p className="tp-section-title">Author-noted Limitations</p>
              <p className="tp-body-text">{result.limitations_noted_by_authors}</p>
            </div>
          )}

          {result.suggested_future_directions?.length > 0 && (
            <div className="tp-gaps-section">
              <p className="tp-section-title">Future Directions</p>
              <ul className="tp-future-list">
                {result.suggested_future_directions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}

// ─── Root component ─────────────────────────────────────────────────────────

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
  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const active = TABS.find((t) => t.key === activeTab);

  return (
    <div className="tp-root">
      {/* Sidebar navigation */}
      <aside className="tp-sidebar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tp-nav-item ${activeTab === tab.key ? "tp-nav-item--active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="tp-nav-icon">{tab.icon}</span>
            <div className="tp-nav-text">
              <span className="tp-nav-label">{tab.label}</span>
              <span className="tp-nav-desc">{tab.desc}</span>
            </div>
          </button>
        ))}
      </aside>

      {/* Main content area */}
      <div className="tp-content">
        <div className="tp-content-header">
          <span className="tp-content-icon">{active?.icon}</span>
          <div>
            <h2 className="tp-content-title">{active?.label}</h2>
            <p className="tp-content-desc">{active?.desc}</p>
          </div>
        </div>
        <div className="tp-content-body">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
