function endpointId(v) {
  return typeof v === "object" && v !== null ? v.id : v;
}

function edgeKey(edge) {
  return `${endpointId(edge.source)} ${endpointId(edge.target)}`;
}

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
