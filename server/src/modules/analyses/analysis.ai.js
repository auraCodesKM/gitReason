// Turns a repository's file tree + README into an explanation and an
// architecture graph using Gemini, and makes the graph safe to save.
//
// Called by: analyze.controller.js. Calls: integrations/gemini.js.
// No database access.
//
// What the AI sees: the (filtered) file tree and up to 4,000 characters of the
// README - not the source code. Node paths are checked against the real tree;
// labels, roles, groups and edges are the model's inference.
import { llmComplete } from "../../integrations/gemini.js";

const MAX_README_CHARS = 4000;
const MAX_GRAPH_NODES = 40;
const MAX_GRAPH_ATTEMPTS = 3;
const MAX_TREE_ENTRIES_IN_PROMPT = 400; // keeps prompts small: faster and cheaper per call
const NODE_ROLES = ["entry", "service", "store", "default"];

function treeToText(tree) {
  const capped = tree.slice(0, MAX_TREE_ENTRIES_IN_PROMPT);
  const lines = capped.map((e) => (e.type === "dir" ? `${e.path}/` : e.path));
  if (tree.length > capped.length) lines.push(`... and ${tree.length - capped.length} more files`);
  return lines.join("\n");
}

function buildExplanationPrompt(tree, readme) {
  return [
    `File tree:\n${treeToText(tree)}`,
    readme ? `\nREADME:\n${readme.slice(0, MAX_README_CHARS)}` : "\n(No README found.)",
  ].join("\n");
}

const EXPLANATION_SYSTEM =
  "You are a senior software architect. Given a repository's file tree and README, " +
  "write a concise (150-300 word) plain-English explanation of the codebase's architecture: " +
  "what it does, its main components/layers, and how they fit together. " +
  "Describe the shape of the system — do not list every file.";

const GRAPH_SYSTEM = `You are a senior software architect building an interactive architecture diagram. Given a file tree and an architecture explanation, output ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{"groups": [{"id": string, "label": string}], "nodes": [{"id": string, "label": string, "detail": string, "path": string, "group": string|null, "kind": "file"|"dir", "role": "entry"|"service"|"store"|"default"}], "edges": [{"from": string, "to": string, "label": string}]}

Field rules:
- "path" MUST be an exact path copied from the provided file tree — never invent one.
- "label" is a short human role name (2-4 words, Title Case), e.g. "Request Router", not the filename.
- "detail" is a short (3-6 word) description of what it does, e.g. "Validates and dispatches incoming requests".
- "role": "entry" for entry points/CLI/API handlers users hit first, "store" for caches/databases/persistence/config stores, "service" for core logic/orchestrators, "default" for everything else.
- "edges[].label" is a short verb phrase describing the relationship, e.g. "validates", "queries", "publishes to" — always include one, never empty.
- Group nodes into 3-6 groups by architectural layer (e.g. "API Layer", "Core Logic", "Data & Caching") — every node needs a "group".

Cap it at ${MAX_GRAPH_NODES} nodes; pick the architecturally significant files/directories (entry points, core modules, key configs, data stores), not every file.`;

function buildGraphPrompt(tree, explanation, priorErrors) {
  const parts = [`File tree:\n${treeToText(tree)}`, `\nArchitecture explanation:\n${explanation}`];
  if (priorErrors?.length) {
    parts.push(`\nYour previous output had these problems, fix them:\n${priorErrors.join("\n")}`);
  }
  return parts.join("\n");
}

/**
 * Lists everything wrong with a model-produced graph: unknown paths (hallucinated
 * files), missing/duplicate node ids, edges pointing at nodes that do not exist.
 * @param {Set<string>} realPaths paths from the actual repository tree
 * @returns {string[]} empty when the graph is valid
 */
export function validateGraph(graph, realPaths) {
  const errors = [];
  const nodeIds = new Set();

  for (const n of graph?.nodes || []) {
    if (!n?.id || !n?.path) {
      errors.push(`node missing id or path: ${JSON.stringify(n)}`);
      continue;
    }
    if (!realPaths.has(n.path)) errors.push(`node "${n.id}" has unknown path "${n.path}"`);
    if (nodeIds.has(n.id)) errors.push(`duplicate node id "${n.id}"`);
    nodeIds.add(n.id);
  }

  for (const e of graph?.edges || []) {
    if (!nodeIds.has(e.from)) errors.push(`edge references unknown node "${e.from}"`);
    if (!nodeIds.has(e.to)) errors.push(`edge references unknown node "${e.to}"`);
  }

  return errors;
}

/** Keeps only the valid parts of a graph (used when retries run out). */
export function repairGraph(graph, realPaths) {
  const nodes = [];
  const seen = new Set();
  for (const n of graph?.nodes || []) {
    if (!n?.id || !n?.path || !realPaths.has(n.path) || seen.has(n.id)) continue;
    seen.add(n.id);
    nodes.push(n);
  }
  const edges = (graph?.edges || []).filter((e) => seen.has(e.from) && seen.has(e.to));
  return { groups: graph?.groups || [], nodes, edges };
}

/** Keeps only the fields the app uses, coerced to values the Analysis schema accepts. */
export function normalizeGraph(graph) {
  return {
    groups: (graph.groups || []).filter((g) => g?.id).map((g) => ({ id: String(g.id), label: String(g.label ?? g.id) })),
    nodes: graph.nodes.map((n) => ({
      id: String(n.id),
      label: String(n.label ?? n.path),
      detail: String(n.detail ?? ""),
      path: n.path,
      group: n.group == null ? null : String(n.group),
      kind: n.kind === "dir" ? "dir" : "file",
      role: NODE_ROLES.includes(n.role) ? n.role : "default",
    })),
    edges: graph.edges.map((e) => ({ from: String(e.from), to: String(e.to), label: String(e.label ?? "") })),
  };
}

/** Parses model output as JSON, tolerating ```json fences. @throws SyntaxError */
export function parseJsonLoose(raw) {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(trimmed);
}

/**
 * One Gemini call: a short plain-English description of the architecture.
 * @throws Error("rate_limited") or a generic error from the Gemini client
 */
export function generateExplanation(tree, readme, { apiKey, signal }) {
  return llmComplete(buildExplanationPrompt(tree, readme), { system: EXPLANATION_SYSTEM, signal, apiKey });
}

/**
 * Up to 3 Gemini calls: asks for the graph, and when the answer is invalid,
 * asks again with the list of problems. If every attempt is invalid, the last
 * one is repaired (invalid nodes/edges dropped).
 * @returns {Promise<object|null>} a normalized graph, or null if nothing usable came back
 * @throws Error("rate_limited") or a generic error from the Gemini client
 */
export async function generateGraph(tree, explanation, { apiKey, signal }) {
  const realPaths = new Set(tree.map((e) => e.path));
  let graph = null;
  let lastErrors = [];

  for (let attempt = 0; attempt < MAX_GRAPH_ATTEMPTS; attempt++) {
    const raw = await llmComplete(buildGraphPrompt(tree, explanation, lastErrors), {
      system: GRAPH_SYSTEM,
      format: "json",
      signal,
      apiKey,
    });

    let candidate;
    try {
      candidate = parseJsonLoose(raw);
    } catch {
      lastErrors = ["previous response was not valid JSON"];
      continue;
    }

    lastErrors = validateGraph(candidate, realPaths);
    if (lastErrors.length === 0) {
      graph = candidate;
      break;
    }
    graph = repairGraph(candidate, realPaths);
  }

  if (!graph || graph.nodes.length === 0) return null;
  return normalizeGraph(graph);
}
