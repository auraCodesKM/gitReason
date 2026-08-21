import { PieChart, ChevronDown } from "lucide-react";
import { IconBadge } from "./IconBadge";
import { DrawnUnderline } from "../../sections/DrawnUnderline";
import { colorForLanguage } from "../../lib/languageColors";
import "./codebase-composition.css";

export function CodebaseComposition({ codebases, selectedRepo, onSelectRepo, languages }) {
  if (!selectedRepo) return null;

  const entries = languages ? Object.entries(languages).sort((a, b) => b[1] - a[1]) : null;
  const total = entries ? entries.reduce((s, [, v]) => s + v, 0) : 0;

  let rows = [];
  if (entries && entries.length && total > 0) {
    const top = entries.slice(0, 3);
    const restBytes = entries.slice(3).reduce((s, [, v]) => s + v, 0);
    rows = top.map(([name, bytes]) => ({ name, pct: (bytes / total) * 100, color: colorForLanguage(name) }));
    if (restBytes > 0) rows.push({ name: "Other", pct: (restBytes / total) * 100, color: colorForLanguage("Other") });
  }

  return (
    <div className="dashboard-panel codebase-composition">
      <div className="dashboard-panel-head">
        <div className="dashboard-panel-head-title">
          <IconBadge icon={PieChart} tone="cyan" />
          <h2>Codebase composition</h2>
        </div>
        <div className="composition-select-wrap">
          <select
            className="composition-select"
            value={selectedRepo}
            onChange={(e) => onSelectRepo(e.target.value)}
          >
            {codebases.map((c) => (
              <option key={c.repoFullName} value={c.repoFullName}>{c.repoFullName}</option>
            ))}
            {codebases.length > 1 && <option value="__all__">All repositories</option>}
          </select>
          <ChevronDown size={13} strokeWidth={2} className="composition-select-chevron" />
        </div>
      </div>

      {languages === null && <p className="dashboard-panel-loading">Loading…</p>}
      {languages && rows.length === 0 && <p className="dashboard-panel-empty">No language data available.</p>}

      {rows.length > 0 && (
        <>
          <div className="composition-bar">
            {rows.map((r) => (
              <span key={r.name} className="composition-seg" style={{ width: `${r.pct}%`, background: r.color }} />
            ))}
          </div>
          <ul className="composition-legend">
            {rows.map((r, i) => (
              <li key={r.name}>
                <span className="composition-swatch" style={{ background: r.color }} />
                {i === 0 ? (
                  <span className="composition-name composition-name-dominant">
                    <span className="headline-accent">
                      <em style={{ color: r.color }}>{r.name}</em>
                      <DrawnUnderline seed={r.name.length * 7 + 2} strokeWidth="2" color={r.color} />
                    </span>
                  </span>
                ) : (
                  <span className="composition-name">{r.name}</span>
                )}
                <span className="composition-pct">{r.pct.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
