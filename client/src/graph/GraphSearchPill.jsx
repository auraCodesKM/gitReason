// A small, low-profile trigger — the actual first-class search experience
// is GraphCommandPalette (Cmd/Ctrl+K or click here). Keeping this tiny is
// deliberate: it's a discoverability hint, not the search surface itself.
export function GraphSearchPill({ onOpen }) {
  return (
    <button type="button" className="graph-search-trigger" onClick={onOpen} aria-label="Search (Cmd+K)" title="Search (⌘K)">
      <span aria-hidden="true">⌕</span>
      <span className="graph-search-trigger-hint">Search…</span>
      <kbd>⌘K</kbd>
    </button>
  );
}
