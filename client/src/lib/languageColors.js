// GitHub's own linguist colors - real, widely-recognized convention (the
// same colors shown on any GitHub repo's language bar), not invented.
const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Vue: "#41b883",
  Dart: "#00B4AB",
  Dockerfile: "#384d54",
  Makefile: "#427819",
  Lua: "#000080",
  Elixir: "#6e4a7e",
  Scala: "#c22d40",
  Haskell: "#5e5086",
  "Objective-C": "#438eff",
  "Jupyter Notebook": "#DA5B0B",
};

const FALLBACK_COLOR = "rgba(255, 255, 255, 0.32)";

export function colorForLanguage(name) {
  return LANGUAGE_COLORS[name] || FALLBACK_COLOR;
}
