import { History } from "lucide-react";
import { IconBadge } from "./IconBadge";
import { timeAgo } from "../../lib/time";
import { toneForKey } from "../../lib/tone";
import "./recent-analyses.css";

export function RecentAnalyses({ items }) {
  function open(item) {
    window.location.href = `/analyze?repo=${encodeURIComponent(item.repoFullName)}&cached=${item.id}`;
  }

  return (
    <div className="dashboard-panel recent-analyses">
      <div className="dashboard-panel-head">
        <div className="dashboard-panel-head-title">
          <IconBadge icon={History} tone="blue" />
          <h2>Recent analyses</h2>
        </div>
      </div>

      {items === null && <p className="dashboard-panel-loading">Loading…</p>}
      {items && items.length === 0 && <p className="dashboard-panel-empty">No analyses yet.</p>}

      {items && items.length > 0 && (
        <table className="recent-analyses-table">
          <tbody>
            {items.map((item) => {
              const repoName = item.repoFullName.split("/")[1] || item.repoFullName;
              const tone = toneForKey(item.repoFullName);
              return (
                <tr key={item.id} onClick={() => open(item)}>
                  <td className="ra-avatar-cell">
                    <span className={`repo-avatar repo-avatar-sm repo-avatar-${tone}`}>
                      {repoName[0]?.toUpperCase()}
                    </span>
                  </td>
                  <td className="ra-repo">{item.repoFullName}</td>
                  <td className="ra-status-cell"><span className={`ra-status ra-status-${item.status}`}>{item.status}</span></td>
                  <td className="ra-time">{timeAgo(item.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
