import "./icon-badge.css";

export function IconBadge({ icon: Icon, tone = "accent" }) {
  return (
    <span className={`icon-badge icon-badge-${tone}`}>
      <Icon size={14} strokeWidth={2} />
    </span>
  );
}
