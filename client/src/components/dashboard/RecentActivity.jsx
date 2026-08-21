import { Clock } from "lucide-react";
import { IconBadge } from "./IconBadge";
import { timeAgo } from "../../lib/time";
import "./recent-activity.css";

export function RecentActivity({ items }) {
  return (
    <div className="dashboard-panel recent-activity">
      <div className="dashboard-panel-head">
        <div className="dashboard-panel-head-title">
          <IconBadge icon={Clock} tone="blue" />
          <h2>Recent activity</h2>
        </div>
      </div>

      {items === null && <p className="dashboard-panel-loading">Loading…</p>}
      {items && items.length === 0 && <p className="dashboard-panel-empty">No activity yet.</p>}

      {items && items.length > 0 && (
        <ul className="activity-feed">
          {items.map((item, i) => (
            <li className="activity-feed-item" key={item.id} style={{ animationDelay: `${i * 40}ms` }}>
              <span className="activity-feed-dot" />
              <div className="activity-feed-body">
                <p className="activity-feed-text">
                  {item.kind === "reanalyzed" ? "Re-analyzed " : "Analyzed "}
                  <strong>{item.repoFullName}</strong>
                </p>
                <span className="activity-feed-time">{timeAgo(item.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
