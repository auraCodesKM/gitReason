import {
  parseRepoPath,
  fetchRepo,
  fetchTree,
  fetchReadme,
  fetchFileContent,
} from "./github.js";
import { filterTree } from "./noiseFilter.js";
import { llmComplete } from "./llm.js";
import { analysesRepo } from "./db/index.js";
import { getSession } from "./session.js";

const MAX_README_CHARS = 4000;
const MAX_GRAPH_NODES = 40;
const MAX_GRAPH_ATTEMPTS = 3;
const MAX_TREE_ENTRIES_IN_PROMPT = 400; // keeps prompts small — faster and cheaper per call

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

function validateGraph(graph, realPaths) {
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

function repairGraph(graph, realPaths) {
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

function parseJsonLoose(raw) {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(trimmed);
}

export async function handleAnalyzeStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // If the browser navigates away or closes the tab mid-analysis, abort the
  // in-flight LLM call instead of paying for a response no one reads.
  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    const parsed = parseRepoPath(req.query.repo);
    if (!parsed) {
      send("error", { message: "invalid" });
      return res.end();
    }

    const session = getSession(req);
    const token = session?.token;

    send("phase", { phase: "checking_access" });
    let repoResult;
    try {
      repoResult = await fetchRepo(parsed.owner, parsed.repo, token);
    } catch (err) {
      send("error", { message: err.message === "rate_limited" ? "rate_limited" : "error" });
      return res.end();
    }
    if (!repoResult.found) {
      send("error", { message: token ? "not_found" : "auth_required", repo: parsed.fullName });
      return res.end();
    }

    send("phase", { phase: "fetching_tree" });
    const treeResult = await fetchTree(parsed.owner, parsed.repo, repoResult.repo.defaultBranch, token);
    if (treeResult.truncated) {
      send("error", { message: "repo_too_large" });
      return res.end();
    }
    const filteredTree = filterTree(treeResult.tree);
    if (filteredTree.length === 0) {
      send("error", { message: "error" });
      return res.end();
    }

    send("phase", { phase: "reading_readme" });
    const readme = await fetchReadme(parsed.owner, parsed.repo, token);

    send("phase", { phase: "generating_explanation" });
    let explanation;
    try {
      explanation = await llmComplete(buildExplanationPrompt(filteredTree, readme), {
        system: EXPLANATION_SYSTEM,
        signal: abortController.signal,
      });
    } catch (err) {
      send("error", { message: err.message === "rate_limited" ? "rate_limited" : "error" });
      return res.end();
    }
    send("explanation", { text: explanation });

    send("phase", { phase: "generating_graph" });
    const realPaths = new Set(filteredTree.map((e) => e.path));
    let graph = null;
    let lastErrors = [];

    for (let attempt = 0; attempt < MAX_GRAPH_ATTEMPTS; attempt++) {
      let raw;
      try {
        raw = await llmComplete(buildGraphPrompt(filteredTree, explanation, lastErrors), {
          system: GRAPH_SYSTEM,
          format: "json",
          signal: abortController.signal,
        });
      } catch (err) {
        send("error", { message: err.message === "rate_limited" ? "rate_limited" : "error" });
        return res.end();
      }

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
      graph = repairGraph(candidate, realPaths); // fallback if this is the last attempt
    }

    if (!graph || graph.nodes.length === 0) {
      send("error", { message: "graph_generation_failed" });
      return res.end();
    }

    send("phase", { phase: "saving" });
    let analysisId = null;
    if (session?.userId) {
      analysisId = analysesRepo.create({
        userId: session.userId,
        repoFullName: parsed.fullName,
        status: "complete",
        fileTree: filteredTree,
        explanation,
        graph,
      });
    }

    send("done", {
      repo: parsed.fullName,
      defaultBranch: repoResult.repo.defaultBranch,
      tree: filteredTree,
      explanation,
      graph,
      analysisId,
    });
  } catch (err) {
    send("error", { message: "error" });
  } finally {
    res.end();
  }
}

export async function handleFileContent(req, res) {
  const parsed = parseRepoPath(req.query.repo);
  if (!parsed) return res.status(400).json({ status: "invalid" });

  const filePath = req.query.path;
  const ref = req.query.ref;
  if (!filePath || !ref) return res.status(400).json({ status: "invalid" });

  const session = getSession(req);

  const content = await fetchFileContent(parsed.owner, parsed.repo, filePath, ref, session?.token);
  if (content === null) return res.status(404).json({ status: "not_found" });

  res.json({ path: filePath, content });
}
