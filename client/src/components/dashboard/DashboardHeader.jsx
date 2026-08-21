import { AnalyzeRepoButton } from "../AnalyzeRepoButton";
import { AccountMenu } from "../AccountMenu";
import "./dashboard-header.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({ user, hasCodebases, onToggleSidebar }) {
  return (
    <header className="dashboard-main-header">
      <button type="button" className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Toggle menu">
        <span /><span /><span />
      </button>

      <div className="dashboard-greeting">
        <h1>{greeting()}, {user.username}</h1>
        <p>
          {hasCodebases
            ? "Here's what GitReason has learned across your codebases."
            : "Let's map your first codebase."}
        </p>
      </div>

      <div className="dashboard-header-actions">
        <AnalyzeRepoButton />
        <AccountMenu user={user} />
      </div>
    </header>
  );
}
