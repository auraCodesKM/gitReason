const KEYWORDS = new Set([
  "import", "from", "export", "default", "async", "await", "function",
  "const", "let", "var", "return", "if", "else", "for", "of", "in",
  "new", "class", "extends", "try", "catch", "throw", "typeof",
  "true", "false", "null", "undefined", "this",
]);

const TOKEN_RE =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*\b)(?=\s*\()|(\.[A-Za-z_$][\w$]*)|(\b[A-Za-z_$][\w$]*\b)|([{}()[\].,;:])/gm;

/**
 * Splits one line of JS/TS-ish source into syntax-colored tokens.
 * A small pattern-based highlighter, not a real parser: enough to make the
 * illustrative snippets in this file read like real code, not a proof.
 */
export function tokenizeLine(line) {
  const tokens = [];
  let lastIndex = 0;
  let match;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), cls: "plain" });
    }
    const [, comment, string, number, fnName, property, word, punct] = match;
    if (comment) tokens.push({ text: comment, cls: "comment" });
    else if (string) tokens.push({ text: string, cls: "string" });
    else if (number) tokens.push({ text: number, cls: "number" });
    else if (fnName) tokens.push({ text: fnName, cls: "fn" });
    else if (property) tokens.push({ text: property, cls: "property" });
    else if (word) tokens.push({ text: word, cls: KEYWORDS.has(word) ? "keyword" : "plain" });
    else if (punct) tokens.push({ text: punct, cls: "punct" });
    lastIndex = TOKEN_RE.lastIndex;
  }
  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), cls: "plain" });
  }
  return tokens;
}
