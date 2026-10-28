// Repository endpoints that work with or without signing in: check a repo,
// run an analysis (streamed), read one file. Signing in adds the user's GitHub
// token (private repos) and makes the analysis saved to their history.
import { parseRepoPath, fetchRepo, fetchTree, fetchReadme, fetchFileContent } from "../../integrations/github.js";
import { getSessionFromRequest } from "../auth/session.service.js";
import { userService } from "../users/user.service.js";
import { analysisService } from "./analysis.service.js";
import { filterTree } from "./noise-filter.js";
import { generateExplanation, generateGraph } from "./analysis.ai.js";

const errorCode = (err) => (err.message === "rate_limited" ? "rate_limited" : "error");

/** GET /api/repo/check?url=owner/name - does the repo exist and can this visitor see it? */
export async function handleRepoCheck(req, res) {
  const parsed = parseRepoPath(req.query.url);
  if (!parsed) return res.status(400).json({ status: "invalid" });

  const session = await getSessionFromRequest(req);
  try {
    const result = await fetchRepo(parsed.owner, parsed.repo, session?.token);
    if (!result.found) {
      // Signed in and still not visible: it does not exist (for this account).
      // Signed out: it may be private, so suggest signing in.
      if (session) return res.status(404).json({ status: "not_found", repo: parsed.fullName });
      return res.json({ status: "auth_required", repo: parsed.fullName });
    }
    return res.json({ status: "ready", repo: result.repo });
  } catch (err) {
    if (err.message === "rate_limited") {
      return res.status(429).json({ status: "rate_limited", message: "GitHub rate limit reached." });
    }
    return res.status(502).json({ status: "error", message: "Could not reach GitHub." });
  }
}

/**
 * GET /api/analyze/stream?repo=owner/name
 *
 * Server-Sent Events: the browser keeps one response open and receives
 * `phase` events as work progresses, then one `done` (or `error`) event.
 * Steps: check access -> fetch tree -> (reuse a saved analysis if the tree is
 * unchanged) -> README -> Gemini explanation -> Gemini graph -> save if signed in.
 * Errors are sent as an `error` event with a short code, never a stack trace.
 */
export async function handleAnalyzeStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Closing the tab cancels any Gemini request still in flight.
  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    const parsed = parseRepoPath(req.query.repo);
    if (!parsed) {
      send("error", { message: "invalid" });
      return res.end();
    }

    const session = await getSessionFromRequest(req);
    const token = session?.token;
    // Signed-in users must use their own Gemini key; anonymous runs use the server key.
    const geminiKey = session?.userId ? await userService.getGeminiKey(session.userId) : null;
    if (session?.userId && !geminiKey) {
      send("error", { message: "gemini_key_required" });
      return res.end();
    }
    const ai = { apiKey: geminiKey, signal: abortController.signal };

    send("phase", { phase: "checking_access" });
    let repoResult;
    try {
      repoResult = await fetchRepo(parsed.owner, parsed.repo, token);
    } catch (err) {
      send("error", { message: errorCode(err) });
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

    // Unchanged repository (same git tree SHA) already analyzed by this user:
    // serve the saved result. No Gemini calls, no new database document.
    if (session?.userId && treeResult.sha) {
      const saved = await analysisService.findLatestForTree(session.userId, parsed.fullName, treeResult.sha);
      if (saved) {
        send("explanation", { text: saved.explanation });
        send("done", {
          repo: parsed.fullName,
          defaultBranch: saved.defaultBranch || repoResult.repo.defaultBranch,
          tree: saved.fileTree,
          explanation: saved.explanation,
          graph: saved.graph,
          analysisId: saved.id,
          reused: true,
        });
        return res.end();
      }
    }

    send("phase", { phase: "reading_readme" });
    const readme = await fetchReadme(parsed.owner, parsed.repo, token);

    send("phase", { phase: "generating_explanation" });
    let explanation;
    try {
      explanation = await generateExplanation(filteredTree, readme, ai);
    } catch (err) {
      send("error", { message: errorCode(err) });
      return res.end();
    }
    send("explanation", { text: explanation });

    send("phase", { phase: "generating_graph" });
    let graph;
    try {
      graph = await generateGraph(filteredTree, explanation, ai);
    } catch (err) {
      send("error", { message: errorCode(err) });
      return res.end();
    }
    if (!graph) {
      send("error", { message: "graph_generation_failed" });
      return res.end();
    }

    send("phase", { phase: "saving" });
    let analysisId = null;
    if (session?.userId) {
      try {
        analysisId = await analysisService.create({
          userId: session.userId,
          repoOwner: parsed.owner,
          repoName: parsed.repo,
          defaultBranch: repoResult.repo.defaultBranch,
          treeSha: treeResult.sha,
          fileTree: filteredTree,
          explanation,
          graph,
          language: repoResult.repo.language,
        });
      } catch (err) {
        // The result is still shown; it just isn't added to history.
        console.error("Saving analysis failed:", err.message);
      }
    }

    send("done", {
      repo: parsed.fullName,
      defaultBranch: repoResult.repo.defaultBranch,
      tree: filteredTree,
      explanation,
      graph,
      analysisId,
    });
  } catch {
    send("error", { message: "error" });
  } finally {
    res.end();
  }
}

/** GET /api/repo/file?repo&path&ref - one file's text for the code preview (fetched from GitHub, not stored). */
export async function handleFileContent(req, res) {
  const parsed = parseRepoPath(req.query.repo);
  if (!parsed) return res.status(400).json({ status: "invalid" });

  const filePath = req.query.path;
  const ref = req.query.ref;
  if (!filePath || !ref) return res.status(400).json({ status: "invalid" });

  const session = await getSessionFromRequest(req);
  const content = await fetchFileContent(parsed.owner, parsed.repo, filePath, ref, session?.token);
  if (content === null) return res.status(404).json({ status: "not_found" });

  res.json({ path: filePath, content });
}
