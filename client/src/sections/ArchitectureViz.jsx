import { useState } from "react";
import { Section, SectionHead, Reveal } from "./Section";
import { useParallax } from "./hooks";
import "./section-architecture.css";

const NODES = [
  { id: "router", x: 80, y: 260, label: "api/router.ts", desc: "Entry point. Every request is authenticated, then routed." },
  { id: "mwauth", x: 240, y: 140, label: "api/middleware/auth.ts", desc: "Verifies the session before a request reaches a handler." },
  { id: "webhooksstripe", x: 240, y: 260, label: "webhooks/stripe.ts", desc: "Receives Stripe events and hands them to the charge flow." },
  { id: "infraqueue", x: 240, y: 400, label: "infra/queue.ts", desc: "Durable queue backing every async job in the system." },
  { id: "authsession", x: 420, y: 70, label: "auth/session.ts", desc: "Issues and validates signed session tokens." },
  { id: "webhooksverify", x: 420, y: 210, label: "webhooks/verify.ts", desc: "Validates the Stripe signature on every inbound webhook." },
  { id: "dbclient", x: 420, y: 300, label: "db/client.ts", desc: "Single Postgres connection pool shared across the app." },
  { id: "jobsworker", x: 420, y: 420, label: "jobs/worker.ts", desc: "Pulls jobs off the queue and executes them." },
  { id: "authtokens", x: 600, y: 30, label: "auth/tokens.ts", desc: "Signs and rotates the keys session.ts depends on." },
  { id: "dbmigrations", x: 600, y: 300, label: "db/migrations/0007.sql", desc: "Adds the risk_score column charge.ts writes to." },
  { id: "jobsretry", x: 600, y: 480, label: "jobs/retry.ts", desc: "Re-enqueues failed jobs with backoff." },
  { id: "notifyemail", x: 780, y: 420, label: "notify/email.ts", desc: "Sends the receipt after a successful charge." },
  { id: "notifytemplates", x: 940, y: 420, label: "notify/templates.ts", desc: "Renders the HTML the receipt email sends." },
  { id: "sharedlogger", x: 780, y: 150, label: "shared/logger.ts", desc: "Structured logging used across every module here." },
];

const EDGES = [
  ["router", "mwauth"],
  ["router", "webhooksstripe"],
  ["router", "infraqueue"],
  ["router", "sharedlogger"],
  ["mwauth", "authsession"],
  ["webhooksstripe", "webhooksverify"],
  ["webhooksstripe", "dbclient"],
  ["infraqueue", "jobsworker"],
  ["authsession", "authtokens"],
  ["authsession", "dbclient"],
  ["dbclient", "dbmigrations"],
  ["jobsworker", "jobsretry"],
  ["jobsworker", "notifyemail"],
  ["jobsworker", "sharedlogger"],
  ["jobsretry", "infraqueue"],
  ["notifyemail", "notifytemplates"],
];

function neighborsOf(id) {
  const set = new Set([id]);
  EDGES.forEach(([a, b]) => {
    if (a === id) set.add(b);
    if (b === id) set.add(a);
  });
  return set;
}

export default function ArchitectureViz() {
  const [hovered, setHovered] = useState(null);
  const [bgRef, bgOffset] = useParallax(0.06);
  const active = hovered ? neighborsOf(hovered) : null;
  const hoveredNode = NODES.find((n) => n.id === hovered);

  return (
    <Section id="architecture" className="architecture-section">
      <SectionHead
        title={<>The <em>architecture graph</em>, drawn</>}
        lede="Fourteen modules from one real request path, resolved automatically. Hover a node to see what it touches."
      />

      <Reveal className="architecture-panel panel" threshold={0.1}>
        <div
          ref={bgRef}
          className="architecture-bg panel-parallax"
          style={{ transform: `translateY(${bgOffset}px)` }}
          aria-hidden="true"
        />
        <svg
          className="architecture-svg"
          viewBox="0 0 980 520"
          fill="none"
          role="img"
          aria-label="Dependency graph of fourteen modules"
        >
          {EDGES.map(([a, b]) => {
            const from = NODES.find((n) => n.id === a);
            const to = NODES.find((n) => n.id === b);
            const isActive = active && active.has(a) && active.has(b);
            return (
              <line
                key={`${a}-${b}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className={`arch-edge ${isActive ? "is-active" : ""} ${hovered && !isActive ? "is-dim" : ""}`}
              />
            );
          })}
          {NODES.map((n) => {
            const isActive = !hovered || active.has(n.id);
            const isHovered = hovered === n.id;
            return (
              <g
                key={n.id}
                className={`arch-node ${isHovered ? "is-hovered" : ""} ${!isActive ? "is-dim" : ""}`}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                tabIndex={0}
                onFocus={() => setHovered(n.id)}
                onBlur={() => setHovered(null)}
              >
                <circle cx={n.x} cy={n.y} r={isHovered ? 9 : 6} className="arch-node-dot" />
                <text x={n.x} y={n.y - 16} textAnchor="middle" className="arch-node-label">
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="architecture-info">
          {hoveredNode ? (
            <>
              <span className="architecture-info-path code-text">{hoveredNode.label}</span>
              <p>{hoveredNode.desc}</p>
            </>
          ) : (
            <p className="architecture-info-hint">Hover or focus a node to inspect it.</p>
          )}
        </div>
      </Reveal>
    </Section>
  );
}
