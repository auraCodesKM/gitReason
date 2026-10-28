import { useEffect, useRef, useState } from "react";
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

export function AnalysisDocuments({ analysisId }) {
  const [uploads, setUploads] = useState(null); // null while loading
  const [listError, setListError] = useState("");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // null | "uploading" | "success" | "error"
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const inputRef = useRef(null);

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
      </section>
    </div>
  );
}
