import { Section, SectionHead, Reveal } from "./Section";
import { CodeBlock } from "./CodeBlock";
import "./section-foundation.css";

const PILLARS = [
  {
    title: "AST analysis",
    detail: "Every file is parsed into a full abstract syntax tree, not pattern matched. Renames, moves, and reformatting do not confuse it.",
    snippet: `FunctionDeclaration "chargeCustomer"
├─ Param invoiceId: string
├─ Param amountCents: number
├─ AwaitExpression
│   └─ CallExpression db.invoices.find
├─ IfStatement
│   └─ ReturnStatement
└─ AwaitExpression
    └─ CallExpression stripe.charges.create`,
  },
  {
    title: "Git history",
    detail: "Every commit is walked and attributed down to the function level, so risk scoring has more to go on than a diff.",
    snippet: `a1c4f2e  Widen retry window for failed charges        +14 -3   payments/charge.ts
9e02b71  Add index on invoices.customer_id             +6  -0   db/migrations/0007
4bd88aa  Refactor ledger rounding to bankers rounding  +22 -18  accounting/ledger.ts`,
  },
  {
    title: "Dependency graphs",
    detail: "Imports, calls, and re-exports are resolved into a directed graph, the same structure both the architecture view and the impact analysis read from.",
    snippet: `"payments/charge.ts": [
  "accounting/ledger.ts",
  "infra/retry-queue.ts",
  "notify/email.ts"
]
"accounting/ledger.ts": [
  "finance/report.ts",
  "finance/export.ts"
]`,
  },
  {
    title: "Retrieval + reasoning",
    detail: "A question is embedded, matched against the graph and the history, and the model reasons only over what actually came back.",
    snippet: `retrieved:
  payments/charge.ts:6-14       0.91
  infra/retry-queue.ts:38-44    0.87
  db/migrations/0007.sql        0.74

reasoning -> cross-reference retry
condition against charge state
-> answer, cited`,
  },
];

export default function TechFoundation() {
  return (
    <Section id="technical">
      <SectionHead
        title={<>Built on the <em>real</em> substrate</>}
        lede="Four layers underneath every answer GitReason gives."
      />

      <div className="foundation-list">
        {PILLARS.map((p, i) => (
          <Reveal key={p.title} className={`foundation-row ${i % 2 === 1 ? "is-reversed" : ""}`} threshold={0.15}>
            <div className="foundation-copy">
              <h3>{p.title}</h3>
              <p>{p.detail}</p>
            </div>
            <CodeBlock code={p.snippet} className="foundation-snippet" />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
