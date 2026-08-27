const HOPS = [1, 2, 3, Infinity];
const HOP_LABEL = { 1: "1", 2: "2", 3: "3", Infinity: "All" };

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
