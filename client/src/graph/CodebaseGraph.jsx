import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { drag as d3drag } from "d3-drag";
import { select } from "d3-selection";
import { buildGraphModel, radiusFor } from "./graphData";
import { bfsLocalGraph, blastRadius, edgeKeyOf } from "./graphTraversal";
import { createSettledSimulation } from "./useForceSimulation";
import { createZoomBehavior, boundsOf } from "./useGraphZoom";
import { useFilePreview } from "../hooks/useFilePreview";
import { GraphNode } from "./GraphNode";
import { GraphEdge } from "./GraphEdge";
import { GraphSidePanel } from "./GraphSidePanel";
import { GraphSearchPill } from "./GraphSearchPill";
import { GraphCommandPalette } from "./GraphCommandPalette";
import { GraphHopControl } from "./GraphHopControl";
import { GraphSettingsPopover } from "./GraphSettingsPopover";
import { GraphMinimap } from "./GraphMinimap";
import "./codebase-graph.css";

const REVEAL_DURATION = 900;
const REVEAL_STAGGER = 18;
const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const FIT_PADDING = { top: 56, right: 56, bottom: 56, left: 56 };
const ROLE_LABEL = { entry: "Entry point", service: "Service", store: "Data store", default: "Component" };

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// The Graph view — a minimal, full-bleed Obsidian-style exploration surface.
// LESS UI, MORE GRAPH: no permanent toolbar, no rows of filter pills, no
// oversized legend or minimap. Just the canvas, a couple of small floating
// controls, and a compact panel that only appears once something is
// selected. Advanced filters live behind a single settings icon.
export default function CodebaseGraph({ graph, repo, defaultBranch, focusPath, onFocusApplied, onViewInArchitecture }) {
  const model = useMemo(() => buildGraphModel(graph), [graph]);
  const { fileHtml, fileLoading, openFile } = useFilePreview(repo, defaultBranch);

  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const zoomGroupRef = useRef(null);
  const nodeElsRef = useRef(new Map());
  const edgeElsRef = useRef(new Map());
  const simRef = useRef(null); // { simNodes, simLinks, simulation, nodesById }
  const zoomApiRef = useRef(null);
  const revealedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoverTooltip, setHoverTooltip] = useState(null); // { nodeId, x, y }
  const [mode, setMode] = useState("local"); // "local" | "blast"
  const [hopDepth, setHopDepth] = useState(2); // 1 | 2 | 3 | Infinity
  const [activeRoles, setActiveRoles] = useState(null); // null = all active
  const [activeGroups, setActiveGroups] = useState(null);
  const [activeRelLabels, setActiveRelLabels] = useState(null);
  const [searchMatchIds, setSearchMatchIds] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  // ---- build + settle simulation, run the staged reveal, wire zoom/drag ----
  useLayoutEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    const zoomGroup = zoomGroupRef.current;
    if (!container || !svg || !zoomGroup || !model.nodes.length) return;

    revealedRef.current = false;
    setReady(false);
    setSelectedNodeId(null);

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 600;

    const { simNodes, simLinks, simulation, centroidFor } = createSettledSimulation({
      nodes: model.nodes,
      links: model.links,
      adjacency: model.adjacency,
      groupIds: model.groupIds,
      width,
      height,
    });
    const nodesById = new Map(simNodes.map((n) => [n.id, n]));
    simRef.current = { simNodes, simLinks, simulation, nodesById };

    const zoomApi = createZoomBehavior({ svgEl: svg, zoomGroupEl: zoomGroup });
    zoomApiRef.current = zoomApi;

    function writeEdgePath(link) {
      const el = edgeElsRef.current.get(edgeKeyOf(link));
      if (!el) return;
      const sx = link.source.x, sy = link.source.y, tx = link.target.x, ty = link.target.y;
      el.setAttribute("d", `M${sx},${sy}L${tx},${ty}`);
    }

    function writeNodeTransform(node) {
      const el = nodeElsRef.current.get(node.id);
      if (el) el.setAttribute("transform", `translate(${node.x},${node.y})`);
    }

    // Live tick handler — only ever active after the reveal, and only
    // matters again once a drag reheats the simulation.
    simulation.on("tick", () => {
      simNodes.forEach(writeNodeTransform);
      simLinks.forEach(writeEdgePath);
    });

    // Stagger order: group-by-group, then by node within a group.
    const order = [...simNodes].sort((a, b) => {
      const ga = model.groupIds.indexOf(a.group);
      const gb = model.groupIds.indexOf(b.group);
      return ga !== gb ? ga - gb : 0;
    });
    const delayFor = new Map(order.map((n, i) => [n.id, i * REVEAL_STAGGER]));

    // Stage starting positions (group centroid) and paint the very first
    // frame before the browser has a chance to show settled "final" values
    // without animation — the codebase should feel like it's revealing
    // itself, not popping in already-assembled.
    for (const n of simNodes) {
      const start = centroidFor(n);
      n.__start = start;
      writeNodeTransform({ ...n, x: start.x, y: start.y });
    }
    // Spread each endpoint (preserving .id, so the edge-key lookup inside
    // writeEdgePath still resolves) while overriding x/y to the staged
    // start — edges begin collapsed at each node's own reveal origin, not
    // the settled position the source node hasn't animated to yet.
    simLinks.forEach((l) =>
      writeEdgePath({
        source: { ...l.source, x: l.source.__start.x, y: l.source.__start.y },
        target: { ...l.target, x: l.target.__start.x, y: l.target.__start.y },
      })
    );

    function finishReveal() {
      if (revealedRef.current) return;
      revealedRef.current = true;
      simNodes.forEach(writeNodeTransform);
      simLinks.forEach(writeEdgePath);
      zoomApi.fitToBounds(boundsOf(simNodes, 60), FIT_PADDING, REDUCED_MOTION ? 0 : 500);
      wireDrag();
      setReady(true);
    }

    if (REDUCED_MOTION) {
      finishReveal();
    } else {
      const start = performance.now();
      const totalDuration = REVEAL_DURATION + order.length * REVEAL_STAGGER;
      let raf;
      const step = (now) => {
        const elapsed = now - start;
        for (const n of simNodes) {
          const delay = delayFor.get(n.id);
          const t = Math.max(0, Math.min(1, (elapsed - delay) / REVEAL_DURATION));
          const e = easeOutCubic(t);
          const sx = n.__start.x + (n.x - n.__start.x) * e;
          const sy = n.__start.y + (n.y - n.__start.y) * e;
          writeNodeTransform({ ...n, x: sx, y: sy });
        }
        simLinks.forEach((l) => {
          const s = nodesById.get(typeof l.source === "object" ? l.source.id : l.source);
          const t = nodesById.get(typeof l.target === "object" ? l.target.id : l.target);
          // Preserve .id on each endpoint (spread over the interpolated
          // {x,y}) so writeEdgePath's edge-key lookup still resolves —
          // currentPos() alone returns bare coordinates with no identity.
          writeEdgePath({ source: { ...s, ...currentPos(s, delayFor, elapsed) }, target: { ...t, ...currentPos(t, delayFor, elapsed) } });
        });
        if (elapsed < totalDuration) raf = requestAnimationFrame(step);
        else finishReveal();
      };
      function currentPos(n, delays, elapsed) {
        const delay = delays.get(n.id);
        const t = Math.max(0, Math.min(1, (elapsed - delay) / REVEAL_DURATION));
        const e = easeOutCubic(t);
        return { x: n.__start.x + (n.x - n.__start.x) * e, y: n.__start.y + (n.y - n.__start.y) * e };
      }
      raf = requestAnimationFrame(step);
      var cancelReveal = () => cancelAnimationFrame(raf);
    }

    function wireDrag() {
      // d3-drag needs a bound datum per element — bind each simNode to its
      // already-rendered DOM element via the id map (React never data-binds
      // for d3, so this has to happen imperatively here, once, post-reveal).
      nodeElsRef.current.forEach((el, id) => {
        const n = nodesById.get(id);
        select(el)
          .datum(n)
          .call(
            d3drag()
              // Without an explicit container, d3-drag reports event.x/y
              // relative to the dragged <g> itself (which has its own
              // translate(x,y) — a circularly-shifting, meaningless space).
              // The zoom group is the untransformed graph-space root, so
              // event.x/y there land in the same coordinate space as
              // d.x/d.y/d.fx/d.fy, correctly accounting for the current
              // pan/zoom too.
              .container(zoomGroup)
              .on("start", (_event, d) => {
                d.__dragStartX = d.x;
                d.__dragStartY = d.y;
                simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
              })
              .on("drag", (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
              })
              .on("end", (_event, d) => {
                simulation.alphaTarget(0);
                // Stays pinned after drag (deliberate manual arrangement).
                // d3-drag owns mousedown on this element, which unreliably
                // suppresses the browser's native dblclick — so release is
                // detected here instead: two near-zero-movement gestures
                // (clicks) within 350ms count as a double-click and unpin.
                const dx = (d.fx ?? d.x) - d.__dragStartX;
                const dy = (d.fy ?? d.y) - d.__dragStartY;
                const now = performance.now();
                if (Math.hypot(dx, dy) < 4) {
                  if (d.__lastClickEnd && now - d.__lastClickEnd < 350) {
                    d.__lastClickEnd = null;
                    releaseNode(d.id);
                  } else {
                    d.__lastClickEnd = now;
                  }
                } else {
                  d.__lastClickEnd = null;
                }
              })
          );
      });
    }

    return () => {
      simulation.stop();
      zoomApi.destroy();
      if (typeof cancelReveal === "function") cancelReveal();
      // Not clearing nodeElsRef/edgeElsRef here: under StrictMode's
      // synchronous double-invoke this cleanup runs before the next effect's
      // ref callbacks get a chance to refire (that only happens on an actual
      // render pass), so clearing left the maps empty for the surviving run.
      // The maps are keyed by stable node/edge id and don't need wiping
      // between re-invokes of the same mounted component.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // ---- selection / mode derived highlight sets ----
  const highlight = useMemo(() => {
    if (!selectedNodeId) return null;
    if (mode === "blast") {
      return { kind: "blast", ...blastRadius(model.adjacency, selectedNodeId) };
    }
    const { hopById, traversedEdgeKeys } = bfsLocalGraph(model.adjacency, selectedNodeId, hopDepth);
    return { kind: "local", hopById, traversedEdgeKeys };
  }, [selectedNodeId, mode, hopDepth, model.adjacency]);

  const filterHidden = useMemo(() => {
    const hidden = new Set();
    if (!activeRoles && !activeGroups) return hidden;
    for (const n of model.nodes) {
      const roleOk = !activeRoles || activeRoles.has(n.role);
      const groupOk = !activeGroups || !n.group || activeGroups.has(n.group);
      if (!roleOk || !groupOk) hidden.add(n.id);
    }
    return hidden;
  }, [model.nodes, activeRoles, activeGroups]);

  // ---- apply data-state to the DOM (cheap: click/hover/filter frequency, never tick frequency) ----
  useEffect(() => {
    if (!ready) return;
    for (const node of model.nodes) {
      const el = nodeElsRef.current.get(node.id);
      if (!el) continue;
      let state = "idle";
      if (searchMatchIds) {
        state = searchMatchIds.has(node.id) ? "match" : "dimmed";
      } else if (filterHidden.has(node.id)) {
        state = "dimmed";
      } else if (highlight) {
        if (node.id === selectedNodeId) state = "selected";
        else if (highlight.kind === "local") state = highlight.hopById.has(node.id) ? "hop" : "dimmed";
        else if (highlight.kind === "blast") {
          state = highlight.upstream.has(node.id) ? "upstream" : highlight.downstream.has(node.id) ? "downstream" : "dimmed";
        }
      } else if (hoveredNodeId && !selectedNodeId) {
        if (node.id === hoveredNodeId) state = "hover";
        else {
          const a = model.adjacency.get(hoveredNodeId);
          const isNeighbor = a && (a.out.some((o) => o.id === node.id) || a.in.some((o) => o.id === node.id));
          state = isNeighbor ? "hop" : "idle";
        }
      }
      el.setAttribute("data-state", state);
      const activeRadius = radiusFor(model.adjacency, node) * (state === "selected" ? 1.6 : state === "hover" ? 1.2 : 1);
      el.style.setProperty("--r", `${activeRadius}px`);
    }

    for (const link of model.links) {
      const key = edgeKeyOf(link);
      const el = edgeElsRef.current.get(key);
      if (!el) continue;
      let state = "idle";
      if (searchMatchIds) {
        state = "dimmed";
      } else if (activeRelLabels && !activeRelLabels.has(link.label)) {
        state = "dimmed";
      } else if (highlight?.kind === "local") {
        state = highlight.traversedEdgeKeys.has(key) ? "traversed" : "dimmed";
      } else if (highlight?.kind === "blast") {
        if (highlight.upstreamEdgeKeys.has(key)) state = "upstream";
        else if (highlight.downstreamEdgeKeys.has(key)) state = "downstream";
        else state = "dimmed";
      } else if (hoveredNodeId && !selectedNodeId) {
        state = link.source === hoveredNodeId || link.target === hoveredNodeId ? "hop" : "idle";
      }
      el.setAttribute("data-state", state);
    }
  }, [ready, highlight, hoveredNodeId, selectedNodeId, filterHidden, activeRelLabels, searchMatchIds, model]);

  function selectNode(id) {
    setSourceOpen(false);
    setSelectedNodeId((prev) => (prev === id ? null : id));
  }

  function focusOnNode(id) {
    const n = simRef.current?.nodesById.get(id);
    if (n && zoomApiRef.current) zoomApiRef.current.focusOn(n.x, n.y, 1.15);
    setSourceOpen(false);
    setSelectedNodeId(id);
  }

  // Cross-navigation from Architecture's "Explore in Graph →" — focus the
  // node matching that file path once the graph has settled and is ready
  // to be zoomed/selected, then tell the parent the one-shot request was
  // consumed so switching tabs again doesn't re-trigger it.
  useEffect(() => {
    if (!focusPath || !ready) return;
    const match = model.nodes.find((n) => n.path === focusPath);
    if (match) focusOnNode(match.id);
    onFocusApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPath, ready, model.nodes]);

  function releaseNode(id) {
    const n = simRef.current?.nodesById.get(id);
    if (!n) return;
    n.fx = null;
    n.fy = null;
    simRef.current.simulation.alpha(0.3).restart();
  }

  function clearSelection() {
    setSelectedNodeId(null);
    setSourceOpen(false);
  }

  const handleMatchChange = useCallback((ids) => setSearchMatchIds(ids), []);

  function closePalette() {
    setPaletteOpen(false);
    setSearchMatchIds(null);
  }

  // Cmd/Ctrl+K opens the command palette; Escape closes whatever's on top
  // (palette first, then selection) rather than both firing at once.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (paletteOpen) closePalette();
        else if (selectedNodeId) clearSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId, paletteOpen]);

  const paletteCommands = useMemo(() => [
    { id: "fit", label: "Fit to screen", run: () => zoomApiRef.current?.fitToBounds(boundsOf(simRef.current.simNodes, 60), FIT_PADDING) },
    { id: "clear", label: "Clear selection", visible: Boolean(selectedNodeId), run: clearSelection },
    { id: "hop1", label: "Local graph: 1 hop", run: () => setHopDepth(1) },
    { id: "hop2", label: "Local graph: 2 hops", run: () => setHopDepth(2) },
    { id: "hop3", label: "Local graph: 3 hops", run: () => setHopDepth(3) },
    { id: "hopAll", label: "Local graph: All", run: () => setHopDepth(Infinity) },
    { id: "blast", label: "Show Blast Radius", visible: Boolean(selectedNodeId), run: () => setMode("blast") },
    { id: "local", label: "Show Local Graph", visible: Boolean(selectedNodeId), run: () => setMode("local") },
  ], [selectedNodeId]);

  const selectedNode = selectedNodeId ? model.nodesById.get(selectedNodeId) : null;

  return (
    <div className="graph-workspace" ref={containerRef}>
      <svg
        ref={svgRef}
        className="graph-canvas"
        onClick={(e) => { if (e.target === svgRef.current) clearSelection(); }}
      >
        <defs>
          {/* Directional arrows appear only on highlighted edges (traversed
              local-graph paths, blast-radius up/downstream) — idle edges stay
              arrow-less so the graph doesn't read as visually noisy. */}
          <marker id="graph-arrow-accent" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0L8,4L0,8z" fill="var(--accent, #56d364)" />
          </marker>
          <marker id="graph-arrow-gold" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0L8,4L0,8z" fill="#e0ab3c" />
          </marker>
          <marker id="graph-arrow-blue" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0L8,4L0,8z" fill="#4fa8d8" />
          </marker>
        </defs>
        <g ref={zoomGroupRef} className="graph-zoom-root">
          <g className="graph-edges">
            {model.links.map((l) => (
              <GraphEdge key={edgeKeyOf(l)} edgeKey={edgeKeyOf(l)} edgeRef={(el) => el && edgeElsRef.current.set(edgeKeyOf(l), el)} />
            ))}
          </g>
          <g className="graph-nodes">
            {model.nodes.map((n) => (
              <GraphNode
                key={n.id}
                node={n}
                r={radiusFor(model.adjacency, n)}
                groupColor={model.groupColor}
                nodeRef={(el) => el && nodeElsRef.current.set(n.id, el)}
                onPointerEnter={(e) => {
                  setHoveredNodeId(n.id);
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (rect) setHoverTooltip({ nodeId: n.id, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onPointerLeave={() => {
                  setHoveredNodeId((h) => (h === n.id ? null : h));
                  setHoverTooltip((t) => (t?.nodeId === n.id ? null : t));
                }}
                onClick={(e) => { e.stopPropagation(); selectNode(n.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); releaseNode(n.id); }}
              />
            ))}
          </g>
        </g>
      </svg>

      {hoverTooltip && (() => {
        const n = model.nodesById.get(hoverTooltip.nodeId);
        if (!n) return null;
        const groupLabel = n.group ? model.groupsById.get(n.group) || n.group : null;
        return (
          <div className="graph-tooltip" style={{ left: hoverTooltip.x + 14, top: hoverTooltip.y + 14 }}>
            <div className="graph-tooltip-title">{n.label}</div>
            <div className="graph-tooltip-meta">
              <span>{ROLE_LABEL[n.role]}</span>
              {groupLabel && <span>{groupLabel}</span>}
            </div>
            <div className="graph-tooltip-path">{n.path}</div>
          </div>
        );
      })()}

      <div className="graph-float graph-float-top-left">
        <GraphSearchPill onOpen={() => setPaletteOpen(true)} />
      </div>

      {paletteOpen && (
        <GraphCommandPalette
          nodes={model.nodes}
          commands={paletteCommands}
          onSelectNode={focusOnNode}
          onQueryChange={handleMatchChange}
          onClose={closePalette}
        />
      )}

      <div className="graph-float graph-float-top-right">
        <GraphSettingsPopover
          model={model}
          activeRoles={activeRoles}
          onRolesChange={setActiveRoles}
          activeGroups={activeGroups}
          onGroupsChange={setActiveGroups}
          activeRelLabels={activeRelLabels}
          onRelLabelsChange={setActiveRelLabels}
        />
      </div>

      <div className="graph-float graph-float-bottom-center">
        <GraphHopControl
          hopDepth={hopDepth}
          onHopDepthChange={setHopDepth}
          onFitToScreen={() => zoomApiRef.current?.fitToBounds(boundsOf(simRef.current.simNodes, 60), FIT_PADDING)}
        />
      </div>

      <div className="graph-float graph-float-bottom-right">
        <GraphMinimap simRef={simRef} zoomApiRef={zoomApiRef} svgRef={svgRef} ready={ready} groupColor={model.groupColor} />
      </div>

      {selectedNode && (
        <div className="graph-float graph-float-panel">
          <GraphSidePanel
            node={selectedNode}
            model={model}
            mode={mode}
            blastStats={mode === "blast" ? highlight : null}
            sourceOpen={sourceOpen}
            fileHtml={fileHtml}
            fileLoading={fileLoading}
            onJumpTo={focusOnNode}
            onOpenSource={() => { setSourceOpen(true); openFile(selectedNode.path); }}
            onBackToInfo={() => setSourceOpen(false)}
            onShowLocalGraph={() => setMode("local")}
            onShowBlastRadius={() => setMode("blast")}
            onClose={clearSelection}
            onViewInArchitecture={onViewInArchitecture ? () => onViewInArchitecture(selectedNode.path) : null}
          />
        </div>
      )}
    </div>
  );
}
