import "./codebase-composition.css";

const SHADES = ["var(--accent, #56d364)", "rgba(86,211,100,0.5)", "rgba(86,211,100,0.28)", "rgba(255,255,255,0.16)"];

export function CodebaseComposition({ repoFullName, languages }) {
  if (!repoFullName) return null;

  const entries = languages ? Object.entries(languages).sort((a, b) => b[1] - a[1]) : null;
  const total = entries ? entries.reduce((s, [, v]) => s + v, 0) : 0;

  let rows = [];
  if (entries && entries.length && total > 0) {
    const top = entries.slice(0, 3);
    const restBytes = entries.slice(3).reduce((s, [, v]) => s + v, 0);
    rows = top.map(([name, bytes]) => ({ name, pct: (bytes / total) * 100 }));
    if (restBytes > 0) rows.push({ name: "Other", pct: (restBytes / total) * 100 });
  }

  return (
    <div className="dashboard-panel codebase-composition">
      <div className="dashboard-panel-head">
        <h2>Codebase composition</h2>
        <span className="panel-head-sub">{repoFullName}</span>
      </div>

      {languages === null && <p className="dashboard-panel-loading">Loading…</p>}
      {languages && rows.length === 0 && <p className="dashboard-panel-empty">No language data available.</p>}

      {rows.length > 0 && (
        <>
          <div className="composition-bar">
            {rows.map((r, i) => (
              <span key={r.name} className="composition-seg" style={{ width: `${r.pct}%`, background: SHADES[i] }} />
            ))}
          </div>
          <ul className="composition-legend">
            {rows.map((r, i) => (
              <li key={r.name}>
                <span className="composition-swatch" style={{ background: SHADES[i] }} />
                <span className="composition-name">{r.name}</span>
                <span className="composition-pct">{r.pct.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
