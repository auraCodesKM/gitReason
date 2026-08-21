import { useReveal } from "./hooks";

export function Section({ id, className = "", children }) {
  return (
    <section id={id} className={`section ${className}`}>
      <div className="section-inner">{children}</div>
    </section>
  );
}

export function SectionHead({ title, lede, centered = false }) {
  const [ref, inView] = useReveal();
  return (
    <div
      ref={ref}
      className={`section-head reveal ${centered ? "is-centered" : ""} ${inView ? "is-in" : ""}`}
    >
      <h2 className="section-title">{title}</h2>
      {lede && <p className="section-lede">{lede}</p>}
    </div>
  );
}

export function Reveal({ as: Tag = "div", className = "", children, threshold }) {
  const [ref, inView] = useReveal(threshold ? { threshold } : undefined);
  return (
    <Tag ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`}>
      {children}
    </Tag>
  );
}
