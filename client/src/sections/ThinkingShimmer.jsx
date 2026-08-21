import "./thinking-shimmer.css";

export function ThinkingShimmer({ text }) {
  return (
    <span className="thinking-shimmer" aria-label={text}>
      {[...text].map((char, i) => (
        <span key={i} className="thinking-shimmer-char" style={{ "--i": i }} aria-hidden="true">
          {char === " " ? " " : char}
        </span>
      ))}
    </span>
  );
}
