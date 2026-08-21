import "./architecture-snapshot.css";

export function ArchitectureSnapshot({ repoFullName, analysisId, graph }) {
  if (!repoFullName) return null;

  const href = `/analyze?repo=${encodeURIComponent(repoFullName)}&cached=${analysisId}`;
  const groups = graph?.groups || [];
  const nodeCount = graph?.nodes?.length ?? 0;
  const edgeCount = graph?.edges?.length ?? 0;
  const entryPoints = graph?.nodes?.filter((n) => n.role === "entry") ?? [];

  return (
    <div className="dashboard-panel architecture-snapshot">
      <div className="dashboard-panel-head">
        <h2>Architecture snapshot</h2>
        <span className="panel-head-sub">{repoFullName}</span>
      </div>

      {!graph && <p className="dashboard-panel-loading">Loading…</p>}

      {graph && (
        <>
          {groups.length > 0 && (
            <div className="snapshot-flow">
              {groups.map((g, i) => (
                <span key={g.id} className="snapshot-flow-step">
                  {g.label}
                  {i < groups.length - 1 && <span className="snapshot-flow-arrow">→</span>}
                </span>
              ))}
            </div>
          )}

          <div className="snapshot-stats">
            <div>
              <span className="snapshot-stat-value">{nodeCount}</span>
              <span className="snapshot-stat-label">Components</span>
            </div>
            <div>
              <span className="snapshot-stat-value">{edgeCount}</span>
              <span className="snapshot-stat-label">Relationships</span>
            </div>
            <div>
              <span className="snapshot-stat-value">{entryPoints.length}</span>
              <span className="snapshot-stat-label">Entry points</span>
            </div>
          </div>

          <a href={href} className="panel-head-action snapshot-link">View full architecture →</a>
        </>
      )}
    </div>
  );
}
