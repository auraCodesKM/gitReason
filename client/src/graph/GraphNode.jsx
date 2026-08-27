import { colorFor } from "./graphData";

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
