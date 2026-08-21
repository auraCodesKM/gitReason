// d3-force mutates link.source/target from id strings into live node object
// references once the simulation initializes — callers hand this both the
// original model.links (still strings) and simLinks post-init (objects), so
// the key must normalize either form to the same string.
function endpointId(v) {
  return typeof v === "object" && v !== null ? v.id : v;
}

function edgeKey(edge) {
  return `${endpointId(edge.source)} ${endpointId(edge.target)}`;
}

// Local Graph: hop distance is UNDIRECTED — reaching a node via an incoming
// OR outgoing edge both count as 1 hop. This is the core distinction from
// Blast Radius below, which is direction-aware and unbounded.
export function bfsLocalGraph(adjacency, rootId, maxDepth) {
  const dist = new Map([[rootId, 0]]);
  const traversedEdgeKeys = new Set();
  let frontier = [rootId];

  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next = [];
    for (const id of frontier) {
      const a = adjacency.get(id);
      if (!a) continue;
      for (const { id: nid, edge } of [...a.out, ...a.in]) {
        traversedEdgeKeys.add(edgeKey(edge));
        if (!dist.has(nid)) {
          dist.set(nid, d);
          next.push(nid);
        }
      }
    }
    frontier = next;
  }

  return { hopById: dist, traversedEdgeKeys };
}

// Blast Radius: deliberately unbounded (no hop cap) and direction-aware.
// Edge {from, to, label} reads "from <label>s to", so:
//   downstream (dependencies) = transitive closure over OUTGOING edges —
//     everything this file itself relies on.
//   upstream (dependents)     = transitive closure over INCOMING edges —
//     everything that would be affected if this file changed.
export function blastRadius(adjacency, rootId) {
  function closure(direction) {
    const visited = new Set([rootId]);
    const edgeKeys = new Set();
    let frontier = [rootId];
    while (frontier.length) {
      const next = [];
      for (const id of frontier) {
        const a = adjacency.get(id);
        if (!a) continue;
        for (const { id: nid, edge } of a[direction]) {
          edgeKeys.add(edgeKey(edge));
          if (!visited.has(nid)) {
            visited.add(nid);
            next.push(nid);
          }
        }
      }
      frontier = next;
    }
    visited.delete(rootId);
    return { ids: visited, edgeKeys };
  }

  const downstream = closure("out");
  const upstream = closure("in");
  return { upstream: upstream.ids, downstream: downstream.ids, upstreamEdgeKeys: upstream.edgeKeys, downstreamEdgeKeys: downstream.edgeKeys };
}

export function edgeKeyOf(edge) {
  return edgeKey(edge);
}
