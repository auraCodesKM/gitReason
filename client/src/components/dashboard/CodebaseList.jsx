import { useState } from "react";
import { FolderGit } from "lucide-react";
import { IconBadge } from "./IconBadge";
import { timeAgo } from "../../lib/time";
import { toneForKey } from "../../lib/tone";
import "./codebase-list.css";

const VISIBLE_CAP = 5;

function CodebaseRow({ item }) {
  const [owner, repoName] = item.repoFullName.split("/");
  const metaParts = [];
  if (item.language) metaParts.push(item.language);
  if (item.fileCount != null) metaParts.push(`${item.fileCount} file${item.fileCount === 1 ? "" : "s"}`);
  if (item.nodeCount != null) metaParts.push(`${item.nodeCount} component${item.nodeCount === 1 ? "" : "s"}`);
  if (item.edgeCount != null) metaParts.push(`${item.edgeCount} relationship${item.edgeCount === 1 ? "" : "s"}`);

  const baseHref = `/analyze?repo=${encodeURIComponent(item.repoFullName)}&cached=${item.id}`;
  const tone = toneForKey(item.repoFullName);

  return (
    <div className="codebase-card">
      <div className="codebase-card-main">
        <span className={`repo-avatar repo-avatar-${tone}`}>{repoName[0]?.toUpperCase()}</span>
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
        <div className="dashboard-panel-head-title">
          <IconBadge icon={FolderGit} tone="accent" />
          <h2>Your codebases</h2>
        </div>
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
