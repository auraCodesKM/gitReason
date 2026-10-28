// Unit tests: checking and cleaning the AI-generated architecture graph before it is saved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGraph, repairGraph, normalizeGraph, parseJsonLoose } from "../../src/modules/analyses/analysis.ai.js";

const realPaths = new Set(["server.js", "db", "db/models.js"]);

test("validateGraph: accepts a graph whose nodes use real paths", () => {
  const graph = {
    nodes: [{ id: "a", path: "server.js" }, { id: "b", path: "db/models.js" }],
    edges: [{ from: "a", to: "b" }],
  };
  assert.deepEqual(validateGraph(graph, realPaths), []);
});

test("validateGraph: reports invented paths, duplicate ids, missing fields and dangling edges", () => {
  const errors = validateGraph(
    {
      nodes: [{ id: "a", path: "server.js" }, { id: "a", path: "db" }, { id: "x", path: "made/up.js" }, { label: "no id" }],
      edges: [{ from: "a", to: "ghost" }],
    },
    realPaths
  );
  assert.equal(errors.length, 4);
  assert.match(errors.join("\n"), /duplicate node id "a"/);
  assert.match(errors.join("\n"), /unknown path "made\/up.js"/);
  assert.match(errors.join("\n"), /missing id or path/);
  assert.match(errors.join("\n"), /unknown node "ghost"/);
});

test("repairGraph: drops invalid nodes and the edges that pointed at them", () => {
  const repaired = repairGraph(
    { groups: [], nodes: [{ id: "a", path: "server.js" }, { id: "x", path: "made/up.js" }], edges: [{ from: "a", to: "x" }] },
    realPaths
  );
  assert.deepEqual(repaired.nodes.map((n) => n.id), ["a"]);
  assert.deepEqual(repaired.edges, []);
});

test("normalizeGraph: coerces types and replaces values the schema would reject", () => {
  const out = normalizeGraph({
    groups: [{ id: 1 }, null],
    nodes: [{ id: 7, path: "db", kind: "folder", role: "database", extra: "dropped" }],
    edges: [{ from: 7, to: 7 }],
  });
  assert.deepEqual(out, {
    groups: [{ id: "1", label: "1" }],
    nodes: [{ id: "7", label: "db", detail: "", path: "db", group: null, kind: "file", role: "default" }],
    edges: [{ from: "7", to: "7", label: "" }],
  });
});

test("parseJsonLoose: tolerates ```json fences and rejects non-JSON", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"nodes":[]}\n```'), { nodes: [] });
  assert.throws(() => parseJsonLoose("Sure! Here is your graph"));
});
