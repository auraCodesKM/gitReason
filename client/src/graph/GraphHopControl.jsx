const HOPS = [1, 2, 3, Infinity];
const HOP_LABEL = { 1: "1", 2: "2", 3: "3", Infinity: "All" };

// Minimal floating depth control — no toolbar, no labels beyond the pill
// itself. Only meaningful once something is selected, but stays visible so
// the default (2 hops) is discoverable before a first click.
export function GraphHopControl({ hopDepth, onHopDepthChange, onFitToScreen }) {
  return (
    <div className="graph-hop-pill">
      {HOPS.map((h) => (
        <button
          key={h}
          type="button"
          className={`graph-hop-btn ${hopDepth === h ? "is-active" : ""}`}
          onClick={() => onHopDepthChange(h)}
        >
          {HOP_LABEL[h]}
        </button>
      ))}
      <span className="graph-hop-divider" aria-hidden="true" />
      <button type="button" className="graph-hop-fit" onClick={onFitToScreen}>
        Fit
      </button>
    </div>
  );
}
