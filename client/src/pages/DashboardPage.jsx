import { useEffect, useState } from "react";
import { LogoMark } from "../sections/LogoMark";
import { apiFetch } from "../lib/api";
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

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <a href="/" className="dashboard-logo" aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>
        <a href="/" className="dashboard-back">Back to home</a>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-identity">
          {user.avatarUrl && <img src={user.avatarUrl} alt="" className="dashboard-avatar" />}
          <div>
            <h1>{user.username}</h1>
            <button type="button" className="dashboard-signout" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <span className="dashboard-stat-value">{history?.length ?? 0}</span>
            <span className="dashboard-stat-label">Analyses</span>
          </div>
          <div className="dashboard-stat">
            <span className="dashboard-stat-value">{distinctRepos}</span>
            <span className="dashboard-stat-label">Repositories</span>
          </div>
          <div className="dashboard-stat">
            <span className="dashboard-stat-value">{lastActive}</span>
            <span className="dashboard-stat-label">Last active</span>
          </div>
        </div>

        <h2 className="dashboard-section-title">History</h2>
        {!history || history.length === 0 ? (
          <p className="dashboard-empty">No repositories analyzed yet.</p>
        ) : (
          <ul className="dashboard-history">
            {history.map((item) => (
              <li key={item.id}>
                <a
                  href={`/analyze?repo=${encodeURIComponent(item.repoFullName)}&cached=${item.id}`}
                  className="dashboard-history-item"
                >
                  <span className="dashboard-history-repo">{item.repoFullName}</span>
                  <span className={`dashboard-history-status status-${item.status}`}>{item.status}</span>
                  <span className="dashboard-history-time">{timeAgo(item.createdAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
