import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import { select } from "d3-selection";

export function createZoomBehavior({ svgEl, zoomGroupEl, onTransform, scaleExtent = [0.2, 3] }) {
  const svgSel = select(svgEl);
  const zoomGroupSel = select(zoomGroupEl);

  const zoomBehavior = d3zoom()
    .scaleExtent(scaleExtent)
    .on("zoom", (event) => {
      zoomGroupSel.attr("transform", event.transform);
      onTransform?.(event.transform);
    });

  svgSel.call(zoomBehavior);

  function focusOn(x, y, scale, duration = 650) {
    const rect = svgEl.getBoundingClientRect();
    const transform = zoomIdentity.translate(rect.width / 2, rect.height / 2).scale(scale).translate(-x, -y);
    if (duration > 0) svgSel.transition().duration(duration).call(zoomBehavior.transform, transform);
    else svgSel.call(zoomBehavior.transform, transform);
  }

  function fitToBounds(bounds, padding = 70, duration = 650) {
    const pad = typeof padding === "number" ? { top: padding, right: padding, bottom: padding, left: padding } : padding;
    const rect = svgEl.getBoundingClientRect();
    const w = Math.max(bounds.maxX - bounds.minX, 1);
    const h = Math.max(bounds.maxY - bounds.minY, 1);
    const availW = rect.width - pad.left - pad.right;
    const availH = rect.height - pad.top - pad.bottom;
    const scale = Math.max(Math.min(availW / w, availH / h, scaleExtent[1]), 0.02);
    if (scale < zoomBehavior.scaleExtent()[0]) {
      zoomBehavior.scaleExtent([scale, scaleExtent[1]]);
    }
    const screenCx = pad.left + availW / 2;
    const screenCy = pad.top + availH / 2;
    const boundsCx = (bounds.minX + bounds.maxX) / 2;
    const boundsCy = (bounds.minY + bounds.maxY) / 2;
    const transform = zoomIdentity.translate(screenCx, screenCy).scale(scale).translate(-boundsCx, -boundsCy);
    if (duration > 0) svgSel.transition().duration(duration).call(zoomBehavior.transform, transform);
    else svgSel.call(zoomBehavior.transform, transform);
  }

  function destroy() {
    svgSel.on(".zoom", null);
  }

  return { zoomBehavior, focusOn, fitToBounds, destroy };
}

export function boundsOf(nodes, pad = 0) {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}
