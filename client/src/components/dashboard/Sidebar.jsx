import { useEffect, useState } from "react";
import { LogoMark } from "../../sections/LogoMark";
import "./sidebar.css";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "codebases", label: "Codebases" },
];

export function Sidebar({ mobileOpen, onCloseMobile, hasContent }) {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    if (!hasContent) return;
    const ids = SECTIONS.map((s) => s.id);
    const LINE = 140; // px from the top of the viewport

    function onScroll() {
      // the active section is whichever one's top has most recently
      // scrolled past LINE - falls back to the first section at page top
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= LINE) current = id;
      }
      setActive(current);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasContent]);

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={`dashboard-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <a href="/" className="sidebar-logo" aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>

        <nav className="sidebar-nav">
          {SECTIONS.map((s) =>
            hasContent ? (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`sidebar-nav-item ${active === s.id ? "is-active" : ""}`}
                onClick={onCloseMobile}
              >
                {s.label}
              </a>
            ) : (
              <span key={s.id} className={`sidebar-nav-item ${s.id === "overview" ? "is-active" : ""}`}>
                {s.label}
              </span>
            )
          )}
          <span className="sidebar-nav-item sidebar-nav-item-disabled" title="Coming soon">
            Insights
          </span>
        </nav>

        <div className="sidebar-footer">
          <a href="/settings" className="sidebar-nav-item">Settings</a>
        </div>
      </aside>
    </>
  );
}
