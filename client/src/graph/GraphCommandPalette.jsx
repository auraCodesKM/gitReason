import { useMemo, useRef, useState, useEffect } from "react";

const ROLE_LABEL = { entry: "Entry", service: "Service", store: "Store", default: "Component" };

function score(query, node) {
  const q = query.toLowerCase();
  const label = node.label.toLowerCase();
  const path = (node.path || "").toLowerCase();
  const role = (node.role || "").toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 80;
  if (path.includes(q)) return 65;
  if (role.includes(q)) return 40;
  let i = 0;
  for (const c of label) if (c === q[i]) i++;
  return i === q.length ? 20 : -1;
}

// A first-class search+command surface (Cmd/Ctrl+K) — the corner pill is
// just the discoverability hint; this centered palette is where users
// actually search. Node results and graph-level commands share one list
// so search and "do a thing" never feel like two separate features.
export function GraphCommandPalette({ nodes, commands, onSelectNode, onClose, onQueryChange }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const nodeResults = useMemo(() => {
    if (!query.trim()) return [];
    return nodes
      .map((n) => ({ node: n, s: score(query.trim(), n) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.node.label.localeCompare(b.node.label))
      .slice(0, 8);
  }, [query, nodes]);

  useEffect(() => {
    onQueryChange?.(query.trim() ? new Set(nodeResults.map((r) => r.node.id)) : null);
  }, [query, nodeResults, onQueryChange]);

  const commandResults = useMemo(() => {
    const visible = commands.filter((c) => c.visible !== false);
    if (!query.trim()) return visible;
    const q = query.trim().toLowerCase();
    return visible.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, commands]);

  const items = useMemo(
    () => [...nodeResults.map((r) => ({ kind: "node", node: r.node })), ...commandResults.map((c) => ({ kind: "command", command: c }))],
    [nodeResults, commandResults]
  );

  function run(item) {
    if (!item) return;
    if (item.kind === "node") onSelectNode(item.node.id);
    else item.command.run();
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (!items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + items.length) % items.length); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[activeIndex]); }
  }

  return (
    <div className="graph-palette-backdrop" onClick={onClose}>
      <div className="graph-palette" onClick={(e) => e.stopPropagation()}>
        <div className="graph-palette-input-row">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files, modules, roles… or run a command"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={onKeyDown}
          />
          <kbd>esc</kbd>
        </div>

        <div className="graph-palette-results">
          {nodeResults.length > 0 && (
            <div className="graph-palette-group">
              <h5>Nodes</h5>
              {nodeResults.map((r, i) => (
                <button
                  key={r.node.id}
                  type="button"
                  className={`graph-palette-item ${items[activeIndex] === items[i] ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => run(items[i])}
                >
                  <span className="graph-palette-item-main">
                    <span className="graph-palette-item-label">{r.node.label}</span>
                    <span className="graph-palette-item-path">{r.node.path}</span>
                  </span>
                  <span className="graph-palette-item-role">{ROLE_LABEL[r.node.role] || r.node.role}</span>
                </button>
              ))}
            </div>
          )}

          {commandResults.length > 0 && (
            <div className="graph-palette-group">
              <h5>Commands</h5>
              {commandResults.map((c, ci) => {
                const idx = nodeResults.length + ci;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`graph-palette-item ${items[activeIndex] === items[idx] ? "is-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => run(items[idx])}
                  >
                    <span className="graph-palette-item-main">
                      <span className="graph-palette-item-label">{c.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {query.trim() && !nodeResults.length && !commandResults.length && (
            <p className="graph-palette-empty">No matches for “{query}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}
