import { WordReveal } from "./WordReveal";
import { Section, Reveal } from "./Section";
import { useStaggerReveal } from "./hooks";
import { CodeLine } from "./CodeBlock";
import "./section-problem.css";

const CODE_LINES = [
  { n: 1, text: 'import { retryQueue } from "../infra/retry-queue";', flag: "dependency" },
  { n: 2, text: 'import { ledger } from "../accounting/ledger";', flag: null },
  { n: 3, text: 'import { notifyCustomer } from "../notifications/dispatch";', flag: null },
  { n: 4, text: "", flag: null },
  { n: 5, text: "export async function chargeCustomer(invoiceId, amountCents) {", flag: null },
  { n: 6, text: "  const invoice = await db.invoices.find(invoiceId);", flag: null },
  { n: 7, text: '  if (invoice.status === "paid") return invoice;', flag: null },
  { n: 8, text: "", flag: null },
  { n: 9, text: "  const charge = await stripe.charges.create({", flag: "impact" },
  { n: 10, text: "    amount: amountCents,", flag: null },
  { n: 11, text: '    currency: "usd",', flag: null },
  { n: 12, text: "    customer: invoice.customerId,", flag: null },
  { n: 13, text: "  });", flag: null },
  { n: 14, text: "", flag: null },
  { n: 15, text: "  await ledger.record(charge);", flag: "history" },
  { n: 16, text: "  await retryQueue.clear(invoiceId);", flag: null },
  { n: 17, text: "  await notifyCustomer(invoice, charge);", flag: "context" },
  { n: 18, text: "  return charge;", flag: null },
  { n: 19, text: "}", flag: null },
];

const ANNOTATIONS = [
  {
    flag: "dependency",
    line: 1,
    label: "Hidden dependency",
    detail: "Three other modules call chargeCustomer indirectly through the retry queue, with no import pointing back here.",
  },
  {
    flag: "impact",
    line: 9,
    label: "Unknown change impact",
    detail: "Rounding amountCents differently would change the value at six downstream call sites your IDE cannot see from this file.",
  },
  {
    flag: "history",
    line: 15,
    label: "Buried Git history",
    detail: "This line was rewritten in a hot fix commit fourteen months ago. The linked incident report explaining why is two repositories away.",
  },
  {
    flag: "context",
    line: 17,
    label: "Lost context",
    detail: "The original author left the team. The pull request that explained the retry ordering here was squashed out of history.",
  },
];

export default function Problem() {
  const [listRef, listInView, delayFor] = useStaggerReveal({ step: 0.1 });

  return (
    <Section id="problem">
      <div className="problem-tagline">
        <WordReveal
          text="Your codebase knows more than your IDE shows you."
          accentWords={["knows"]}
        />
      </div>

      <div className="problem-grid">
        <Reveal className="problem-code panel" threshold={0.15}>
          <div className="panel-chrome">
            <span className="panel-dot" />
            <span className="panel-dot" />
            <span className="panel-dot" />
            <span className="panel-chrome-label">payments/charge.ts</span>
          </div>
          <pre className="problem-code-body code-text">
            {CODE_LINES.map((line) => (
              <span key={line.n} className={`problem-code-line ${line.flag ? "is-flagged" : ""}`}>
                <span className="problem-code-num">{line.n}</span>
                <span className="problem-code-text">
                  <CodeLine text={line.text || " "} />
                </span>
                {line.flag && <span className={`problem-code-marker marker-${line.flag}`} />}
              </span>
            ))}
          </pre>
        </Reveal>

        <div ref={listRef} className={`problem-annotations reveal-stagger ${listInView ? "is-in" : ""}`}>
          {ANNOTATIONS.map((a, i) => (
            <div
              key={a.flag}
              className={`problem-annotation marker-${a.flag}`}
              style={{ "--stagger-delay": delayFor(i) }}
            >
              <div className="problem-annotation-head">
                <span className="problem-annotation-dot" />
                <span className="problem-annotation-label">{a.label}</span>
                <span className="problem-annotation-line code-text">charge.ts:{a.line}</span>
              </div>
              <p className="problem-annotation-detail">{a.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
