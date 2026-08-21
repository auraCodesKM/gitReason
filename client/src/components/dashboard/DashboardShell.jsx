import "./dashboard-shell.css";

export function DashboardShell({ sidebar, header, children }) {
  return (
    <div className="dashboard-shell">
      {sidebar}
      <div className="dashboard-main">
        {header}
        <div className="dashboard-main-content">{children}</div>
      </div>
    </div>
  );
}
