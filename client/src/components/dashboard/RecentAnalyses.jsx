import { timeAgo } from "../../lib/time";
import "./recent-analyses.css";

export function RecentAnalyses({ items }) {
  function open(item) {
    window.location.href = `/analyze?repo=${encodeURIComponent(item.repoFullName)}&cached=${item.id}`;
  }

  return (
    <div className="dashboard-panel recent-analyses">
      <div className="dashboard-panel-head">
        <h2>Recent analyses</h2>
      </div>

      {items === null && <p className="dashboard-panel-loading">Loading…</p>}
      {items && items.length === 0 && <p className="dashboard-panel-empty">No analyses yet.</p>}

      {items && items.length > 0 && (
        <table className="recent-analyses-table">
          <tbody>
            {items.map((item) => (
              <tr key={item.id} onClick={() => open(item)}>
                <td className="ra-repo">{item.repoFullName}</td>
                <td><span className={`ra-status ra-status-${item.status}`}>{item.status}</span></td>
                <td className="ra-time">{timeAgo(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
