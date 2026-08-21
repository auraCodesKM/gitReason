import { useMemo, useState } from "react";
import "./activity-calendar.css";

const CELL_SIZE = 11;
const GAP = 3;
const MONTHS = 6;
const WEEKS_PER_MONTH = 365.25 / 12 / 7;
const MIN_LABEL_WEEKS = 3;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TOP_REPOS_LIMIT = 3;

const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Real usage here is small integers (a handful of analyses a day at most),
// not GitHub's percentile-scaled activity — fixed thresholds read more
// honestly than a quantile scale that's mostly zeros.
function levelFor(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

// Builds a Sun-Sat grid ending today, `months` back, from a date->count map.
function buildWeeks(countByDate, months) {
  const weekCount = Math.max(1, Math.ceil(months * WEEKS_PER_MONTH));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay())); // extend to the following Saturday
  const start = new Date(end);
  start.setDate(start.getDate() - weekCount * 7 + 1);

  const weeks = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const key = toDateKey(cursor);
      const inFuture = cursor > today;
      week.push({ date: new Date(cursor), key, count: inFuture ? null : countByDate.get(key) || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function monthLabels(weeks) {
  const labels = weeks.map(() => null);
  const monthAt = (i) => weeks[i]?.[0]?.date.getMonth();
  let runStart = 0;
  for (let i = 1; i <= weeks.length; i++) {
    if (i < weeks.length && monthAt(i) === monthAt(runStart)) continue;
    if (i - runStart >= MIN_LABEL_WEEKS) labels[runStart] = MONTH_NAMES[monthAt(runStart)];
    runStart = i;
  }
  return labels;
}

function describeDay(day) {
  if (day.count === null) return null;
  const noun = day.count === 1 ? "analysis" : "analyses";
  return `${day.count} ${noun} on ${DATE_FORMAT.format(day.date)}`;
}

// A GitReason-native equivalent of a GitHub-style contribution calendar —
// deliberately NOT the pasted rare-ui component: this reads straight from
// the analyses this account has actually run (already fetched for the
// dashboard, no extra request), not a third-party public-contributions API,
// and has no new dependency (no framer-motion, no portal — a simple
// absolutely-positioned tooltip is enough at this scale).
export function ActivityCalendar({ history }) {
  const [hovered, setHovered] = useState(null); // { day, x, y }

  const { weeks, total, topRepos } = useMemo(() => {
    const countByDate = new Map();
    const repoCounts = new Map();
    for (const item of history) {
      const key = toDateKey(new Date(item.createdAt));
      countByDate.set(key, (countByDate.get(key) || 0) + 1);
      repoCounts.set(item.repoFullName, (repoCounts.get(item.repoFullName) || 0) + 1);
    }
    const weeks = buildWeeks(countByDate, MONTHS);
    const topRepos = [...repoCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_REPOS_LIMIT)
      .map(([repoFullName, count]) => ({ repoFullName, count }));
    return { weeks, total: history.length, topRepos };
  }, [history]);

  const labels = useMemo(() => monthLabels(weeks), [weeks]);

  function handleEnter(day) {
    return (e) => {
      if (day.count === null) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cardRect = e.currentTarget.closest(".activity-calendar").getBoundingClientRect();
      setHovered({ day, x: rect.left + rect.width / 2 - cardRect.left, y: rect.top - cardRect.top });
    };
  }

  return (
    <div className="dashboard-card activity-calendar">
      <p className="activity-heading">{total} {total === 1 ? "analysis" : "analyses"} in the last {MONTHS} months</p>

      <div className="activity-months" style={{ gap: GAP }}>
        {labels.map((label, i) => (
          <div key={i} className="activity-month-cell" style={{ width: CELL_SIZE }}>
            {label && <span>{label}</span>}
          </div>
        ))}
      </div>

      <div className="activity-grid" style={{ gap: GAP }} onMouseLeave={() => setHovered(null)}>
        {weeks.map((week, wi) => (
          <div key={wi} className="activity-week" style={{ gap: GAP }}>
            {week.map((day) => (
              <div
                key={day.key}
                className="activity-cell"
                data-level={day.count === null ? "future" : levelFor(day.count)}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  animationDelay: REDUCED_MOTION ? "0ms" : `${wi * 10}ms`,
                }}
                onMouseEnter={handleEnter(day)}
              />
            ))}
          </div>
        ))}
      </div>

      {hovered && (
        // Rendered here, not inside .activity-grid: hovered.x/y are
        // computed relative to .activity-calendar, and .activity-grid has
        // overflow-x:auto for narrow screens, which would clip anything
        // positioned relative to it that pokes above its own top edge.
        <div className="activity-tooltip" style={{ left: hovered.x, top: hovered.y }}>
          {describeDay(hovered.day)}
        </div>
      )}

      {topRepos.length > 0 && (
        <div className="activity-footer">
          <span className="activity-footer-label">Most analyzed</span>
          <div className="activity-footer-list">
            {topRepos.map((r) => (
              <span key={r.repoFullName} className="activity-footer-item">
                {r.repoFullName} <span className="activity-footer-count">{r.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
