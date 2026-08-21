import { Section, SectionHead } from "./Section";
import { useStaggerReveal } from "./hooks";
import "./section-how.css";

const STEPS = [
  { n: "01", glyph: ">", title: "Repository", detail: "Point GitReason at a repository, public or private, and it clones the full history." },
  { n: "02", glyph: "{", title: "Parse & Index", detail: "Every file is parsed into an AST and indexed alongside its embeddings for retrieval." },
  { n: "03", glyph: "<", title: "Architecture", detail: "Imports, calls, and definitions are resolved into a graph of how the system actually connects." },
  { n: "04", glyph: "*", title: "Git History", detail: "Every commit is walked and linked to the files, functions, and authors it touched." },
  { n: "05", glyph: "%", title: "Retrieval", detail: "A question pulls the graph, the history, and the matching code into one grounded context." },
  { n: "06", glyph: "#", title: "AI Reasoning", detail: "The model reasons over that context and answers with citations back to the exact lines." },
];

export default function HowItWorks() {
  const [ref, inView, delayFor] = useStaggerReveal({ step: 0.14 });

  return (
    <Section id="how-it-works">
      <SectionHead
        title="How it works"
        lede="Six stages between cloning a repository and answering a question about it."
      />

      <div ref={ref} className={`how-steps reveal-stagger ${inView ? "is-in" : ""}`}>
        {STEPS.map((step, i) => (
          <div key={step.n} className="how-step" style={{ "--stagger-delay": delayFor(i) }}>
            <div className="how-step-top">
              <span className="how-step-num">{step.n}</span>
              {i < STEPS.length - 1 && <span className="how-step-line" aria-hidden="true" />}
            </div>
            <h3 className="how-step-title">{step.title}</h3>
            <span className="how-step-glyph" aria-hidden="true">{step.glyph}</span>
            <p className="how-step-detail">{step.detail}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
