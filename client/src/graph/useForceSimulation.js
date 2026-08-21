import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from "d3-force";
import { radiusFor, connectionCount } from "./graphData";

// Deterministic PRNG (mulberry32) seeded from the node id set itself — same
// graph data in, same layout out. Math.random() would make two analyses of
// the identical repo look like two different graphs on every reload.
function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a d3-force simulation and settles it SYNCHRONOUSLY and invisibly
// (manual .tick() loop, never the built-in async timer) before anything is
// ever rendered — the live, visibly-jittery settling process is never shown
// to the user. CodebaseGraph animates a controlled reveal from staged start
// positions to these precomputed final ones, then hands off to the returned
// (already-stopped) simulation only when a drag reactivates it.
export function createSettledSimulation({ nodes, links, adjacency, groupIds, width, height }) {
  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = links.map((l) => ({ ...l }));
  const rand = seededRandom(nodes.map((n) => n.id).join("|"));

  // Seed positions at group centroids (arranged in a circle) + small jitter,
  // so even the invisible pre-solve starts from an organized state and
  // group clustering emerges reliably rather than depending on charge/link
  // forces alone to untangle a fully random scatter.
  const groupCount = Math.max(groupIds.length, 1);
  const clusterRadius = Math.min(width, height) * 0.28;
  const centroids = new Map();
  groupIds.forEach((gid, i) => {
    const angle = (i / groupCount) * Math.PI * 2;
    centroids.set(gid, {
      x: width / 2 + Math.cos(angle) * clusterRadius,
      y: height / 2 + Math.sin(angle) * clusterRadius,
    });
  });
  const centroidFor = (n) => (n.group && centroids.get(n.group)) || { x: width / 2, y: height / 2 };
  for (const n of simNodes) {
    const c = centroidFor(n);
    n.x = c.x + (rand() - 0.5) * 60;
    // Entry points read as "where you'd start" — bias them toward the top
    // of their cluster rather than scattering them anywhere in it.
    n.y = c.y + (rand() - 0.5) * 60 - (n.role === "entry" ? 22 : 0);
  }

  const simulation = forceSimulation(simNodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => d.id)
        .distance((l) => (l.source.group && l.source.group === l.target.group ? 54 : 96))
        .strength(0.55)
    )
    .force("charge", forceManyBody().strength(-110).distanceMax(460))
    .force(
      "collide",
      // Labels render beside each node in small monospace — factor their
      // approximate width in too, or adjacent labels overlap even when the
      // tiny dots themselves have plenty of clearance.
      forceCollide((d) => radiusFor(adjacency, d) + 12 + Math.min((d.label || "").length * 2.7, 70)).strength(0.9)
    )
    .force("center", forceCenter(width / 2, height / 2))
    // A "soft architecture map", not rigid boxes: cluster pull is strong
    // enough that groups read as regions, weak enough that cross-group
    // links can still bow the layout toward real connectivity. Isolated
    // (degree-0) nodes get extra pull so they don't drift off and dominate
    // empty canvas space on their own.
    .force("clusterX", forceX((d) => centroidFor(d).x).strength((d) => (connectionCount(adjacency, d.id) === 0 ? 0.14 : 0.05)))
    .force("clusterY", forceY((d) => centroidFor(d).y).strength((d) => (connectionCount(adjacency, d.id) === 0 ? 0.14 : 0.05)))
    .alphaDecay(0.028)
    .velocityDecay(0.42)
    .stop();

  // forceLink().id() only rewrites link.source/target into live node object
  // references once the simulation has ticked at least once — force it now,
  // synchronously, well before anything reads simLinks for adjacency-style
  // lookups (which should use the original `adjacency` map instead anyway).
  for (let i = 0; i < 300 && simulation.alpha() > 0.005; i++) simulation.tick();

  const finalPositions = new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  return { simNodes, simLinks, simulation, finalPositions, centroidFor };
}
