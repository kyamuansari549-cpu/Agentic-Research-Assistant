import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chartUrl } from "../api";

function extractText(children) {
  const list = Array.isArray(children) ? children : [children];
  return list
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (child?.props?.children) return extractText(child.props.children);
      return "";
    })
    .join("");
}

function slugify(text, seen) {
  let base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  if (!base) base = "section";
  let slug = base;
  let n = 2;
  while (seen.has(slug)) {
    slug = `${base}-${n++}`;
  }
  seen.add(slug);
  return slug;
}

export default function ReportView({ report, chartPath, isRunning, hasStarted }) {
  // Build a jump-nav from the report's own H1/H2 lines. Recomputed
  // whenever the report text changes; the heading renderers below use
  // the same slugify sequence so the ids line up with these hrefs.
  const toc = useMemo(() => {
    if (!report) return [];
    const seen = new Set();
    const items = [];
    for (const raw of report.split("\n")) {
      const match = /^(#{1,2})\s+(.*)/.exec(raw.trim());
      if (match) {
        const level = match[1].length;
        const text = match[2].replace(/[*_`]/g, "").trim();
        if (text) items.push({ level, text, slug: slugify(text, seen) });
      }
    }
    return items;
  }, [report]);

  if (!hasStarted) {
    return (
      <div className="report-panel empty">
        <p className="eyebrow">Final report</p>
        <p>Ask a research question on the left. The Writer agent's approved
          report will render here once the Critic signs off.</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="report-panel empty">
        <p className="eyebrow">Final report</p>
        <p>{isRunning ? "Waiting for the agent team to finish…" : "No report yet."}</p>
      </div>
    );
  }

  // Fresh seen-set per render so heading ids match the toc above exactly.
  const headingSeen = new Set();
  const headingComponent = (Tag) =>
    function Heading({ children }) {
      const slug = slugify(extractText(children), headingSeen);
      return <Tag id={slug}>{children}</Tag>;
    };
  const components = {
    h1: headingComponent("h1"),
    h2: headingComponent("h2"),
  };

  return (
    <div className="report-panel" id="report-print-area">
      <div className="report-panel-head">
        <p className="eyebrow">Final report</p>
        <button className="pdf-button no-print" onClick={() => window.print()}>
          ⬇ Download as PDF
        </button>
      </div>
      {toc.length > 1 && (
        <nav className="report-toc no-print" aria-label="Report sections">
          {toc.map((item) => (
            <a
              key={item.slug}
              href={`#${item.slug}`}
              className={`toc-pill toc-level-${item.level}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(item.slug)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {item.text}
            </a>
          ))}
        </nav>
      )}
      {chartPath && (
        <img className="report-chart" src={chartUrl(chartPath)} alt="Generated data chart" />
      )}
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {report}
        </ReactMarkdown>
      </div>
    </div>
  );
}
