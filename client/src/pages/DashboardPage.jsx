import { useEffect, useMemo, useState } from "react";
import { Agentation } from "agentation";
import { FolderGit, FileText, Boxes, Network } from "lucide-react";
import { apiFetch } from "../lib/api";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { Sidebar } from "../components/dashboard/Sidebar";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import { MetricCard } from "../components/dashboard/MetricCard";
import { GithubActivity } from "../components/dashboard/GithubActivity";
import { RecentActivity } from "../components/dashboard/RecentActivity";
import { CodebaseList } from "../components/dashboard/CodebaseList";
import { CodebaseComposition } from "../components/dashboard/CodebaseComposition";
import { ArchitectureSnapshot } from "../components/dashboard/ArchitectureSnapshot";
import { RecentAnalyses } from "../components/dashboard/RecentAnalyses";
import { AnalyzeRepoButton } from "../components/AnalyzeRepoButton";
import "./dashboard-page.css";

// history is already sorted DESC by createdAt - the first occurrence of
// each repo in that order is its most recent analysis.
function dedupeLatest(history) {
  const out = [];
  const seen = new Set();
  for (const item of history) {
    if (seen.has(item.repoFullName)) continue;
    seen.add(item.repoFullName);
    out.push(item);
  }
  return out;
}

// An item is a first-time "Analyzed" if no older entry shares its repo;
// otherwise it's a "Re-analyzed" of something already known.
function buildActivityFeed(history) {
  const oldestIdByRepo = new Map();
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (!oldestIdByRepo.has(item.repoFullName)) oldestIdByRepo.set(item.repoFullName, item.id);
  }
  return history.slice(0, 6).map((item) => ({
    ...item,
    kind: oldestIdByRepo.get(item.repoFullName) === item.id ? "analyzed" : "reanalyzed",
  }));
}

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState(null);
  const [activity, setActivity] = useState(null);
  const [latestDetail, setLatestDetail] = useState(null);
  const [languages, setLanguages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
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
        return Promise.all([
          apiFetch("/api/user/history").then((res) => res.json()),
          apiFetch("/api/user/github-activity")
            .then((res) => res.json())
            .catch(() => ({ available: false })),
        ]);
      })
      .then((results) => {
        if (!results) return;
        const [historyData, activityData] = results;
        setHistory(historyData.history);
        setActivity(activityData);
      })
      .finally(() => setLoading(false));
  }, []);

  const codebases = useMemo(() => (history ? dedupeLatest(history) : []), [history]);
  const activityFeed = useMemo(() => (history ? buildActivityFeed(history) : []), [history]);
  const latest = codebases[0] || null;

  useEffect(() => {
    if (!latest) return;
    apiFetch(`/api/user/history/${latest.id}`)
      .then((res) => res.json())
      .then((data) => setLatestDetail(data.analysis))
      .catch(() => setLatestDetail(null));
    apiFetch(`/api/user/repo-languages?repo=${encodeURIComponent(latest.repoFullName)}`)
      .then((res) => res.json())
      .then((data) => setLanguages(data.languages))
      .catch(() => setLanguages({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  if (loading || !user) {
    return <div className="dashboard-page dashboard-loading">Loading…</div>;
  }

  const hasCodebases = codebases.length > 0;

  const totals = codebases.reduce(
    (acc, c) => ({
      files: acc.files + (c.fileCount || 0),
      nodes: acc.nodes + (c.nodeCount || 0),
      edges: acc.edges + (c.edgeCount || 0),
    }),
    { files: 0, nodes: 0, edges: 0 }
  );

  return (
    <div className="dashboard-page">
      <div className="grain" />
      <DashboardShell
        sidebar={
          <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} hasContent={hasCodebases} />
        }
        header={
          <DashboardHeader user={user} hasCodebases={hasCodebases} onToggleSidebar={() => setMobileOpen((v) => !v)} />
        }
      >
        {!hasCodebases ? (
          <div className="dashboard-onboarding-grid">
            <div className="dashboard-onboarding">
              <h2>Welcome to GitReason</h2>
              <p>
                Connect your first repository and GitReason will build an understandable map of its
                architecture, dependencies and code.
              </p>
              <AnalyzeRepoButton label="Analyze repository" />
            </div>
            <GithubActivity activity={activity} />
          </div>
        ) : (
          <>
            <section id="overview" className="dashboard-section">
              <div className="metric-row">
                <MetricCard icon={FolderGit} tone="accent" label="Codebases" value={codebases.length} />
                <MetricCard icon={FileText} tone="blue" label="Files understood" value={totals.files} />
                <MetricCard icon={Boxes} tone="amber" label="Architecture nodes" value={totals.nodes} />
                <MetricCard icon={Network} tone="cyan" label="Relationships" value={totals.edges} />
              </div>
            </section>

            <section id="activity" className="dashboard-section dashboard-grid-2">
              <GithubActivity activity={activity} />
              <RecentActivity items={activityFeed} />
            </section>

            <section className="dashboard-section dashboard-grid-2">
              <CodebaseList codebases={codebases} />
              <CodebaseComposition repoFullName={latest?.repoFullName} languages={languages} />
            </section>

            <section className="dashboard-section dashboard-grid-2">
              <ArchitectureSnapshot
                repoFullName={latest?.repoFullName}
                analysisId={latest?.id}
                graph={latestDetail?.graph}
              />
              <RecentAnalyses items={history.slice(0, 6)} />
            </section>
          </>
        )}
      </DashboardShell>

      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </div>
  );
}
