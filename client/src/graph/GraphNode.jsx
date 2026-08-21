import { colorFor } from "./graphData";

// Position/transform is written imperatively by the tick/reveal loop
// (data-* attributes drive it via CSS, x/y attributes hold layout) — this
// component only ever renders once per node's lifetime; React never
// re-renders it for movement, only for role/color which don't change.
//
// Deliberately minimal: every node is a small dot, always. Role is read
// only as a subtle radius difference — never a distinct shape or border —
// so the graph reads as a constellation, not a diagram.
export function GraphNode({ node, r, groupColor, nodeRef, onPointerEnter, onPointerLeave, onClick, onDoubleClick }) {
  const color = colorFor(groupColor, node.group);
  return (
    <g
      ref={nodeRef}
      className="graph-node"
      data-node-id={node.id}
      data-role={node.role}
      data-state="idle"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <circle className="graph-node-dot" r={r} style={{ fill: color.stroke }} />
      <text className="graph-node-label" x={r + 6} dy="0.32em" style={{ fill: color.text }}>
        {node.label}
      </text>
    </g>
  );
}
