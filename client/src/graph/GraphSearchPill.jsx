export function GraphSearchPill({ onOpen }) {
  return (
    <button type="button" className="graph-search-trigger" onClick={onOpen} aria-label="Search (Cmd+K)" title="Search (⌘K)">
      <span aria-hidden="true">⌕</span>
      <span className="graph-search-trigger-hint">Search…</span>
      <kbd>⌘K</kbd>
    </button>
  );
}
