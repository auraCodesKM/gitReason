import { colorFor, connectionCount } from "./graphData";

const ROLE_LABEL = { entry: "Entry point", service: "Service", store: "Data store", default: "Component" };

export function GraphSidePanel({
  node, model, mode, blastStats, sourceOpen, fileHtml, fileLoading,
  onJumpTo, onOpenSource, onBackToInfo, onShowLocalGraph, onShowBlastRadius, onClose, onViewInArchitecture,
}) {
  const color = colorFor(model.groupColor, node.group);
  const adjacency = model.adjacency.get(node.id) || { out: [], in: [] };
  const groupLabel = node.group ? model.groupsById.get(node.group) || node.group : null;

  if (sourceOpen) {
    return (
      <aside className="graph-panel graph-panel-source">
        <div className="graph-panel-head">
          <button type="button" className="graph-panel-back" onClick={onBackToInfo} aria-label="Back">‹</button>
          <span className="graph-panel-source-path">{node.path}</span>
          <button type="button" className="graph-panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="graph-panel-source-body">
          {fileLoading ? (
            <p className="file-preview-empty">Loading…</p>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: fileHtml }} />
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="graph-panel">
      <div className="graph-panel-head">
        <span className="graph-panel-role-pill" style={{ borderColor: color.stroke, color: color.stroke }}>
          {ROLE_LABEL[node.role]}
        </span>
        <button type="button" className="graph-panel-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <h3 className="graph-panel-title">{node.label}</h3>
      {groupLabel && <p className="graph-panel-group">{groupLabel}</p>}
      {node.detail && <p className="graph-panel-detail">{node.detail}</p>}
      <p className="graph-panel-path">{node.path}</p>
      {onViewInArchitecture && (
        <button type="button" className="graph-panel-link" onClick={onViewInArchitecture}>
          View in Architecture →
        </button>
      )}

      <div className="graph-panel-stat">
        <span className="graph-panel-stat-value">{connectionCount(model.adjacency, node.id)}</span>
        <span className="graph-panel-stat-label">connections</span>
      </div>

      <div className="graph-panel-actions">
        <button type="button" className="graph-panel-action" onClick={onOpenSource}>Open Source</button>
        <button type="button" className={`graph-panel-action ${mode === "local" ? "is-active" : ""}`} onClick={onShowLocalGraph}>Local Graph</button>
        <button type="button" className={`graph-panel-action ${mode === "blast" ? "is-active" : ""}`} onClick={onShowBlastRadius}>Blast Radius</button>
      </div>

      {mode === "blast" && blastStats && (
        <div className="graph-panel-blast">
          <h4>Potential impact</h4>
          <div className="graph-panel-blast-row">
            <span className="graph-panel-blast-count graph-panel-blast-up">{blastStats.upstream.size}</span>
            <span>{blastStats.upstream.size === 1 ? "dependent" : "dependents"} — breaks if this changes</span>
          </div>
          <div className="graph-panel-blast-row">
            <span className="graph-panel-blast-count graph-panel-blast-down">{blastStats.downstream.size}</span>
            <span>{blastStats.downstream.size === 1 ? "dependency" : "dependencies"} — what this relies on</span>
          </div>
          <p className="graph-panel-blast-total">
            {blastStats.upstream.size + blastStats.downstream.size} connected component{blastStats.upstream.size + blastStats.downstream.size === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {(adjacency.out.length > 0 || adjacency.in.length > 0) && (
        <div className="graph-panel-lists">
          {adjacency.out.length > 0 && (
            <div className="graph-panel-list">
              <h4>Dependencies ({adjacency.out.length})</h4>
              <ul>
                {adjacency.out.map(({ id, edge }) => (
                  <li key={id}>
                    <button type="button" onClick={() => onJumpTo(id)}>{model.nodesById.get(id)?.label || id}</button>
                    {edge.label && <span className="graph-panel-edge-label">{edge.label}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {adjacency.in.length > 0 && (
            <div className="graph-panel-list">
              <h4>Dependents ({adjacency.in.length})</h4>
              <ul>
                {adjacency.in.map(({ id, edge }) => (
                  <li key={id}>
                    <button type="button" onClick={() => onJumpTo(id)}>{model.nodesById.get(id)?.label || id}</button>
                    {edge.label && <span className="graph-panel-edge-label">{edge.label}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
