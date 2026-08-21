import { AnalyzeRepoButton } from "../AnalyzeRepoButton";
import { AccountMenu } from "../AccountMenu";
import { DrawnUnderline } from "../../sections/DrawnUnderline";
import "./dashboard-header.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({ user, hasCodebases, onToggleSidebar, heading, subheading }) {
  return (
    <header className="dashboard-main-header">
      <button type="button" className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Toggle menu">
        <span /><span /><span />
      </button>

      <div className="dashboard-greeting">
        <h1>
          {heading ?? (
            <>
              {greeting()},{" "}
              <span className="headline-accent">
                <em>{user.username}</em>
                <DrawnUnderline seed={user.username.length * 11 + 3} strokeWidth="2.6" />
              </span>
            </>
          )}
        </h1>
        <p>
          {subheading ??
            (hasCodebases
              ? "Here's what GitReason has learned across your codebases."
              : "Let's map your first codebase.")}
        </p>
      </div>

      <div className="dashboard-header-actions">
        <AnalyzeRepoButton />
        <AccountMenu user={user} />
      </div>
    </header>
  );
}
