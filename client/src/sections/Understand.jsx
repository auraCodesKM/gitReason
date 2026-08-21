import { useState } from "react";
import { Section, SectionHead, Reveal } from "./Section";
import "./section-understand.css";

const GRAPH_NODES = [
  { id: "api", x: 60, y: 90, label: "api/router.ts" },
  { id: "auth", x: 260, y: 40, label: "auth/session.ts" },
  { id: "db", x: 260, y: 140, label: "db/client.ts" },
  { id: "queue", x: 460, y: 40, label: "infra/queue.ts" },
  { id: "worker", x: 460, y: 140, label: "jobs/worker.ts" },
  { id: "notify", x: 640, y: 90, label: "notify/email.ts" },
];

const GRAPH_EDGES = [
  ["api", "auth"], ["api", "db"], ["auth", "db"],
  ["db", "queue"], ["queue", "worker"], ["worker", "notify"],
];

const RAG_RESULTS = [
  { path: "webhooks/stripe.ts:88", line: "const valid = verifySignature(payload, sig, secret);" },
  { path: "webhooks/verify.ts:14", line: "export function verifySignature(body, header, key) {" },
];

const RISK_COMMITS = [
  { hash: "a1c4f2e", msg: "Widen retry window for failed charges", risk: "high" },
  { hash: "9e02b71", msg: "Add index on invoices.customer_id", risk: "low" },
  { hash: "4bd88aa", msg: "Refactor ledger rounding to bankers rounding", risk: "mid" },
];

const IMPACT_NODES = [
  { id: "changed", x: 300, y: 90, label: "charge.ts", isRoot: true },
  { id: "t1", x: 70, y: 30, label: "3 tests" },
  { id: "t2", x: 70, y: 150, label: "2 API routes" },
  { id: "t3", x: 530, y: 30, label: "1 background job" },
  { id: "t4", x: 530, y: 150, label: "docs page" },
];

const TABS = [
  {
    key: "architecture",
    label: "Architecture Graph",
    file: "architecture-graph.json",
    desc: "Every file, function, and import resolved into one navigable graph of the actual system, not a folder tree.",
  },
  {
    key: "rag",
    label: "Code RAG",
    file: "rag-query.log",
    desc: "Ask a question in plain language, get back the exact lines that answer it, grounded in this repository.",
  },
  {
    key: "risk",
    label: "Git Risk Analysis",
    file: "git-risk.log",
    desc: "Every commit scored by what it touched, how it touched it, and how that pattern has behaved before.",
  },
  {
    key: "impact",
    label: "Impact Analysis",
    file: "impact-analysis.json",
    desc: "Before a change lands, see exactly what it reaches: tests, routes, jobs, and docs, ranked by distance.",
  },
];

function ArchitectureMini() {
  const [hovered, setHovered] = useState(null);
  return (
    <svg className="understand-graph" viewBox="0 0 700 180" fill="none" aria-hidden="true">
      {GRAPH_EDGES.map(([a, b]) => {
        const from = GRAPH_NODES.find((n) => n.id === a);
        const to = GRAPH_NODES.find((n) => n.id === b);
        const dim = hovered && hovered !== a && hovered !== b;
        return (
          <line
            key={`${a}-${b}`}
            x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            className={`mini-edge ${dim ? "is-dim" : ""}`}
          />
        );
      })}
      {GRAPH_NODES.map((n) => (
        <g
          key={n.id}
          onMouseEnter={() => setHovered(n.id)}
          onMouseLeave={() => setHovered(null)}
          className={hovered && hovered !== n.id ? "is-dim" : ""}
        >
          <circle cx={n.x} cy={n.y} r={hovered === n.id ? 7 : 5} className="mini-node-dot" />
          <text x={n.x} y={n.y - 14} textAnchor="middle" className="understand-graph-label">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function RagPreview() {
  return (
    <div className="rag-mock">
      <div className="rag-query code-text">Where do we validate webhook signatures?</div>
      {RAG_RESULTS.map((r) => (
        <div key={r.path} className="rag-result">
          <span className="rag-path code-text">{r.path}</span>
          <span className="rag-line code-text">{r.line}</span>
        </div>
      ))}
    </div>
  );
}

function RiskPreview() {
  return (
    <div className="risk-mock">
      {RISK_COMMITS.map((c) => (
        <div key={c.hash} className="risk-row">
          <span className="risk-hash code-text">{c.hash}</span>
          <span className="risk-msg">{c.msg}</span>
          <span className={`risk-pill risk-${c.risk}`}>{c.risk}</span>
        </div>
      ))}
    </div>
  );
}

function ImpactPreview() {
  const root = IMPACT_NODES.find((n) => n.isRoot);
  return (
    <svg className="understand-impact" viewBox="0 0 600 180" fill="none" aria-hidden="true">
      {IMPACT_NODES.filter((n) => !n.isRoot).map((n) => (
        <line key={n.id} x1={root.x} y1={root.y} x2={n.x} y2={n.y} stroke="var(--accent-dim)" strokeWidth="1.5" strokeDasharray="3 4" />
      ))}
      {IMPACT_NODES.map((n) => (
        <g key={n.id}>
          <circle
            cx={n.x} cy={n.y} r={n.isRoot ? 7 : 4.5}
            fill={n.isRoot ? "var(--accent)" : "#0a0a0a"}
            stroke={n.isRoot ? "none" : "rgba(255,255,255,0.4)"}
            strokeWidth="1.5"
          />
          <text x={n.x} y={n.isRoot ? n.y + 22 : n.y - 12} textAnchor="middle" className="understand-graph-label">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

const PREVIEWS = {
  architecture: ArchitectureMini,
  rag: RagPreview,
  risk: RiskPreview,
  impact: ImpactPreview,
};

export default function Understand() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];
  const Preview = PREVIEWS[tab.key];

  return (
    <Section id="understand">
      <SectionHead
        title={<>What <em>GitReason</em> understands</>}
        lede="Four systems working on the same graph: what the code looks like, what it means, what changed, and what breaks."
      />

      <div className="understand-tabs" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`understand-tab ${i === active ? "is-active" : ""}`}
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Reveal className="understand-panel panel" threshold={0.15}>
        <div className="panel-chrome">
          <span className="panel-dot" />
          <span className="panel-dot" />
          <span className="panel-dot" />
          <span className="panel-chrome-label">{tab.file}</span>
        </div>
        <div key={tab.key} className="understand-panel-body">
          <Preview />
        </div>
        <div className="understand-panel-desc">
          <p>{tab.desc}</p>
        </div>
      </Reveal>
    </Section>
  );
}
