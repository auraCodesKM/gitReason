export function GraphEdge({ edgeKey, edgeRef }) {
  return (
    <g className="graph-edge" data-edge-key={edgeKey} data-state="idle">
      <path ref={edgeRef} className="graph-edge-path" />
    </g>
  );
}
