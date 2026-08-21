import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import mermaid from "mermaid";
import { graphToMermaid } from "../lib/graphToMermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "var(--mono-code, ui-monospace, monospace)",
  flowchart: { htmlLabels: true, curve: "basis", padding: 12 },
});

let renderCount = 0;

const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Staggers a fade-in over the already-laid-out SVG. Mermaid positions every
// node/edge via an SVG transform="translate(...)" attribute — a CSS
// transform on top of that REPLACES it instead of composing, so the reveal
// is opacity-only, never transform-based.
function revealDiagram(container) {
  const groups = [...container.querySelectorAll(".node, .cluster")];
  const edges = [...container.querySelectorAll(".edgePath, .edgeLabel")];
  if (REDUCED_MOTION) return;
  groups.forEach((el, i) => {
    el.style.opacity = "0";
    el.style.transition = `opacity 420ms ease ${Math.min(i * 28, 600)}ms`;
  });
  edges.forEach((el, i) => {
    el.style.opacity = "0";
    el.style.transition = `opacity 320ms ease ${Math.min(300 + i * 14, 900)}ms`;
  });
  requestAnimationFrame(() => {
    groups.forEach((el) => (el.style.opacity = "1"));
    edges.forEach((el) => (el.style.opacity = "1"));
  });
}

export default function ArchitectureDiagram({ graph, onOpenFile }) {
  const wrapRef = useRef(null);
  const diagramRef = useRef(null);
  const idMapRef = useRef(new Map());
  const [failed, setFailed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const { definition, idMap } = graphToMermaid(graph);
    idMapRef.current = idMap;

    mermaid
      .render(`arch-diagram-${renderCount++}`, definition)
      .then(({ svg }) => {
        if (cancelled || !diagramRef.current) return;
        diagramRef.current.innerHTML = svg;
        revealDiagram(diagramRef.current);
      })
      .catch((err) => {
        console.error("Mermaid render failed:", err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [graph]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === wrapRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapRef.current?.requestFullscreen?.();
    }
  }

  function handleClick(e) {
    const el = e.target.closest('[id^="flowchart-"]');
    if (!el) return;
    const m = el.id.match(/^flowchart-(.+)-\d+$/);
    if (!m) return;
    const node = idMapRef.current.get(m[1]);
    if (node) onOpenFile(node.path);
  }

  if (failed) {
    return (
      <ul className="analyze-diagram-fallback">
        {(graph.nodes || []).map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => onOpenFile(n.path)}>{n.label}</button>
            <span className="analyze-diagram-fallback-path">{n.path}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="analyze-diagram-wrap" ref={wrapRef}>
      <button
        type="button"
        className="analyze-diagram-fullscreen-btn"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? <Minimize2 size={15} strokeWidth={2} /> : <Maximize2 size={15} strokeWidth={2} />}
      </button>
      <div className="analyze-diagram" ref={diagramRef} onClick={handleClick} />
    </div>
  );
}
