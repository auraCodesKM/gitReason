import { IconBadge } from "./IconBadge";
import "./metric-card.css";

export function MetricCard({ icon, tone = "accent", label, value }) {
  return (
    <div className="metric-card">
      <div className="metric-card-head">
        <IconBadge icon={icon} tone={tone} />
        <span className="metric-label">{label}</span>
      </div>
      <span className="metric-value">{value.toLocaleString()}</span>
    </div>
  );
}
