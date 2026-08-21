import { useState } from "react";
import { Section, SectionHead, Reveal } from "./Section";
import { useParallax } from "./hooks";
import "./section-risk.css";

const ROOT = { id: "root", x: 468, y: 244, label: "payments/charge.ts", risk: "root" };

const HOP1 = [
  { id: "ledger", x: 178, y: 108, label: "accounting/ledger.ts", risk: "high", reason: "Reads the rounding mode charge.ts is changing on every write." },
  { id: "notify", x: 258, y: 418, label: "notify/email.ts", risk: "mid", reason: "Formats the receipt amount from this function's return value." },
  { id: "verify", x: 752, y: 92, label: "webhooks/verify.ts", risk: "low", reason: "Only reads the invoice id this function is called with, unaffected." },
  { id: "queue", x: 718, y: 402, label: "infra/retry-queue.ts", risk: "mid", reason: "Retries call this function again with the same arguments on failure." },
];

const HOP2 = [
  { id: "report", parent: "ledger", x: 56, y: 48, label: "finance/report.ts", risk: "high", reason: "Aggregates ledger entries monthly. A rounding change shifts every total." },
  { id: "export", parent: "ledger", x: 88, y: 248, label: "finance/export.ts", risk: "mid", reason: "Exports ledger rows to CSV for reconciliation." },
  { id: "templates", parent: "notify", x: 104, y: 468, label: "notify/templates.ts", risk: "low", reason: "Only reads the pre-formatted string, no numeric logic." },
  { id: "webhookroute", parent: "verify", x: 876, y: 54, label: "api/routes/webhook.ts", risk: "low", reason: "Passes the payload through unchanged." },
  { id: "chargetest", parent: "queue", x: 840, y: 470, label: "test/charge.test.ts", risk: "mid", reason: "Asserts the exact charge amount. Will fail on a rounding change." },
];

const ALL_NODES = [ROOT, ...HOP1, ...HOP2];

const RISK_COPY = {
  high: "High risk",
  mid: "Medium risk",
  low: "Low risk",
};

function curve(x1, y1, x2, y2, bend) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export default function RiskImpact() {
  const [hovered, setHovered] = useState(null);
  const [bgRef, bgOffset] = useParallax(0.05);
  const hoveredNode = ALL_NODES.find((n) => n.id === hovered);

  return (
    <Section id="risk-impact">
      <SectionHead
        title={<>One change. <em>Nine</em> places it lands.</>}
        lede="charge.ts is about to change its rounding mode. Here is everything downstream that has to know."
      />

      <Reveal className="risk-panel panel" threshold={0.1}>
        <div
          ref={bgRef}
          className="risk-bg panel-parallax"
          style={{ transform: `translateY(${bgOffset}px)` }}
          aria-hidden="true"
        />
        <svg
          className="risk-svg"
          viewBox="-15 0 950 500"
          fill="none"
          role="img"
          aria-label="Risk propagation from payments/charge.ts through nine dependents"
        >
          {HOP1.map((n, i) => (
            <path
              key={`root-${n.id}`}
              d={curve(ROOT.x, ROOT.y, n.x, n.y, i % 2 === 0 ? 22 : -22)}
              className="risk-edge"
            />
          ))}
          {HOP2.map((n, i) => {
            const parent = HOP1.find((h) => h.id === n.parent);
            return (
              <path
                key={`${n.parent}-${n.id}`}
                d={curve(parent.x, parent.y, n.x, n.y, i % 2 === 0 ? 14 : -14)}
                className="risk-edge is-outer"
              />
            );
          })}

          <g
            className="risk-node is-root"
            onMouseEnter={() => setHovered("root")}
            onMouseLeave={() => setHovered(null)}
          >
            <circle cx={ROOT.x} cy={ROOT.y} r="10" className="risk-dot risk-dot-root" />
            <text x={ROOT.x} y={ROOT.y + 26} textAnchor="middle" className="risk-label is-root-label">
              {ROOT.label}
            </text>
          </g>

          {[...HOP1, ...HOP2].map((n) => (
            <g
              key={n.id}
              className={`risk-node ${hovered === n.id ? "is-hovered" : ""}`}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              tabIndex={0}
              onFocus={() => setHovered(n.id)}
              onBlur={() => setHovered(null)}
            >
              <circle cx={n.x} cy={n.y} r={hovered === n.id ? 8 : 5.5} className={`risk-dot risk-dot-${n.risk}`} />
              <text
                x={n.x + (n.x < 140 ? 10 : n.x > 780 ? -10 : 0)}
                y={n.y + (n.y < ROOT.y ? -14 : 20)}
                textAnchor={n.x < 140 ? "start" : n.x > 780 ? "end" : "middle"}
                className="risk-label"
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>

        <div className="risk-footer">
          <div className="risk-legend">
            <span className="risk-legend-item"><i className="risk-dot-low" />Low</span>
            <span className="risk-legend-item"><i className="risk-dot-mid" />Medium</span>
            <span className="risk-legend-item"><i className="risk-dot-high" />High</span>
            <span className="risk-summary">1 file changed &rarr; 4 direct dependents &rarr; 5 further dependents &rarr; 9 total affected</span>
          </div>
          <div className="risk-info">
            {hoveredNode && hoveredNode.risk !== "root" ? (
              <>
                <span className={`risk-info-tag risk-tag-${hoveredNode.risk}`}>{RISK_COPY[hoveredNode.risk]}</span>
                <p>{hoveredNode.reason}</p>
              </>
            ) : (
              <p className="risk-info-hint">Hover a node for why it is at risk.</p>
            )}
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
