import { useEffect, useRef, useState } from "react";
import { zoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import { drag as d3drag } from "d3-drag";
import { colorFor } from "./graphData";

const MINI_W = 120;
const MINI_H = 78;
const PAD = 8;

// Mirrors the main simulation's node array by shared reference — no
// independent physics, just a cheap coordinate-transform projection,
// refreshed on the same tick/reveal cadence as the main canvas.
export function GraphMinimap({ simRef, zoomApiRef, svgRef, ready, groupColor }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const rectRef = useRef(null);
  const dotsRef = useRef(new Map());
  const projRef = useRef(null);

  useEffect(() => {
    if (!open || !ready || !simRef.current || !svgRef.current) return;
    const { simNodes } = simRef.current;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of simNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const scale = Math.min((MINI_W - PAD * 2) / w, (MINI_H - PAD * 2) / h);
    const project = (x, y) => [
      PAD + (x - minX) * scale + (MINI_W - PAD * 2 - w * scale) / 2,
      PAD + (y - minY) * scale + (MINI_H - PAD * 2 - h * scale) / 2,
    ];
    projRef.current = { project, minX, minY, scale, offX: (MINI_W - PAD * 2 - w * scale) / 2, offY: (MINI_H - PAD * 2 - h * scale) / 2 };

    for (const n of simNodes) {
      const el = dotsRef.current.get(n.id);
      if (!el) continue;
      const [px, py] = project(n.x, n.y);
      el.setAttribute("cx", px);
      el.setAttribute("cy", py);
    }

    function syncViewport() {
      const t = zoomTransform(svgRef.current);
      const rect = svgRef.current.getBoundingClientRect();
      const proj = projRef.current;
      if (!proj || !rectRef.current) return;
      // visible graph-space bounds = inverse of the current zoom transform
      const x0 = -t.x / t.k, y0 = -t.y / t.k;
      const x1 = (rect.width - t.x) / t.k, y1 = (rect.height - t.y) / t.k;
      const [px0, py0] = proj.project(x0, y0);
      const [px1, py1] = proj.project(x1, y1);
      rectRef.current.setAttribute("x", Math.min(px0, px1));
      rectRef.current.setAttribute("y", Math.min(py0, py1));
      rectRef.current.setAttribute("width", Math.max(Math.abs(px1 - px0), 4));
      rectRef.current.setAttribute("height", Math.max(Math.abs(py1 - py0), 4));
    }

    syncViewport();
    const svgSel = select(svgRef.current);
    svgSel.on("zoom.minimap", syncViewport);
    const interval = setInterval(syncViewport, 400); // catches drag-driven resettles cheaply

    function toGraphSpace(px, py) {
      const proj = projRef.current;
      return [(px - PAD - proj.offX) / proj.scale + proj.minX, (py - PAD - proj.offY) / proj.scale + proj.minY];
    }

    select(rootRef.current).on("click", (event) => {
      if (event.target === rectRef.current) return;
      const [mx, my] = [event.offsetX, event.offsetY];
      const [gx, gy] = toGraphSpace(mx, my);
      zoomApiRef.current?.focusOn(gx, gy, zoomTransform(svgRef.current).k || 1);
    });

    select(rectRef.current).call(
      d3drag().on("drag", (event) => {
        const [gx, gy] = toGraphSpace(event.x, event.y);
        zoomApiRef.current?.focusOn(gx, gy, zoomTransform(svgRef.current).k || 1, 0);
      })
    );

    return () => {
      svgSel.on("zoom.minimap", null);
      clearInterval(interval);
    };
  }, [open, ready, simRef, svgRef, zoomApiRef]);

  if (!ready) return null;

  return (
    <div className="graph-minimap-wrap">
      {open && (
        <svg ref={rootRef} className="graph-minimap" width={MINI_W} height={MINI_H} viewBox={`0 0 ${MINI_W} ${MINI_H}`}>
          {[...(simRef.current?.simNodes || [])].map((n) => (
            <circle
              key={n.id}
              ref={(el) => el && dotsRef.current.set(n.id, el)}
              r={1.6}
              style={{ fill: colorFor(groupColor, n.group).stroke }}
            />
          ))}
          <rect ref={rectRef} className="graph-minimap-viewport" />
        </svg>
      )}
      <button
        type="button"
        className={`graph-icon-btn ${open ? "is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle minimap"
        title="Minimap"
      >
        ◱
      </button>
    </div>
  );
}
