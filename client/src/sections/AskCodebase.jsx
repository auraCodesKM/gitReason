import { Section, SectionHead, Reveal } from "./Section";
import { CodeBlock } from "./CodeBlock";
import "./section-chat.css";

const FIX_SNIPPET = `// payments/charge.ts:6-14
const invoice = await db.invoices.find(invoiceId);
if (invoice.status === "paid") return invoice;

const charge = await stripe.charges.create({ ... });
await ledger.record(charge);   // throws here, invoice never marked paid
await markPaid(invoiceId);`;

export default function AskCodebase() {
  return (
    <Section id="ask">
      <SectionHead
        title={<>Ask your <em>codebase</em> anything</>}
        lede="Every answer is grounded in the actual repository: the code, the graph, and the history behind it."
      />

      <Reveal className="chat-panel panel" threshold={0.1}>
        <div className="panel-chrome">
          <span className="panel-dot" />
          <span className="panel-dot" />
          <span className="panel-dot" />
          <span className="panel-chrome-label">gitreason &middot; payments-service &middot; main</span>
        </div>

        <div className="chat-body">
          <div className="chat-turn chat-turn-user">
            <div className="chat-bubble">Why does the retry queue sometimes double charge a customer?</div>
          </div>

          <div className="chat-turn chat-turn-ai">
            <div className="chat-bubble">
              <p>
                <span className="chat-cite">infra/retry-queue.ts:41</span> re-enqueues a job on any thrown
                error, including after <span className="chat-cite">payments/charge.ts:9</span> has already
                succeeded against Stripe. The failure happens between the charge and the write that marks
                the invoice paid.
              </p>
              <CodeBlock code={FIX_SNIPPET} className="chat-code" />
              <p>
                If <span className="chat-cite">ledger.record</span> throws after the Stripe call succeeds,
                the retry sees <span className="chat-cite">status !== "paid"</span> and charges again.
              </p>
            </div>
          </div>

          <div className="chat-turn chat-turn-user">
            <div className="chat-bubble">Show me every place that calls chargeCustomer directly.</div>
          </div>

          <div className="chat-turn chat-turn-ai">
            <div className="chat-bubble">
              <p>Three call sites, none of them adjacent in the file tree:</p>
              <ul className="chat-list">
                <li><span className="chat-cite">api/router.ts:118</span> &mdash; the synchronous checkout path</li>
                <li><span className="chat-cite">jobs/worker.ts:52</span> &mdash; the retry queue, on every re-enqueue</li>
                <li><span className="chat-cite">webhooks/stripe.ts:63</span> &mdash; reconciliation for delayed webhook events</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="chat-input" aria-hidden="true">
          <span className="chat-input-text">Ask about this repository&hellip;</span>
          <span className="chat-input-send">&rarr;</span>
        </div>
      </Reveal>
    </Section>
  );
}
