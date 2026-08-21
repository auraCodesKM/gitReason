import { useEffect, useState } from "react";
import { LogoMark } from "../sections/LogoMark";
import { apiFetch } from "../lib/api";
import { ActivityCalendar } from "../components/ActivityCalendar/ActivityCalendar";
import "./dashboard-page.css";

const RECENT_LIMIT = 5;

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
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 1.5h8.25a.25.25 0 0 1 .25.25v11.5a.25.25 0 0 1-.25.25H4.5a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z"
        stroke="currentColor" strokeWidth="1.1"
      />
      <path d="M3.5 11.75h9" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function AnalysisRow({ item }) {
  const parts = [];
  if (item.fileCount != null) parts.push(`${item.fileCount} file${item.fileCount === 1 ? "" : "s"}`);
  if (item.nodeCount != null) parts.push(`${item.nodeCount} node${item.nodeCount === 1 ? "" : "s"}`);
  if (item.edgeCount != null) parts.push(`${item.edgeCount} relationship${item.edgeCount === 1 ? "" : "s"}`);

  return (
    <a href={`/analyze?repo=${encodeURIComponent(item.repoFullName)}&cached=${item.id}`} className="dashboard-row">
      <span className="dashboard-row-icon"><RepoIcon /></span>
      <span className="dashboard-row-main">
        <span className="dashboard-row-top">
          <span className="dashboard-row-repo">{item.repoFullName}</span>
          <span className={`dashboard-badge dashboard-badge-${item.status}`}>{item.status}</span>
        </span>
        <span className="dashboard-row-sub">
          Analyzed {timeAgo(item.createdAt)}
          {parts.length > 0 && <> · {parts.join(" · ")}</>}
        </span>
      </span>
      <span className="dashboard-row-open">Open →</span>
    </a>
  );
}

function EmptyState() {
  return (
    <div className="dashboard-empty-state">
      <p className="dashboard-empty-title">Your codebase map starts here.</p>
      <p className="dashboard-empty-copy">
        Analyze a public GitHub repository to generate its architecture, relationships and
        interactive codebase graph.
      </p>
      <a href="/" className="btn btn-solid dashboard-empty-cta">Analyze a repository</a>
    </div>
  );
}

function GeminiKeySection({ hasKey, onChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(null); // null | "saving" | "error"
  const [errorMsg, setErrorMsg] = useState("");

  function save(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setStatus("saving");
    apiFetch("/api/user/gemini-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: value.trim() }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setStatus("error");
          setErrorMsg(data.message || "Couldn't save that key.");
          return;
        }
        setValue("");
        setEditing(false);
        setStatus(null);
        onChange(true);
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Couldn't reach the server.");
      });
  }

  function remove() {
    apiFetch("/api/user/gemini-key", { method: "DELETE" }).then(() => onChange(false));
  }

  const showForm = editing || !hasKey;

  return (
    <div className="dashboard-card">
      <h3 className="dashboard-card-title">AI provider</h3>
      <p className="dashboard-card-hint">Use your own Gemini API quota for repository analysis.</p>

      {showForm ? (
        <form className="dashboard-settings-row" onSubmit={save}>
          <input
            type="password"
            className="dashboard-settings-input"
            placeholder="AIza…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoFocus={editing}
          />
          <button type="submit" className="btn btn-solid" disabled={status === "saving" || !value.trim()}>
            {status === "saving" ? "Checking…" : hasKey ? "Update key" : "Add Gemini key"}
          </button>
          {hasKey && (
            <button type="button" className="dashboard-link" onClick={() => { setEditing(false); setValue(""); setStatus(null); }}>
              Cancel
            </button>
          )}
        </form>
      ) : (
        <div className="dashboard-settings-row">
          <span className="dashboard-key-mask">••••••••••••••••••••••</span>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>Update key</button>
          <button type="button" className="dashboard-link dashboard-link-destructive" onClick={remove}>Remove</button>
        </div>
      )}

      {status === "error" && <p className="dashboard-settings-error">{errorMsg}</p>}
      <p className="dashboard-security-hint">Your key is encrypted and never exposed to the client.</p>
    </div>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllHistory, setShowAllHistory] = useState(false);

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

  function handleSignOut() {
    apiFetch("/api/auth/logout", { method: "POST" }).then(() => {
      window.location.href = "/";
    });
  }

  if (loading || !user) {
    return <div className="dashboard-page dashboard-loading">Loading…</div>;
  }

  const distinctRepos = new Set((history || []).map((h) => h.repoFullName)).size;
  const lastActive = history && history.length > 0 ? timeAgo(history[0].createdAt) : "—";
  const visibleHistory = showAllHistory ? history : (history || []).slice(0, RECENT_LIMIT);

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <a href="/" className="dashboard-logo" aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>
        <a href="/" className="dashboard-back">Back to home</a>
      </header>

      <div className="dashboard-glow" aria-hidden="true" />

      <div className="dashboard-content">
        <section className="dashboard-profile">
          {user.avatarUrl && <img src={user.avatarUrl} alt="" className="dashboard-avatar" />}
          <div className="dashboard-profile-info">
            <h1>{user.username}</h1>
            <p className="dashboard-profile-meta">
              <span className="dashboard-status-dot" aria-hidden="true" />
              GitHub connected
            </p>
          </div>
          <button type="button" className="dashboard-link dashboard-link-destructive dashboard-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </section>

        <section>
          <h2 className="dashboard-section-title">Overview</h2>
          <div className="dashboard-stats">
            <div className="dashboard-card dashboard-stat">
              <span className="dashboard-stat-label">Analyses</span>
              <span className="dashboard-stat-value">{history?.length ?? 0}</span>
            </div>
            <div className="dashboard-card dashboard-stat">
              <span className="dashboard-stat-label">Repositories</span>
              <span className="dashboard-stat-value">{distinctRepos}</span>
            </div>
            <div className="dashboard-card dashboard-stat">
              <span className="dashboard-stat-label">Last active</span>
              <span className="dashboard-stat-value">{lastActive}</span>
            </div>
          </div>
        </section>

        <section>
          <div className="dashboard-section-head">
            <h2 className="dashboard-section-title">Recent analyses</h2>
            {history && history.length > RECENT_LIMIT && (
              <button type="button" className="dashboard-link" onClick={() => setShowAllHistory((v) => !v)}>
                {showAllHistory ? "Show less" : "View all"}
              </button>
            )}
          </div>
          {!history || history.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="dashboard-analyses">
              {visibleHistory.map((item) => (
                <AnalysisRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        {history && history.length > 0 && (
          <section>
            <h2 className="dashboard-section-title">Activity</h2>
            <ActivityCalendar history={history} />
          </section>
        )}

        <section>
          <h2 className="dashboard-section-title">Settings</h2>
          <GeminiKeySection
            hasKey={Boolean(user.hasGeminiKey)}
            onChange={(hasKey) => setUser((u) => ({ ...u, hasGeminiKey: hasKey }))}
          />
        </section>
      </div>
    </div>
  );
}
