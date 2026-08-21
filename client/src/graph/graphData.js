// Dark-theme lane colors, ported verbatim from the old graphToMermaid.js
// PALETTE so the visual identity carries over. Cycled per group by order
// of first appearance. Also reused for Blast Radius mode: gold (index 1) =
// upstream/dependents, blue (index 2) = downstream/dependencies.
export const PALETTE = [
  { fill: "#0f1a10", stroke: "#56d364", wash: "rgba(86,211,100,0.12)", text: "#eafbea" },
  { fill: "#1a140a", stroke: "#e0ab3c", wash: "rgba(224,171,60,0.12)", text: "#fbf0d8" },
  { fill: "#0b151b", stroke: "#4fa8d8", wash: "rgba(79,168,216,0.12)", text: "#dff1fb" },
  { fill: "#150f1c", stroke: "#a78bfa", wash: "rgba(167,139,250,0.12)", text: "#f0eafd" },
  { fill: "#1b0f15", stroke: "#f472b6", wash: "rgba(244,114,182,0.12)", text: "#fde3ee" },
  { fill: "#0b1916", stroke: "#2dd4bf", wash: "rgba(45,212,191,0.12)", text: "#e0faf5" },
];

export const UPSTREAM_COLOR = PALETTE[1].stroke; // gold — "what depends on this"
export const DOWNSTREAM_COLOR = PALETTE[2].stroke; // blue — "what this depends on"

// Small dots, not shapes — a constellation, not a diagram. Role is
// expressed only as a subtle radius difference (entry points read as
// slightly more important), never as a distinct shape/border.
const ROLE_BASE_RADIUS = { entry: 5.5, service: 4.5, store: 4.5, default: 3.5 };

// This module operates on arbitrary node/edge counts — nothing here assumes
// the current ~40-node server cap. A future clustering stage for much larger
// repos would feed this same shape in, not require rewriting it.
export function buildGraphModel(graph) {
  const nodes = (graph.nodes || [])
    .filter((n) => n?.id)
    .map((n) => ({
      id: n.id,
      label: n.label || n.path || n.id,
      detail: n.detail || "",
      path: n.path,
      kind: n.kind === "dir" ? "dir" : "file",
      role: ["entry", "service", "store"].includes(n.role) ? n.role : "default",
      group: n.group || null,
    }));

  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const links = (graph.edges || [])
    .filter((e) => nodesById.has(e.from) && nodesById.has(e.to))
    .map((e) => ({ source: e.from, target: e.to, label: e.label || "" }));

  // Built from the original id strings BEFORE handing links to d3-force —
  // forceLink().id() mutates link.source/target from strings into live node
  // object references once the simulation starts, so this must never be
  // recomputed by re-reading links after that point.
  const adjacency = new Map(nodes.map((n) => [n.id, { out: [], in: [] }]));
  for (const link of links) {
    adjacency.get(link.source)?.out.push({ id: link.target, edge: link });
    adjacency.get(link.target)?.in.push({ id: link.source, edge: link });
  }

  const groupIds = [...new Set(nodes.map((n) => n.group).filter(Boolean))];
  const groupsById = new Map((graph.groups || []).map((g) => [g.id, g.label]));
  const groupColor = new Map(groupIds.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
  const relLabels = [...new Set(links.map((l) => l.label).filter(Boolean))].sort();

  return { nodes, links, nodesById, adjacency, groupIds, groupsById, groupColor, relLabels };
}

export function connectionCount(adjacency, id) {
  const a = adjacency.get(id);
  return a ? a.out.length + a.in.length : 0;
}

export function radiusFor(adjacency, node) {
  const base = ROLE_BASE_RADIUS[node.role] ?? ROLE_BASE_RADIUS.default;
  return base + Math.min(connectionCount(adjacency, node.id), 10) * 0.22;
}

export function colorFor(groupColor, group) {
  return groupColor.get(group) || { fill: "#141414", stroke: "#8a8a8a", wash: "rgba(150,150,150,0.1)", text: "#ddd" };
}
