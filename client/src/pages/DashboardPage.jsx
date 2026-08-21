import { useEffect, useState } from "react";
import { Agentation } from "agentation";
import { LogoMark } from "../sections/LogoMark";
import { apiFetch } from "../lib/api";
import { AnalyzeRepoButton } from "../components/AnalyzeRepoButton";
import { AccountMenu } from "../components/AccountMenu";
import "./dashboard-page.css";

function timeAgo(ts) {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
}

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

// One codebase GitReason has actually analyzed — not a generic list row.
// Every action here is real: Architecture/Graph/Open all deep-link into
// the existing AnalyzePage views. Knowledge is visually reserved for a
// future concept but isn't a link — nothing to open yet.
function CodebaseCard({ item }) {
  const [owner, repoName] = item.repoFullName.split("/");
  const metaParts = [];
  if (item.language) metaParts.push(item.language);
  if (item.fileCount != null) metaParts.push(`${item.fileCount} file${item.fileCount === 1 ? "" : "s"}`);
  if (item.nodeCount != null) metaParts.push(`${item.nodeCount} component${item.nodeCount === 1 ? "" : "s"}`);

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

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Landed here straight from a direct "Sign in with GitHub" (no repo
    // picked yet) — clean the query string the same way App.jsx does for
    // the repo-scoped success redirect.
    if (new URLSearchParams(window.location.search).get("auth") === "success") {
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  useEffect(() => {
    apiFetch("/api/user/me")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          window.location.href = "/sign";
          return;
        }
        setUser(data.user);
        return apiFetch("/api/user/history").then((res) => res.json());
      })
      .then((data) => {
        if (data) setHistory(data.history);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !user) {
    return <div className="dashboard-page dashboard-loading">Loading…</div>;
  }

  // "Codebases you've explored", not "analyses you've run" — one card per
  // repository, most-recently-analyzed first. history is already sorted
  // DESC by createdAt, so the first occurrence of each repo is its latest.
  const codebases = [];
  const seen = new Set();
  for (const item of history || []) {
    if (seen.has(item.repoFullName)) continue;
    seen.add(item.repoFullName);
    codebases.push(item);
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <a href="/" className="dashboard-logo" aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>
        <div className="dashboard-header-actions">
          <AnalyzeRepoButton />
          <AccountMenu user={user} />
        </div>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-heading">
          <h1>Your codebases</h1>
          <p>Codebases you&rsquo;ve explored with GitReason.</p>
        </div>

        {codebases.length === 0 ? (
          <div className="dashboard-empty">
            <p className="dashboard-empty-title">Map your first codebase</p>
            <p className="dashboard-empty-copy">
              Give GitReason a GitHub repository and we&rsquo;ll map its architecture,
              relationships and code.
            </p>
            <AnalyzeRepoButton label="Analyze repository" className="dashboard-empty-cta" />
          </div>
        ) : (
          <div className="codebase-list">
            {codebases.map((item) => (
              <CodebaseCard key={item.repoFullName} item={item} />
            ))}
          </div>
        )}
      </div>

      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </div>
  );
}
