export const PALETTE = [
  { fill: "#0f1a10", stroke: "#56d364", wash: "rgba(86,211,100,0.12)", text: "#eafbea" },
  { fill: "#1a140a", stroke: "#e0ab3c", wash: "rgba(224,171,60,0.12)", text: "#fbf0d8" },
  { fill: "#0b151b", stroke: "#4fa8d8", wash: "rgba(79,168,216,0.12)", text: "#dff1fb" },
  { fill: "#150f1c", stroke: "#a78bfa", wash: "rgba(167,139,250,0.12)", text: "#f0eafd" },
  { fill: "#1b0f15", stroke: "#f472b6", wash: "rgba(244,114,182,0.12)", text: "#fde3ee" },
  { fill: "#0b1916", stroke: "#2dd4bf", wash: "rgba(45,212,191,0.12)", text: "#e0faf5" },
];

function sanitizeId(id) {
  return "n_" + String(id).replace(/[^a-zA-Z0-9_]/g, "_");
}

function nodeLabel(node) {
  const title = (node.label || node.id).replace(/`/g, "'");
  const detail = (node.detail || "").replace(/`/g, "'");
  const text = detail ? `**${title}**<br/><span style="font-size:11px">${detail}</span>` : `**${title}**`;
  return `${sanitizeId(node.id)}["\`${text}\`"]`;
}

function edgeLabel(label) {
  const text = (label || "").replace(/[|"]/g, "").trim();
  return text ? `-->|${text}|` : "-->";
}

export function graphToMermaid(graph) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const groups = graph.groups || [];
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  const groupIds = [...new Set(nodes.map((n) => n.group).filter(Boolean))];
  const groupColorClass = new Map(groupIds.map((id, i) => [id, `grp${i % PALETTE.length}`]));
  const ungrouped = nodes.filter((n) => !n.group || !groupIds.includes(n.group));

  const lines = ["flowchart TD"];

  for (const groupId of groupIds) {
    const group = groups.find((g) => g.id === groupId);
    const groupNodes = nodes.filter((n) => n.group === groupId);
    if (!groupNodes.length) continue;
    lines.push(`  subgraph ${sanitizeId(groupId)}["${(group?.label || groupId).replace(/"/g, "'")}"]`);
    for (const n of groupNodes) lines.push(`    ${nodeLabel(n)}`);
    lines.push("  end");
  }
  for (const n of ungrouped) lines.push(`  ${nodeLabel(n)}`);

  for (const e of edges) {
    if (!nodesById.has(e.from) || !nodesById.has(e.to)) continue;
    lines.push(`  ${sanitizeId(e.from)} ${edgeLabel(e.label)} ${sanitizeId(e.to)}`);
  }

  for (const groupId of groupIds) {
    const color = groupColorClass.get(groupId);
    const palette = PALETTE[groupIds.indexOf(groupId) % PALETTE.length];
    lines.push(`  classDef ${color} fill:${palette.fill},stroke:${palette.stroke},color:${palette.text},stroke-width:1.5px;`);
    const groupNodes = nodes.filter((n) => n.group === groupId);
    if (groupNodes.length) lines.push(`  class ${groupNodes.map((n) => sanitizeId(n.id)).join(",")} ${color};`);
  }

  const idMap = new Map(nodes.map((n) => [sanitizeId(n.id), n]));

  return { definition: lines.join("\n"), idMap };
}
