// Dark-theme-tuned lane colors, cycled per group by order of first appearance.
// Each lane gets a subtle tinted subgraph background + a brighter node border
// in the same hue, so groups read as distinct colored regions (like a real
// architecture diagram) without breaking the black canvas.
const PALETTE = [
  { subFill: "#10170f", subStroke: "#2a4a30", nodeFill: "#0f1a10", nodeStroke: "#56d364", text: "#eafbea" },
  { subFill: "#1a150a", subStroke: "#4a3a1a", nodeFill: "#1a140a", nodeStroke: "#e0ab3c", text: "#fbf0d8" },
  { subFill: "#0c161c", subStroke: "#1f3a49", nodeFill: "#0b151b", nodeStroke: "#4fa8d8", text: "#dff1fb" },
  { subFill: "#160f1e", subStroke: "#3a2a52", nodeFill: "#150f1c", nodeStroke: "#a78bfa", text: "#f0eafd" },
  { subFill: "#1c0f16", subStroke: "#4a2436", nodeFill: "#1b0f15", nodeStroke: "#f472b6", text: "#fde3ee" },
  { subFill: "#0c1a17", subStroke: "#1f4a3f", nodeFill: "#0b1916", nodeStroke: "#2dd4bf", text: "#e0faf5" },
];

function escapeLabel(label) {
  return String(label).replace(/"/g, "'");
}

function escapeMarkdownLabel(text) {
  return String(text).replace(/`/g, "'");
}

// Mermaid's markdown-string node labels need BOTH the outer quoted-label
// delimiter AND the backtick markdown marker together — `["` text `"]` —
// backticks alone (no quotes) render as literal text, not formatting.
function nodeLabel(node) {
  const title = escapeMarkdownLabel(node.label || node.path);
  const detail = node.detail ? escapeMarkdownLabel(node.detail) : "";
  const body = detail ? `**${title}**\n${detail}` : `**${title}**`;
  return `"\`${body}\`"`;
}

function shapeFor(node) {
  if (node.kind === "dir") return ["[[", "]]"];
  switch (node.role) {
    case "entry":
      return ["([", "])"];
    case "store":
      return ["[(", ")]"];
    case "service":
      return ["{{", "}}"];
    default:
      return ["[", "]"];
  }
}

// Sanitizes an id for Mermaid AND guarantees uniqueness across every id used
// in the diagram (nodes and subgraphs share one id space in Mermaid — a
// collision between e.g. a node and a group id is what produces obscure
// "would create a cycle" render errors, not an actual graph cycle).
function makeIdRegistry() {
  const used = new Set();
  const assigned = new Map(); // original id -> final mermaid id

  return function assign(originalId) {
    if (assigned.has(originalId)) return assigned.get(originalId);
    let base = String(originalId).replace(/[^a-zA-Z0-9_]/g, "_") || "n";
    if (/^[0-9]/.test(base)) base = `n_${base}`;
    let candidate = base;
    let i = 1;
    while (used.has(candidate)) candidate = `${base}_${i++}`;
    used.add(candidate);
    assigned.set(originalId, candidate);
    return candidate;
  };
}

// Returns { text, idMap, nodeOrder } — idMap maps each graph node's original
// id to the exact Mermaid id it was rendered with, so callers can map a
// clicked SVG element back to the node without re-deriving (and risking
// drift from) ids. nodeOrder lists mermaid ids in draw order, for staggered
// reveal animation.
export function graphToMermaid(graph) {
  const lines = ["flowchart TD"];
  const assignId = makeIdRegistry();
  const idMap = new Map();
  const nodesById = new Map();
  const grouped = new Map();
  const ungrouped = [];
  const nodeOrder = [];
  const classDefs = [];
  const classAssignments = [];
  const subgraphStyles = [];

  for (const node of graph.nodes || []) {
    if (!node?.id) continue;
    nodesById.set(node.id, node);
    if (node.group) {
      if (!grouped.has(node.group)) grouped.set(node.group, []);
      grouped.get(node.group).push(node);
    } else {
      ungrouped.push(node);
    }
  }

  const groupLabels = new Map((graph.groups || []).map((g) => [g.id, g.label]));

  let colorIndex = 0;
  for (const [groupId, nodes] of grouped) {
    if (nodes.length === 0) continue;
    const color = PALETTE[colorIndex % PALETTE.length];
    colorIndex++;
    const className = `lane${colorIndex}`;
    classDefs.push(`  classDef ${className} fill:${color.nodeFill},stroke:${color.nodeStroke},color:${color.text},stroke-width:1.5px;`);

    const label = groupLabels.get(groupId) || groupId;
    const subId = assignId(`group:${groupId}`);
    lines.push(`  subgraph ${subId}["${escapeLabel(label)}"]`);
    for (const node of nodes) {
      const mid = assignId(node.id);
      idMap.set(node.id, mid);
      nodeOrder.push(mid);
      const [open, close] = shapeFor(node);
      lines.push(`    ${mid}${open}${nodeLabel(node)}${close}`);
      classAssignments.push(`  class ${mid} ${className};`);
    }
    lines.push("  end");
    subgraphStyles.push(`  style ${subId} fill:${color.subFill},stroke:${color.subStroke},color:${color.text};`);
  }

  for (const node of ungrouped) {
    const mid = assignId(node.id);
    idMap.set(node.id, mid);
    nodeOrder.push(mid);
    const [open, close] = shapeFor(node);
    lines.push(`  ${mid}${open}${nodeLabel(node)}${close}`);
  }

  for (const edge of graph.edges || []) {
    // Only emit edges between nodes that were actually declared above —
    // a dangling reference (LLM typo, hallucinated id) would otherwise make
    // Mermaid implicitly create a stray node, a common source of render
    // errors once subgraphs are involved.
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue;
    const label = edge.label ? `|"${escapeLabel(edge.label)}"|` : "";
    lines.push(`  ${idMap.get(edge.from)} -->${label} ${idMap.get(edge.to)}`);
  }

  lines.push(...classDefs, ...classAssignments, ...subgraphStyles);

  return { text: lines.join("\n"), idMap, nodeOrder };
}
