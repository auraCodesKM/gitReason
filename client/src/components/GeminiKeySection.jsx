import { useState } from "react";
import { apiFetch } from "../lib/api";

export function GeminiKeySection({ hasKey, onChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(null); // null | "saving" | "error"
  const [errorMsg, setErrorMsg] = useState("");

  function save(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setStatus("saving");
    apiFetch("/api/user/gemini-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: value.trim() }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setStatus("error");
          setErrorMsg(data.message || "Couldn't save that key.");
          return;
        }
        setValue("");
        setEditing(false);
        setStatus(null);
        onChange(true);
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Couldn't reach the server.");
      });
  }

  function remove() {
    apiFetch("/api/user/gemini-key", { method: "DELETE" }).then(() => onChange(false));
  }

  const showForm = editing || !hasKey;

  return (
    <div className="settings-card">
      <h3 className="settings-card-title">Gemini</h3>
      <p className="settings-card-hint">Use your own Gemini API quota for repository analysis.</p>

      {showForm ? (
        <form className="settings-row" onSubmit={save}>
          <input
            type="password"
            className="settings-input"
            placeholder="AIza…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoFocus={editing}
          />
          <button type="submit" className="btn btn-solid" disabled={status === "saving" || !value.trim()}>
            {status === "saving" ? "Checking…" : hasKey ? "Update key" : "Configure"}
          </button>
          {hasKey && (
            <button type="button" className="settings-link" onClick={() => { setEditing(false); setValue(""); setStatus(null); }}>
              Cancel
            </button>
          )}
        </form>
      ) : (
        <div className="settings-row">
          <span className="settings-key-mask">••••••••••••••••••••••</span>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>Update key</button>
          <button type="button" className="settings-link settings-link-destructive" onClick={remove}>Remove</button>
        </div>
      )}

      {status === "error" && <p className="settings-error">{errorMsg}</p>}
      <p className="settings-security-hint">Your key is encrypted and never exposed to the client.</p>
    </div>
  );
}
