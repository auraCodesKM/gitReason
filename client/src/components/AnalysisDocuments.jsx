import { useEffect, useRef, useState } from "react";
import Markdown from "markdown-to-jsx";
import { FileText, Upload } from "lucide-react";
import { apiFetch, apiUrl } from "../lib/api";
import { timeAgo } from "../lib/time";
import "./analysis-documents.css";

// Mirrors the server allowlist and limit (server/src/modules/uploads/upload.middleware.js); the server re-checks both.
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.md,.markdown,.txt";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPE_LABEL = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "text/markdown": "Markdown",
  "text/plain": "Text",
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function request(path, options) {
  let res;
  try {
    res = await apiFetch(path, options);
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("Your session has expired. Sign in again.");
  if (res.status === 404) throw new Error("Not found. It may have been deleted.");
  if (!res.ok) throw new Error(data.message || "Something went wrong. Try again.");
  return data;
}

// Fetches the file through the same authenticated, owner-checked download route,
// so viewing is authorized exactly like downloading. Text is read as a string;
// images and PDFs become a short-lived object URL (revoked when the preview closes).
async function loadPreview(item) {
  let res;
  try {
    res = await apiFetch(`/api/user/uploads/${item.id}`);
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  if (res.status === 401) throw new Error("Your session has expired. Sign in again.");
  if (!res.ok) throw new Error("Couldn't open this file. It may have been deleted.");
  const blob = await res.blob();
  if (item.mimeType.startsWith("text/")) return { text: await blob.text() };
  return { url: URL.createObjectURL(blob) };
}

export function AnalysisDocuments({ analysisId }) {
  const [uploads, setUploads] = useState(null); // null while loading
  const [listError, setListError] = useState("");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // null | "uploading" | "success" | "error"
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  // { item, loading?, error?, text?, url? } for the document being viewed, or null.
  const [preview, setPreview] = useState(null);
  const previewSeq = useRef(0); // ignores a slow response after the user opened another file
  const previewRef = useRef(null);
  const inputRef = useRef(null);

  // Free the previous preview's object URL whenever the preview changes or the tab closes.
  useEffect(() => () => preview?.url && URL.revokeObjectURL(preview.url), [preview]);

  useEffect(() => {
    if (preview) previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [preview?.item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function closePreview() {
    previewSeq.current++;
    setPreview(null);
  }

  function view(item) {
    if (preview?.item.id === item.id) return closePreview();
    const seq = ++previewSeq.current;
    setPreview({ item, loading: true });
    loadPreview(item)
      .then((content) => {
        if (seq !== previewSeq.current) return content.url && URL.revokeObjectURL(content.url);
        setPreview({ item, ...content });
      })
      .catch((err) => seq === previewSeq.current && setPreview({ item, error: err.message }));
  }

  useEffect(() => {
    request(`/api/user/history/${analysisId}/uploads`)
      .then((data) => setUploads(data.uploads))
      .catch((err) => {
        setUploads([]);
        setListError(err.message);
      });
  }, [analysisId]);

  function choose(e) {
    const picked = e.target.files[0] || null;
    setFile(picked);
    setStatus(null);
    if (picked && picked.size > MAX_BYTES) {
      setStatus("error");
      setMessage(`${picked.name} is ${formatSize(picked.size)}. Files are limited to 5 MB.`);
    }
  }

  function upload(e) {
    e.preventDefault();
    if (!file || file.size > MAX_BYTES) return;
    const form = new FormData();
    form.append("file", file);
    setStatus("uploading");
    request(`/api/user/history/${analysisId}/uploads`, { method: "POST", body: form })
      .then(({ upload: saved }) => {
        setUploads((list) => [saved, ...(list || [])]);
        setFile(null);
        inputRef.current.value = "";
        setStatus("success");
        setMessage(`Uploaded ${saved.originalName}.`);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      });
  }

  function remove(item) {
    if (!window.confirm(`Delete "${item.originalName}"? This can't be undone.`)) return;
    setDeletingId(item.id);
    request(`/api/user/uploads/${item.id}`, { method: "DELETE" })
      .then(() => {
        if (preview?.item.id === item.id) closePreview();
        setUploads((list) => list.filter((u) => u.id !== item.id));
        setStatus("success");
        setMessage(`Deleted ${item.originalName}.`);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      })
      .finally(() => setDeletingId(null));
  }

  return (
    <div className="docs-view">
      <section className="docs-panel">
        <header className="docs-head">
          <h2>Knowledge</h2>
          <p>
            Keep the documents that explain this codebase next to its analysis: architecture decision records,
            design docs, specs and diagrams. PDF, PNG, JPEG, Markdown or text, up to 5 MB.
          </p>
        </header>

        <form className="docs-upload" onSubmit={upload}>
          <label className="docs-choose">
            <input ref={inputRef} type="file" accept={ACCEPT} onChange={choose} />
            <Upload size={15} aria-hidden="true" />
            {file ? "Change file" : "Choose file"}
          </label>
          <span className="docs-picked">{file ? `${file.name} · ${formatSize(file.size)}` : "No file selected"}</span>
          <button type="submit" className="btn btn-solid" disabled={!file || file.size > MAX_BYTES || status === "uploading"}>
            {status === "uploading" ? "Uploading…" : "Upload"}
          </button>
        </form>

        {status === "error" && <p className="docs-message docs-message-error" role="alert">{message}</p>}
        {status === "success" && <p className="docs-message" role="status">{message}</p>}

        {uploads === null ? (
          <p className="docs-empty">Loading…</p>
        ) : listError ? (
          <p className="docs-message docs-message-error" role="alert">{listError}</p>
        ) : uploads.length === 0 ? (
          <p className="docs-empty">No documents yet. Upload an ADR, design doc or diagram for this analysis.</p>
        ) : (
          <ul className="docs-list">
            {uploads.map((u) => (
              <li key={u.id} className="docs-item">
                <FileText size={18} className="docs-item-icon" aria-hidden="true" />
                <div className="docs-item-info">
                  <span className="docs-item-name">{u.originalName}</span>
                  <span className="docs-item-meta">
                    {TYPE_LABEL[u.mimeType] || u.mimeType} · {formatSize(u.size)} ·{" "}
                    <time dateTime={new Date(u.createdAt).toISOString()} title={new Date(u.createdAt).toLocaleString()}>
                      {timeAgo(u.createdAt)}
                    </time>
                  </span>
                </div>
                <button type="button" className="docs-action" onClick={() => view(u)} aria-expanded={preview?.item.id === u.id}>
                  {preview?.item.id === u.id ? "Hide" : "View"}
                </button>
                {/* The server sends it as an attachment after checking the session and ownership. */}
                <a className="docs-action" href={apiUrl(`/api/user/uploads/${u.id}`)}>Download</a>
                <button
                  type="button"
                  className="docs-action docs-action-destructive"
                  onClick={() => remove(u)}
                  disabled={deletingId === u.id}
                >
                  {deletingId === u.id ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}

        {preview && (
          <section className="docs-preview" ref={previewRef} aria-label={`Preview of ${preview.item.originalName}`}>
            <header className="docs-preview-head">
              <div className="docs-item-info">
                <span className="docs-item-name">{preview.item.originalName}</span>
                {/* The record id is the document's _id in the MongoDB uploads collection. */}
                <span className="docs-item-meta">
                  {TYPE_LABEL[preview.item.mimeType] || preview.item.mimeType} · {formatSize(preview.item.size)} · record id{" "}
                  <code>{preview.item.id}</code>
                </span>
              </div>
              <button type="button" className="docs-action" onClick={closePreview}>Close</button>
            </header>
            {preview.loading ? (
              <p className="docs-empty">Loading…</p>
            ) : preview.error ? (
              <p className="docs-message docs-message-error" role="alert">{preview.error}</p>
            ) : preview.item.mimeType === "text/markdown" ? (
              <div className="docs-preview-body analyze-explanation">
                {/* Raw HTML inside the file is shown as text, never rendered. */}
                <Markdown options={{ forceBlock: true, disableParsingRawHTML: true }}>{preview.text}</Markdown>
              </div>
            ) : preview.text !== undefined ? (
              <pre className="docs-preview-body docs-preview-text">{preview.text}</pre>
            ) : preview.item.mimeType === "application/pdf" ? (
              <iframe className="docs-preview-pdf" src={preview.url} title={preview.item.originalName} />
            ) : (
              <img className="docs-preview-image" src={preview.url} alt={preview.item.originalName} />
            )}
          </section>
        )}
      </section>
    </div>
  );
}
