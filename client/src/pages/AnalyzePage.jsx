import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { codeToHtml } from "shiki";
import Markdown from "markdown-to-jsx";
import { LogoMark } from "../sections/LogoMark";
import { graphToMermaid } from "../lib/graphToMermaid";
import { ThinkingShimmer } from "../sections/ThinkingShimmer";
import "./analyze-page.css";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "antiscript",
  themeVariables: {
    background: "#0a0a0a",
    primaryColor: "#111111",
    primaryBorderColor: "rgba(255,255,255,0.16)",
    primaryTextColor: "#f2f2f2",
    lineColor: "rgba(86,211,100,0.55)",
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
    fontSize: "13px",
  },
});

const PHASES = [
  { key: "checking_access", label: "Checking access" },
  { key: "fetching_tree", label: "Fetching file tree" },
  { key: "reading_readme", label: "Reading README" },
  { key: "generating_explanation", label: "Understanding architecture" },
  { key: "generating_graph", label: "Building diagram" },
  { key: "saving", label: "Saving" },
];

const ERROR_COPY = {
  invalid: "Enter a valid GitHub repository, like owner/repository.",
  auth_required: "This repository needs GitHub access.",
  not_found: "Repository not found or not accessible with this account.",
  repo_too_large: "This repository is too large to analyze right now.",
  graph_generation_failed: "Couldn't build a reliable diagram for this repository. Try again.",
  rate_limited: "Rate limit reached. Try again shortly.",
  error: "Something went wrong. Try again.",
};

const EXT_LANG = {
  js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", mjs: "javascript", cjs: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", c: "c", h: "c",
  cpp: "cpp", hpp: "cpp", cs: "csharp", php: "php", swift: "swift", scala: "scala",
  html: "html", css: "css", scss: "scss", json: "json", yml: "yaml", yaml: "yaml",
  md: "markdown", sh: "bash", sql: "sql", toml: "toml", xml: "xml", vue: "vue",
};

const STEP_MS = 70;

// Diagrams arrive fully-formed (a partial graph JSON isn't valid to parse
// mid-stream), so instead of literal token-by-token generation we fake the
// feel of it being drawn live: clusters appear first, then their nodes in
// order, then edges once both endpoints are visible.
function staggerReveal(container, nodeOrder) {
  if (!container) return;
  let i = 0;

  // Mermaid positions nodes/clusters via a native SVG `transform="translate(x,y)"`
  // attribute, and a CSS `transform` on the same element replaces that
  // attribute outright rather than composing with it — animating scale/translate
  // via CSS collapses every node to the same spot. Opacity never touches
  // positioning, so it's the only safe animatable property here.
  const clusters = container.querySelectorAll(".cluster");
  clusters.forEach((el) => {
    el.style.setProperty("--reveal-delay", `${i++ * STEP_MS}ms`);
    el.classList.add("diagram-reveal", "diagram-reveal-cluster");
  });

  for (const mid of nodeOrder) {
    // Mermaid prefixes ids with its own render id (e.g. "gitreason-diagram-
    // flowchart-{mid}-{n}"), so match anywhere in the id, not just the start.
    const node = container.querySelector(`[id*="flowchart-${mid}-"], [id$="flowchart-${mid}"]`);
    if (!node) continue;
    node.style.setProperty("--reveal-delay", `${i++ * STEP_MS}ms`);
    node.classList.add("diagram-reveal", "diagram-reveal-node");
  }

  const edgePaths = container.querySelectorAll(".edgePaths path, .edgePath path");
  const edgeLabels = container.querySelectorAll(".edgeLabels .edgeLabel, .edgeLabel");
  let ei = 0;
  edgePaths.forEach((el) => {
    el.style.setProperty("--reveal-delay", `${i + ei * STEP_MS}ms`);
    el.classList.add("diagram-reveal", "diagram-reveal-edge");
    ei++;
  });
  ei = 0;
  edgeLabels.forEach((el) => {
    el.style.setProperty("--reveal-delay", `${i + ei * STEP_MS}ms`);
    el.classList.add("diagram-reveal", "diagram-reveal-edge");
    ei++;
  });
}

