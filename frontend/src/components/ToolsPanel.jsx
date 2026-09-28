/**
 * ToolsPanel — receives activeTool from App and renders the matching tool UI.
 * No emojis anywhere. Clean text-only buttons and labels.
 */
import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  paraphraseText, checkPlagiarism, detectAIContent,
  uploadPDF, chatWithPDF, summarizeText, findResearchGaps,
} from "../api";

// ─── Shared helpers ────────────────────────────────────────────────

function Spinner() {
  return <span className="spinner" aria-label="Loading"><span/><span/><span/></span>;
}

function ErrMsg({ msg }) {
  if (!msg) return null;
  return <div className="tool-error" role="alert">{msg}</div>;
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="copy-btn" onClick={() => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      });
    }}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── 1. Paraphrase ─────────────────────────────────────────────────

function Paraphrase() {
  const [text, setText] = useState("");
  const [style, setStyle] = useState("academic");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run(e) {
    e.preventDefault();
    setLoading(true); setErr(""); setResult(null);
    try { setResult(await paraphraseText(text, style)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={run} className="tool-form">
      <label className="tool-label">Text to paraphrase</label>
      <textarea className="tool-textarea" rows={7}
        placeholder="Paste or type your text here…"
        value={text} onChange={e => setText(e.target.value)} disabled={loading} />

      <label className="tool-label">Style</label>
      <div className="style-pills">
        {["academic", "casual", "concise"].map(s => (
          <button key={s} type="button"
            className={`style-pill ${style === s ? "style-pill--active" : ""}`}
            onClick={() => setStyle(s)} disabled={loading}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <button type="submit" className="primary-btn" disabled={loading || !text.trim()}>
        {loading ? <><Spinner /> Paraphrasing…</> : "Paraphrase Text"}
      </button>

      <ErrMsg msg={err} />

      {result && (
        <div className="result-box">
          <div className="result-header">
            <span className="result-meta">Style: {result.style}</span>
            <CopyBtn text={result.paraphrased} />
          </div>
          <div className="compare-grid">
            <div>
              <p className="compare-label">Original</p>
              <p className="compare-text muted">{result.original}</p>
            </div>
            <div className="compare-divider" />
            <div>
              <p className="compare-label">Rewritten</p>
              <p className="compare-text">{result.paraphrased}</p>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// ─── 2. Plagiarism ─────────────────────────────────────────────────

function Plagiarism() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run(e) {
    e.preventDefault();
    setLoading(true); setErr(""); setResult(null);
    try { setResult(await checkPlagiarism(text)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const riskCls = result
    ? { Low: "badge--green", Medium: "badge--yellow", High: "badge--red" }[result.risk_level] || ""
    : "";

  return (
    <form onSubmit={run} className="tool-form">
      <label className="tool-label">Text to check</label>
      <textarea className="tool-textarea" rows={8}
        placeholder="Paste the text you want to check…"
        value={text} onChange={e => setText(e.target.value)} disabled={loading} />
      <button type="submit" className="primary-btn" disabled={loading || !text.trim()}>
        {loading ? <><Spinner /> Analysing…</> : "Check for Plagiarism"}
      </button>
      <ErrMsg msg={err} />
      {result && (
        <div className="result-box">
          <div className="metrics-row">
            <div className="metric">
              <span className="metric-value">{result.originality_score ?? "—"}<span className="metric-unit">/100</span></span>
              <span className="metric-label">Originality</span>
            </div>
            <div className="metric">
              <span className={`badge ${riskCls}`}>{result.risk_level}</span>
              <span className="metric-label">Risk Level</span>
            </div>
          </div>
          <p className="result-text">{result.overall_summary}</p>
          {result.suspicious_segments?.length > 0 && (
            <div className="segments">
              <p className="section-title">Suspicious segments</p>
              {result.suspicious_segments.map((s, i) => (
                <div key={i} className="segment-item">
                  <p className="segment-quote">"{s.segment}"</p>
                  <p className="segment-reason">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
          <p className="disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </form>
  );
}

// ─── 3. AI Detection ───────────────────────────────────────────────

function AIDetect() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run(e) {
    e.preventDefault();
    setLoading(true); setErr(""); setResult(null);
    try { setResult(await detectAIContent(text)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const vCls = result ? {
    "Human-written": "badge--green", "Likely Human": "badge--green",
    "Mixed": "badge--yellow", "Likely AI": "badge--red", "AI-generated": "badge--red",
  }[result.verdict] || "" : "";

  return (
    <form onSubmit={run} className="tool-form">
      <label className="tool-label">Text to analyse</label>
      <textarea className="tool-textarea" rows={8}
        placeholder="Paste text to check for AI content…"
        value={text} onChange={e => setText(e.target.value)} disabled={loading} />
      <button type="submit" className="primary-btn" disabled={loading || !text.trim()}>
        {loading ? <><Spinner /> Detecting…</> : "Detect AI Content"}
      </button>
      <ErrMsg msg={err} />
      {result && (
        <div className="result-box">
          <div className="metrics-row">
            <div className="metric">
              <span className="metric-value">{result.ai_probability ?? "—"}<span className="metric-unit">%</span></span>
              <span className="metric-label">AI Probability</span>
            </div>
            <div className="metric">
              <span className={`badge ${vCls}`}>{result.verdict}</span>
              <span className="metric-label">Verdict</span>
            </div>
          </div>
          <p className="result-text">{result.overall_summary}</p>
          {result.signals_found?.length > 0 && (
            <div className="segments">
              <p className="section-title">Signals detected</p>
              {result.signals_found.map((s, i) => (
                <div key={i} className="segment-item">
                  <p className="segment-quote">{s.signal}</p>
                  {s.example && s.example !== "N/A" && <p className="segment-reason">"{s.example}"</p>}
                </div>
              ))}
            </div>
          )}
          <p className="disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </form>
  );
}

// ─── 4. PDF Chat ───────────────────────────────────────────────────

function PDFChat() {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();
  const endRef = useRef();

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(""); setSession(null); setHistory([]);
    try { setSession(await uploadPDF(file)); }
    catch (e) { setErr(e.message); }
    finally { setUploading(false); e.target.value = ""; }
  }

  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim() || !session) return;
    const q = question.trim(); setQuestion("");
    setHistory(h => [...h, { role: "user", content: q }]);
    setChatLoading(true);
    try {
      const d = await chatWithPDF(session.session_id, q);
      setHistory(h => [...h, { role: "assistant", content: d.answer }]);
    } catch (e) {
      setHistory(h => [...h, { role: "error", content: e.message }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="tool-form">
      <input ref={fileRef} type="file" accept=".pdf"
        onChange={handleFile} style={{ display: "none" }} id="pdf-input" />

      <label htmlFor="pdf-input"
        className={`pdf-drop ${uploading ? "pdf-drop--busy" : ""} ${session ? "pdf-drop--loaded" : ""}`}>
        {uploading ? <><Spinner /> Parsing PDF…</>
          : session ? (
            <>
              <span className="pdf-filename">{session.filename}</span>
              <span className="pdf-meta">{session.page_count} pages · {(session.char_count / 1000).toFixed(1)}k chars · Click to change</span>
            </>
          ) : (
            <>
              <span className="pdf-upload-title">Upload a PDF</span>
              <span className="pdf-upload-hint">Click to select · Max 20 MB</span>
            </>
          )}
      </label>

      <ErrMsg msg={err} />

      {session && (
        <div className="chat-box">
          <div className="chat-messages">
            {history.length === 0 && (
              <p className="chat-placeholder">Ask anything about {session.filename}</p>
            )}
            {history.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg--${m.role}`}>
                {m.role === "assistant"
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  : <p>{m.content}</p>}
              </div>
            ))}
            {chatLoading && <div className="chat-msg chat-msg--assistant"><Spinner /></div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={handleAsk} className="chat-input-row">
            <input type="text" className="chat-input"
              placeholder="Ask a question…"
              value={question} onChange={e => setQuestion(e.target.value)}
              disabled={chatLoading} />
            <button type="submit" className="chat-send-btn"
              disabled={chatLoading || !question.trim()}>Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── 5. Summarize ──────────────────────────────────────────────────

function Summarize() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("brief");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run(e) {
    e.preventDefault();
    setLoading(true); setErr(""); setResult(null);
    try { setResult(await summarizeText(text, mode)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={run} className="tool-form">
      <label className="tool-label">Text to summarize</label>
      <textarea className="tool-textarea" rows={8}
        placeholder="Paste the text you want to summarize…"
        value={text} onChange={e => setText(e.target.value)} disabled={loading} />

      <label className="tool-label">Mode</label>
      <div className="style-pills">
        {[{ v: "brief", label: "Brief" }, { v: "detailed", label: "Detailed" }].map(({ v, label }) => (
          <button key={v} type="button"
            className={`style-pill ${mode === v ? "style-pill--active" : ""}`}
            onClick={() => setMode(v)} disabled={loading}>
            {label}
          </button>
        ))}
      </div>

      <button type="submit" className="primary-btn" disabled={loading || !text.trim()}>
        {loading ? <><Spinner /> Summarizing…</> : "Summarize"}
      </button>
      <ErrMsg msg={err} />
      {result && (
        <div className="result-box">
          <div className="result-header">
            <span className="result-meta">
              {result.mode} · {result.original_length.toLocaleString()} → {result.summary_length.toLocaleString()} chars
            </span>
            <CopyBtn text={result.summary} />
          </div>
          <div className="markdown-body result-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.summary}</ReactMarkdown>
          </div>
        </div>
      )}
    </form>
  );
}

// ─── 6. Research Gaps ──────────────────────────────────────────────

const GAP_COLORS = {
  Methodological: "#5C8AE6", Conceptual: "#5BAF85",
  Empirical: "#C9962A", Theoretical: "#9B72CF", "Future Work": "#C95E5E",
};

function ResearchGaps() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run(e) {
    e.preventDefault();
    setLoading(true); setErr(""); setResult(null);
    try { setResult(await findResearchGaps(text)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={run} className="tool-form">
      <label className="tool-label">Research paper or excerpt</label>
      <textarea className="tool-textarea" rows={9}
        placeholder="Paste the paper text, abstract, or any section…"
        value={text} onChange={e => setText(e.target.value)} disabled={loading} />
      <button type="submit" className="primary-btn" disabled={loading || !text.trim()}>
        {loading ? <><Spinner /> Analysing…</> : "Find Research Gaps"}
      </button>
      <ErrMsg msg={err} />
      {result && (
        <div className="result-box">
          <p className="result-text">{result.overall_assessment}</p>
          {result.gaps?.length > 0 && (
            <div className="gaps-section">
              <p className="section-title">Identified gaps ({result.gaps.length})</p>
              <div className="gaps-list">
                {result.gaps.map((g, i) => (
                  <div key={i} className="gap-card">
                    <div className="gap-card-top">
                      <span className="gap-title">{g.title}</span>
                      <span className="gap-type-badge"
                        style={{ background: GAP_COLORS[g.type] || "#555" }}>
                        {g.type}
                      </span>
                    </div>
                    <p className="gap-desc">{g.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.limitations_noted_by_authors &&
            result.limitations_noted_by_authors !== "None mentioned" && (
            <div className="gaps-section">
              <p className="section-title">Author-noted limitations</p>
              <p className="result-text">{result.limitations_noted_by_authors}</p>
            </div>
          )}
          {result.suggested_future_directions?.length > 0 && (
            <div className="gaps-section">
              <p className="section-title">Future directions</p>
              <ul className="future-list">
                {result.suggested_future_directions.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

// ─── Tool metadata ─────────────────────────────────────────────────

const TOOLS = {
  paraphrase: { title: "Paraphrase",      desc: "Rewrite text in a different style",               Component: Paraphrase },
  plagiarism: { title: "Plagiarism Check", desc: "Detect copied or suspicious content",             Component: Plagiarism },
  "ai-detect":{ title: "AI Detection",    desc: "Score the likelihood of AI-generated content",    Component: AIDetect   },
  "pdf-chat": { title: "PDF Chat",         desc: "Upload a PDF and ask questions about it",         Component: PDFChat    },
  summarize:  { title: "Summarize",        desc: "Condense text to key points",                     Component: Summarize  },
  gaps:       { title: "Research Gaps",    desc: "Find gaps and future directions in a paper",      Component: ResearchGaps },
};

export default function ToolsPanel({ activeTool, setActiveTool }) {
  const tool = TOOLS[activeTool] || TOOLS["paraphrase"];
  const { title, desc, Component } = tool;

  return (
    <div className="tool-page-inner">
      <div className="tool-page-header">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{desc}</p>
      </div>
      <div className="tool-page-body">
        <Component />
      </div>
    </div>
  );
}
