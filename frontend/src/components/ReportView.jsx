import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chartUrl } from "../api";

export default function ReportView({ report, chartPath, isRunning, hasStarted }) {
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

  return (
    <div className="report-panel">
      <p className="eyebrow">Final report</p>
      {chartPath && (
        <img className="report-chart" src={chartUrl(chartPath)} alt="Generated data chart" />
      )}
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
      </div>
    </div>
  );
}
