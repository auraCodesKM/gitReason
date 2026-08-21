import { useState } from "react";
import Markdown from "markdown-to-jsx";
import ArchitectureDiagram from "./ArchitectureDiagram";

function buildFileTree(flatTree) {
  const root = { name: "", children: new Map(), isDir: true };
  for (const entry of flatTree) {
    const parts = entry.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const name = parts[i];
      if (!node.children.has(name)) {
        node.children.set(name, { name, path: parts.slice(0, i + 1).join("/"), children: new Map(), isDir: !isLast || entry.type === "dir" });
      }
      node = node.children.get(name);
    }
  }
  return root;
}

function TreeNode({ node, depth, selectedPath, onSelect }) {
  const [open, setOpen] = useState(depth < 1);
  const entries = [...node.children.values()].sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));

  if (node.isDir) {
    return (
      <div className="tree-dir">
        <button type="button" className="tree-row tree-dir-row" style={{ "--depth": depth }} onClick={() => setOpen((v) => !v)}>
          <span className={`tree-caret ${open ? "is-open" : ""}`}>›</span>
          {node.name || "/"}
        </button>
        {open && entries.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`tree-row tree-file-row ${selectedPath === node.path ? "is-selected" : ""}`}
      style={{ "--depth": depth }}
      onClick={() => onSelect(node.path)}
    >
      {node.name}
    </button>
  );
}

export default function ArchitectureView({ tree, explanation, graph, selectedPath, fileHtml, fileLoading, onOpenFile, onCloseFile, onExploreInGraph }) {
  const fileTreeRoot = tree.length ? buildFileTree(tree) : null;

  return (
    <div className="analyze-body">
      <aside className="analyze-tree">
        {fileTreeRoot && <TreeNode node={fileTreeRoot} depth={0} selectedPath={selectedPath} onSelect={onOpenFile} />}
      </aside>

      <main className="analyze-main">
        {explanation && (
          <div className="analyze-explanation">
            <Markdown options={{ forceBlock: true }}>{explanation}</Markdown>
          </div>
        )}
        {graph && <ArchitectureDiagram graph={graph} onOpenFile={onOpenFile} />}
      </main>

      {selectedPath && (
        <aside className="analyze-preview">
          <div className="analyze-preview-head">
            <span className="analyze-preview-path" title={selectedPath}>{selectedPath}</span>
            <div className="analyze-preview-head-actions">
              <button type="button" className="analyze-preview-link" onClick={() => onExploreInGraph(selectedPath)}>
                Explore in Graph →
              </button>
              <button type="button" className="analyze-preview-close" onClick={onCloseFile} aria-label="Close">
                ×
              </button>
            </div>
          </div>
          {fileLoading ? (
            <p className="file-preview-empty">Loading…</p>
          ) : (
            <div className="analyze-preview-body" dangerouslySetInnerHTML={{ __html: fileHtml }} />
          )}
        </aside>
      )}
    </div>
  );
}