function langFor(path) {
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  return EXT_LANG[ext] || "text";
}

function buildFileTree(flatTree) {
  const root = { name: "", children: new Map(), isDir: true };
  for (const entry of flatTree) {
    const parts = entry.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const name = parts[i];
      if (!node.children.has(name)) {
        node.children.set(name, { name, path: parts.slice(0, i + 1).join("/"), children: new Map(), isDir: !isLast || entry.type === "dir" });
      }
      node = node.children.get(name);
    }
  }
  return root;
}

function TreeNode({ node, depth, selectedPath, onSelect }) {
  const [open, setOpen] = useState(depth < 1);
  const entries = [...node.children.values()].sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));

  if (node.isDir) {
    return (
      <div className="tree-dir">
        <button type="button" className="tree-row tree-dir-row" style={{ "--depth": depth }} onClick={() => setOpen((v) => !v)}>
          <span className={`tree-caret ${open ? "is-open" : ""}`}>›</span>
          {node.name || "/"}
        </button>
        {open && entries.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`tree-row tree-file-row ${selectedPath === node.path ? "is-selected" : ""}`}
      style={{ "--depth": depth }}
      onClick={() => onSelect(node.path)}
    >
      {node.name}
    </button>
  );
}

export default function AnalyzePage() {
  const [phase, setPhase] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [tree, setTree] = useState([]);
  const [graph, setGraph] = useState(null);
  const [repo, setRepo] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [diagramSvg, setDiagramSvg] = useState("");
  const [diagramIdMap, setDiagramIdMap] = useState(null);
  const [diagramNodeOrder, setDiagramNodeOrder] = useState([]);
  const [diagramFailed, setDiagramFailed] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [fileHtml, setFileHtml] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const diagramRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repoParam = params.get("repo");
    const cachedId = params.get("cached");
    if (!repoParam) {
      setErrorCode("invalid");
      return;
    }
    setRepo(repoParam);

    if (cachedId) {
      fetch(`/api/user/history/${cachedId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.analysis) return setErrorCode("not_found");
          setTree(data.analysis.fileTree);
          setExplanation(data.analysis.explanation || "");
          setGraph(data.analysis.graph);
          setPhase("done");
        })
        .catch(() => setErrorCode("error"));
      return;
    }

    const es = new EventSource(`/api/analyze/stream?repo=${encodeURIComponent(repoParam)}`);
    es.addEventListener("phase", (e) => setPhase(JSON.parse(e.data).phase));
    es.addEventListener("explanation", (e) => setExplanation(JSON.parse(e.data).text));
    es.addEventListener("error", (e) => {
      const data = e.data ? JSON.parse(e.data) : { message: "error" };
      if (data.message === "auth_required") {
        window.location.href = `/sign?repo=${encodeURIComponent(repoParam)}`;
        return;
      }
      setErrorCode(data.message || "error");
      es.close();
    });
    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      setTree(data.tree);
      setExplanation(data.explanation);
      setGraph(data.graph);
      setDefaultBranch(data.defaultBranch);
      setPhase("done");
      es.close();
    });
    es.onerror = () => {
      setErrorCode((prev) => prev || "error");
      es.close();
    };

    return () => es.close();
  }, []);

  useEffect(() => {
    if (!graph || !diagramRef.current) return;
    let cancelled = false;
    const { text, idMap, nodeOrder } = graphToMermaid(graph);
    mermaid
      .render("gitreason-diagram", text)
      .then(({ svg }) => {
        if (cancelled) return;
        setDiagramSvg(svg);
        setDiagramIdMap(idMap);
        setDiagramNodeOrder(nodeOrder);
      })
      .catch((err) => {
        console.error("Diagram render failed:", err);
        if (!cancelled) setDiagramFailed(true);
      });
    return () => { cancelled = true; };
  }, [graph]);

  // Runs strictly after React commits diagramSvg into the DOM (unlike a
  // requestAnimationFrame scheduled from inside the render-promise .then(),
  // which can fire before the commit and find an empty container).
  useEffect(() => {
    if (!diagramSvg || !diagramRef.current) return;
    staggerReveal(diagramRef.current, diagramNodeOrder);
  }, [diagramSvg, diagramNodeOrder]);

  useEffect(() => {
    if (!diagramRef.current || !diagramIdMap) return;
    const container = diagramRef.current;
    function onClick(e) {
      const target = e.target.closest("[id]");
      if (!target) return;
      for (const [originalId, mid] of diagramIdMap) {
        if (target.id.endsWith(`flowchart-${mid}`) || target.id.includes(`flowchart-${mid}-`)) {
          const node = graph.nodes.find((n) => n.id === originalId);
          if (node) openFile(node.path);
          return;
        }
      }
    }
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [diagramSvg, diagramIdMap, graph]);

  function openFile(path) {
    setSelectedPath(path);
    setFileLoading(true);
    setFileHtml("");
    fetch(`/api/repo/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&ref=${encodeURIComponent(defaultBranch)}`)
      .then((res) => res.json())
      .then(async (data) => {
        if (!data.content) {
          setFileHtml('<p class="file-preview-empty">Couldn’t load this file.</p>');
          return;
        }
        const html = await codeToHtml(data.content, { lang: langFor(path), theme: "github-dark" });
        setFileHtml(html);
      })
      .catch(() => setFileHtml('<p class="file-preview-empty">Couldn’t load this file.</p>'))
      .finally(() => setFileLoading(false));
  }

  const fileTreeRoot = tree.length ? buildFileTree(tree) : null;
  const currentPhaseIndex = PHASES.findIndex((p) => p.key === phase);

  return (
    <div className="analyze-page">
      <header className="analyze-topbar">
        <a href="/" className="analyze-logo" aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>
        <span className="analyze-repo-name">{repo}</span>
        <a href="/dashboard" className="analyze-dashboard-link">Dashboard</a>
      </header>

      {errorCode && (
        <div className="analyze-status">
          <p className="repo-input-error">{ERROR_COPY[errorCode] || ERROR_COPY.error}</p>
          <a href="/" className="btn btn-ghost">Back to home</a>
        </div>
      )}

      {!errorCode && phase !== "done" && (
        <div className="analyze-status">
          <ul className="analyze-phases">
            {PHASES.map((p, i) => (
              <li key={p.key} className={`analyze-phase ${i < currentPhaseIndex ? "is-done" : i === currentPhaseIndex ? "is-active" : ""}`}>
                <span className="analyze-phase-dot" aria-hidden="true" />
                {i === currentPhaseIndex ? <ThinkingShimmer text={p.label} /> : p.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!errorCode && phase === "done" && (
        <div className="analyze-body">
          <aside className="analyze-tree">
            {fileTreeRoot && <TreeNode node={fileTreeRoot} depth={0} selectedPath={selectedPath} onSelect={openFile} />}
          </aside>

          <main className="analyze-main">
            {explanation && (
              <div className="analyze-explanation">
                <Markdown options={{ forceBlock: true }}>{explanation}</Markdown>
              </div>
            )}
            {diagramFailed ? (
              <ul className="analyze-diagram-fallback">
                {(graph?.nodes || []).map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => openFile(n.path)}>{n.label}</button>
                    <span className="analyze-diagram-fallback-path">{n.path}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="analyze-diagram" ref={diagramRef} dangerouslySetInnerHTML={{ __html: diagramSvg }} />
            )}
          </main>

          {selectedPath && (
            <aside className="analyze-preview">
              <div className="analyze-preview-head">
                <span>{selectedPath}</span>
                <button type="button" className="analyze-preview-close" onClick={() => setSelectedPath(null)} aria-label="Close">
                  ×
                </button>
              </div>
              {fileLoading ? (
                <p className="file-preview-empty">Loading…</p>
              ) : (
                <div className="analyze-preview-body" dangerouslySetInnerHTML={{ __html: fileHtml }} />
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
