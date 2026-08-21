import { useState } from "react";
import { timeAgo } from "../../lib/time";
import "./codebase-list.css";

const VISIBLE_CAP = 5;

function RepoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 1.5h8.25a.25.25 0 0 1 .25.25v11.5a.25.25 0 0 1-.25.25H4.5a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z"
        stroke="currentColor" strokeWidth="1.1"
      />
      <path d="M3.5 11.75h9" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function CodebaseRow({ item }) {
  const [owner, repoName] = item.repoFullName.split("/");
  const metaParts = [];
  if (item.language) metaParts.push(item.language);
  if (item.fileCount != null) metaParts.push(`${item.fileCount} file${item.fileCount === 1 ? "" : "s"}`);
  if (item.nodeCount != null) metaParts.push(`${item.nodeCount} component${item.nodeCount === 1 ? "" : "s"}`);
  if (item.edgeCount != null) metaParts.push(`${item.edgeCount} relationship${item.edgeCount === 1 ? "" : "s"}`);

  const baseHref = `/analyze?repo=${encodeURIComponent(item.repoFullName)}&cached=${item.id}`;

  return (
    <div className="codebase-card">
      <div className="codebase-card-main">
        <span className="codebase-icon"><RepoIcon /></span>
        <div className="codebase-info">
          <h3 className="codebase-name">
            <span className="codebase-owner">{owner}</span> / {repoName}
          </h3>
          {metaParts.length > 0 && <p className="codebase-meta">{metaParts.join(" · ")}</p>}
          <p className="codebase-last">Last analyzed {timeAgo(item.createdAt)}</p>
        </div>
      </div>
      <div className="codebase-actions">
        <a href={baseHref} className="codebase-action">Architecture</a>
        <a href={`${baseHref}&view=graph`} className="codebase-action">Graph</a>
        <span className="codebase-action codebase-action-disabled" title="Coming soon">Knowledge</span>
        <a href={baseHref} className="codebase-action codebase-action-primary">Open →</a>
      </div>
    </div>
  );
}

export function CodebaseList({ codebases }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? codebases : codebases.slice(0, VISIBLE_CAP);

  return (
    <div className="dashboard-panel codebase-list-panel" id="codebases">
      <div className="dashboard-panel-head">
        <h2>Your codebases</h2>
        {codebases.length > VISIBLE_CAP && (
          <button type="button" className="panel-head-action" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `View all (${codebases.length}) →`}
          </button>
        )}
      </div>
      <div className="codebase-list">
        {shown.map((item) => (
          <CodebaseRow key={item.repoFullName} item={item} />
        ))}
      </div>
    </div>
  );
}
