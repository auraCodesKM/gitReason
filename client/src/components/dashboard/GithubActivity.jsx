import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { IconBadge } from "./IconBadge";
import "./github-activity.css";

const RANGES = [
  { key: "30", label: "30d", weeks: 5 },
  { key: "90", label: "90d", weeks: 13 },
  { key: "365", label: "1y", weeks: 53 },
];

function level(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

export function GithubActivity({ activity }) {
  const [range, setRange] = useState("365");

  const weeks = useMemo(() => {
    if (!activity?.available) return [];
    const def = RANGES.find((r) => r.key === range);
    return activity.weeks.slice(-def.weeks);
  }, [activity, range]);

  const total = useMemo(
    () => weeks.flatMap((w) => w.days).reduce((sum, d) => sum + d.count, 0),
    [weeks]
  );

  return (
    <div className="dashboard-panel github-activity">
      <div className="dashboard-panel-head">
        <div className="dashboard-panel-head-title">
          <IconBadge icon={Activity} tone="accent" />
          <h2>GitHub activity</h2>
        </div>
        {activity?.available && (
          <div className="range-toggle">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={r.key === range ? "is-active" : ""}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!activity && <p className="dashboard-panel-loading">Loading…</p>}

      {activity && !activity.available && (
        <p className="dashboard-panel-empty">GitHub activity isn&rsquo;t available for this account right now.</p>
      )}

      {activity?.available && (
        <>
          <div className="activity-heatmap">
            {weeks.map((week, i) => (
              <div className="activity-heatmap-col" key={i}>
                {week.days.map((day) => (
                  <span
                    key={day.date}
                    className={`activity-cell activity-level-${level(day.count)}`}
                    title={`${day.count} contribution${day.count === 1 ? "" : "s"} on ${day.date}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="github-activity-total">{total.toLocaleString()} contributions in this range</p>
        </>
      )}
    </div>
  );
}
