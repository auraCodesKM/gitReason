import { tokenizeLine } from "./codeHighlight";

export function CodeLine({ text }) {
  const tokens = tokenizeLine(text);
  return tokens.map((t, i) => (
    <span key={i} className={`tok-${t.cls}`}>
      {t.text}
    </span>
  ));
}

/** A syntax-colored, non-interactive code snippet block. */
export function CodeBlock({ code, className = "" }) {
  const lines = code.split("\n");
  return (
    <pre className={`code-text ${className}`}>
      {lines.map((line, i) => (
        <span key={i} className="code-block-line">
          <CodeLine text={line || " "} />
          {i < lines.length - 1 ? "\n" : ""}
        </span>
      ))}
    </pre>
  );
}
