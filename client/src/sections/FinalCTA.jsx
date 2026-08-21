import { useState } from "react";
import { DrawablyButton } from "drawably/react";
import { useReveal, useParallax, useCursorParallax } from "./hooks";
import { useRepoCheck } from "./useRepoCheck";
import { normalizeRepoInput } from "../lib/repo";
import "./section-cta.css";

const SCROLL_LIMIT = 26;

function RepoArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FinalCTA() {
  const [showRepoInput, setShowRepoInput] = useState(false);
  const [repoValue, setRepoValue] = useState("");
  const { repoStatus, checkRepo, clearStaleError } = useRepoCheck();

  const [revealRef, inView] = useReveal({ threshold: 0.15 });
  const [scrollRef, rawScrollOffset] = useParallax(0.08);
  const [cursorRef, cursor, onMouseMove, onMouseLeave] = useCursorParallax(26);
  const scrollOffset = Math.max(-SCROLL_LIMIT, Math.min(SCROLL_LIMIT, rawScrollOffset));

  function setVisualRef(node) {
    revealRef.current = node;
    scrollRef.current = node;
    cursorRef.current = node;
  }

  function handleRepoSubmit(e) {
    e.preventDefault();
    if (!repoValue.trim()) return;
    checkRepo(repoValue);
  }

  return (
    <section id="start" className="cta-section">
      <div
        ref={setVisualRef}
        className={`cta-visual reveal ${inView ? "is-in" : ""}`}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <img
          src="/footer-tree.png"
          alt=""
          aria-hidden="true"
          className="cta-visual-art"
          style={{ transform: `translate(${cursor.x}px, ${cursor.y + scrollOffset}px)` }}
        />
        <div className="cta-scrim" />

        <div className="cta-inner">
          <h2 className="cta-title">Know what you&rsquo;re changing.</h2>
          <p className="cta-lede">Point GitReason at a repository and see the graph, the history, and the risk before you touch a line.</p>

          <div className="cta-actions">
            {showRepoInput ? (
              <>
                <form className="repo-input" onSubmit={handleRepoSubmit}>
                  <span className="repo-input-prefix">github.com/</span>
                  <input
                    type="text"
                    className="repo-input-field"
                    placeholder="owner/repository"
                    value={repoValue}
                    onChange={(e) => { setRepoValue(normalizeRepoInput(e.target.value)); clearStaleError(); }}
                    onBlur={() => { if (!repoValue.trim()) setShowRepoInput(false); }}
                    disabled={repoStatus === "checking"}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="repo-input-submit"
                    aria-label="Analyze repository"
                    disabled={repoStatus === "checking"}
                  >
                    <RepoArrowIcon />
                  </button>
                </form>
                {repoStatus === "checking" && (
                  <span className="repo-input-error repo-input-hint">Checking repository&hellip;</span>
                )}
                {repoStatus === "invalid" && (
                  <span className="repo-input-error">
                    Enter a valid GitHub repository, like owner/repository.
                  </span>
                )}
                {repoStatus === "not_found" && (
                  <span className="repo-input-error">
                    Repository not found or still not accessible with this account.
                  </span>
                )}
                {repoStatus === "error" && (
                  <span className="repo-input-error">Couldn&rsquo;t reach GitHub. Try again.</span>
                )}
                {repoStatus === "rate_limited" && (
                  <span className="repo-input-error">GitHub rate limit reached. Try again shortly.</span>
                )}
              </>
            ) : (
              <DrawablyButton className="drawn-btn cta-btn" onClick={() => setShowRepoInput(true)}>
                Analyze a Repository
              </DrawablyButton>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
