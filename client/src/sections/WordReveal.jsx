import { useWordReveal } from "./hooks";

/**
 * The mandatory large tagline moment: words transition from a muted tone to
 * full color, in reading order, as the block crosses the viewport's trigger
 * line. `accentWords` marks specific words (matched case-sensitively) to
 * land in the green accent instead of white.
 */
export function WordReveal({ text, accentWords = [], className = "" }) {
  const [ref, inView] = useWordReveal();
  const words = text.split(" ");

  return (
    <p ref={ref} className={`word-reveal ${inView ? "is-in" : ""} ${className}`}>
      {words.map((word, i) => (
        <span
          key={i}
          className={`word-reveal-word ${accentWords.includes(word) ? "is-accent" : ""}`}
          style={{ "--w-delay": `${i * 0.045}s` }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
