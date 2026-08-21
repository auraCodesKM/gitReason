import { useEffect, useState } from "react";
import { LayoutGrid, Activity, FolderGit, Telescope, Settings as SettingsIcon } from "lucide-react";
import { LogoMark } from "../../sections/LogoMark";
import "./sidebar.css";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "codebases", label: "Codebases", icon: FolderGit },
];

// page: "dashboard" (default) tracks scroll position within the current
// page's own #id sections; any other page (e.g. "settings") just links
// back to those sections on /dashboard instead of scroll-spying itself.
export function Sidebar({ open, onClose, hasContent, page = "dashboard" }) {
  const [active, setActive] = useState("overview");
  const onDashboard = page === "dashboard";

  useEffect(() => {
    if (!onDashboard || !hasContent) return;
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
  }, [onDashboard, hasContent]);

  // Navigating via a link should close the mobile overlay drawer (its job
  // is to get out of the way), but leave the desktop sidebar exactly as
  // the user left it - collapsing it on every click there would be
  // surprising, not helpful.
  function closeIfMobile() {
    if (window.matchMedia("(max-width: 900px)").matches) onClose();
  }

  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`dashboard-sidebar ${open ? "is-open" : ""}`}>
        <a href="/" className="sidebar-logo" aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>

        <nav className="sidebar-nav">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = onDashboard && (hasContent ? active === s.id : s.id === "overview");
            const href = onDashboard ? `#${s.id}` : `/dashboard#${s.id}`;
            return (
              <a
                key={s.id}
                href={href}
                className={`sidebar-nav-item ${isActive ? "is-active" : ""}`}
                onClick={closeIfMobile}
              >
                <Icon size={16} strokeWidth={2} />
                {s.label}
              </a>
            );
          })}
          <span className="sidebar-nav-item sidebar-nav-item-disabled">
            <Telescope size={16} strokeWidth={2} />
            Insights
            <span className="sidebar-nav-soon">Soon</span>
          </span>
        </nav>

        <div className="sidebar-footer">
          <a href="/settings" className={`sidebar-nav-item ${page === "settings" ? "is-active" : ""}`}>
            <SettingsIcon size={16} strokeWidth={2} />
            Settings
          </a>
        </div>
      </aside>
    </>
  );
}
