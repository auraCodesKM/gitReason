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
export function Sidebar({ mobileOpen, onCloseMobile, hasContent, page = "dashboard" }) {
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

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={`dashboard-sidebar ${mobileOpen ? "is-open" : ""}`}>
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
                onClick={onCloseMobile}
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
