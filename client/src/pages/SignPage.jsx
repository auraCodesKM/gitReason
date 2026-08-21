import { useEffect, useState } from "react";
import { Agentation } from "agentation";
import { LogoMark } from "../sections/LogoMark";
import { normalizeRepoInput, isValidRepoPath } from "../lib/repo";
import { apiUrl } from "../lib/api";
import "./sign-page.css";

const ERROR_COPY = {
  cancelled: "GitHub sign-in was cancelled.",
  state_mismatch: "Sign-in session expired. Please try again.",
  expired: "Sign-in session expired. Please try again.",
  no_code: "GitHub didn't return an authorization code. Please try again.",
  token_exchange_failed: "Couldn't complete sign-in with GitHub. Please try again.",
  github_unreachable: "Couldn't reach GitHub. Please try again.",
  not_found: "That repository couldn't be found or you still don't have access.",
  error: "Something went wrong. Please try again.",
};

function GitHubMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function SignPage() {
  const [repoValue, setRepoValue] = useState("");
  const [errorReason, setErrorReason] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repo = params.get("repo");
    const reason = params.get("reason");

    if (repo) setRepoValue(normalizeRepoInput(repo));
    if (params.get("auth") === "error") setErrorReason(reason || "error");

    if (params.has("auth") || params.has("reason")) {
      const kept = new URLSearchParams();
      if (repo) kept.set("repo", repo);
      const qs = kept.toString();
      window.history.replaceState({}, "", qs ? `/sign?${qs}` : "/sign");
    }
  }, []);

  const trimmed = repoValue.trim();
  // A repo is optional — leaving it blank just signs in and lands on the
  // dashboard. Typing something disables the button until it's a real
  // owner/repo, so a half-typed value can't be submitted by mistake.
  const canContinue = trimmed === "" || isValidRepoPath(trimmed);

  function handleContinue(e) {
    e.preventDefault();
    if (!canContinue) return;
    setPending(true);
    const query = trimmed ? `?repo=${encodeURIComponent(trimmed)}` : "";
    window.location.href = apiUrl(`/api/auth/github/start${query}`);
  }

  return (
    <div className="sign-page">
      <div className="sign-left">
        <div className="sign-topbar">
          <a href="/" className="sign-logo" aria-label="GitReason">
            <LogoMark />
            GitReason
          </a>
          <a href="/" className="sign-back">Back to home</a>
        </div>

        <form className="sign-content" onSubmit={handleContinue}>
          <h1>Connect GitHub</h1>
          <p className="sign-copy">
            Sign in to analyze private repositories and save your history. A repository
            is optional here — add one now or just sign in and pick one from your dashboard.
          </p>

          <label className="sign-field" htmlFor="sign-repo">
            <span className="sign-field-label">Repository (optional)</span>
            <div className="sign-field-input">
              <span className="sign-field-prefix">github.com/</span>
              <input
                id="sign-repo"
                type="text"
                placeholder="owner/repository"
                value={repoValue}
                onChange={(e) => { setRepoValue(normalizeRepoInput(e.target.value)); setErrorReason(null); }}
                autoFocus
              />
            </div>
          </label>

          {errorReason && (
            <p className="sign-error">{ERROR_COPY[errorReason] || ERROR_COPY.error}</p>
          )}

          <button type="submit" className="btn btn-gold sign-cta" disabled={!canContinue || pending}>
            <GitHubMark />
            {pending ? "Redirecting…" : "Continue with GitHub"}
          </button>

          <p className="sign-secondary">
            Public repositories can be analyzed without signing in.
          </p>
        </form>

        <div className="sign-footer">
          <span>&copy; {new Date().getFullYear()} GitReason</span>
          <div className="sign-footer-links">
            <a href="/terms.html">Terms</a>
            <a href="/privacy.html">Privacy</a>
          </div>
        </div>
      </div>

      <div className="sign-right" aria-hidden="true">
        <img
          src="/sign-image.svg"
          alt=""
          className="sign-image"
          draggable="false"
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </div>
  );
}
