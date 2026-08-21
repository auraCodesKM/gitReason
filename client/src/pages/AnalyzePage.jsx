import { useEffect, useState } from "react";
import { Agentation } from "agentation";
import { LogoMark } from "../sections/LogoMark";
import { ThinkingShimmer } from "../sections/ThinkingShimmer";
import ArchitectureView from "../architecture/ArchitectureView";
import CodebaseGraph from "../graph/CodebaseGraph";
import { GraphErrorBoundary } from "../graph/GraphErrorBoundary";
import { useFilePreview } from "../hooks/useFilePreview";
import { apiFetch, apiUrl } from "../lib/api";
import "./analyze-page.css";

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
  gemini_key_required: "Add your own Gemini API key in Settings to analyze repositories from your dashboard.",
  error: "Something went wrong. Try again.",
};

export default function AnalyzePage() {
  const [phase, setPhase] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [tree, setTree] = useState([]);
  const [graph, setGraph] = useState(null);
  const [repo, setRepo] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  // Lets the dashboard's "Graph" action deep-link straight into that tab
  // instead of always landing on Architecture first.
  const [view, setView] = useState(
    () => (new URLSearchParams(window.location.search).get("view") === "graph" ? "graph" : "architecture")
  );
  const [graphFocusPath, setGraphFocusPath] = useState(null);

  const filePreview = useFilePreview(repo, defaultBranch);

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
      apiFetch(`/api/user/history/${cachedId}`)
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

    const es = new EventSource(apiUrl(`/api/analyze/stream?repo=${encodeURIComponent(repoParam)}`), { withCredentials: true });
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

  const currentPhaseIndex = PHASES.findIndex((p) => p.key === phase);
  const ready = !errorCode && phase === "done";

  return (
    <div className="analyze-page">
      <header className="analyze-topbar">
        <a href="/" className="analyze-logo" aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>
        <span className="analyze-repo-name">{repo}</span>

        {ready && (
          <nav className="analyze-tabs" aria-label="View">
            <button type="button" className={view === "architecture" ? "is-active" : ""} onClick={() => setView("architecture")}>
              Architecture
            </button>
            <button type="button" className={view === "graph" ? "is-active" : ""} onClick={() => setView("graph")}>
              Graph
            </button>
          </nav>
        )}

        <a href="/dashboard" className="analyze-dashboard-link">Dashboard</a>
      </header>

      {errorCode && (
        <div className="analyze-status">
          <p className="repo-input-error">{ERROR_COPY[errorCode] || ERROR_COPY.error}</p>
          {errorCode === "gemini_key_required" ? (
            <a href="/settings" className="btn btn-solid">Add API key</a>
          ) : (
            <a href="/" className="btn btn-ghost">Back to home</a>
          )}
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

      {ready && view === "architecture" && (
        <ArchitectureView
          tree={tree}
          explanation={explanation}
          graph={graph}
          selectedPath={filePreview.selectedPath}
          fileHtml={filePreview.fileHtml}
          fileLoading={filePreview.fileLoading}
          onOpenFile={filePreview.openFile}
          onCloseFile={filePreview.closeFile}
          onExploreInGraph={(path) => {
            setGraphFocusPath(path);
            setView("graph");
          }}
        />
      )}

      {ready && view === "graph" && (
        <div className="graph-view-shell">
          {graph && (
            <GraphErrorBoundary nodes={graph.nodes}>
              <CodebaseGraph
                graph={graph}
                repo={repo}
                defaultBranch={defaultBranch}
                focusPath={graphFocusPath}
                onFocusApplied={() => setGraphFocusPath(null)}
                onViewInArchitecture={(path) => {
                  filePreview.openFile(path);
                  setView("architecture");
                }}
              />
            </GraphErrorBoundary>
          )}
        </div>
      )}

      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </div>
  );
}
