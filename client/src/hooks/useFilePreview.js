import { useState } from "react";
import { codeToHtml } from "shiki";
import { apiFetch } from "../lib/api";

const EXT_LANG = {
  js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", mjs: "javascript", cjs: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", c: "c", h: "c",
  cpp: "cpp", hpp: "cpp", cs: "csharp", php: "php", swift: "swift", scala: "scala",
  html: "html", css: "css", scss: "scss", json: "json", yml: "yaml", yaml: "yaml",
  md: "markdown", sh: "bash", sql: "sql", toml: "toml", xml: "xml", vue: "vue",
};

function langFor(path) {
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  return EXT_LANG[ext] || "text";
}

export function useFilePreview(repo, defaultBranch) {
  const [selectedPath, setSelectedPath] = useState(null);
  const [fileHtml, setFileHtml] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  function openFile(path) {
    setSelectedPath(path);
    setFileLoading(true);
    setFileHtml("");
    apiFetch(`/api/repo/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&ref=${encodeURIComponent(defaultBranch)}`)
      .then((res) => res.json())
      .then(async (data) => {
        if (!data.content) {
          setFileHtml('<p class="file-preview-empty">Couldn’t load this file.</p>');
          return;
        }
        const html = await codeToHtml(data.content, { lang: langFor(path), theme: "github-dark" });
        setFileHtml(html);
      })
      .catch(() => setFileHtml('<p class="file-preview-empty">Couldn’t load this file.</p>'))
      .finally(() => setFileLoading(false));
  }

  function closeFile() {
    setSelectedPath(null);
  }

  return { selectedPath, fileHtml, fileLoading, openFile, closeFile };
}
