export function LogoMark({ className = "" }) {
  const d =
    "M 15 15 C 15 5, 25 5, 30 15 C 35 25, 45 25, 45 15 C 45 5, 35 5, 30 15 C 25 25, 15 25, 15 15";
  return (
    <svg className={`logo-mark ${className}`} viewBox="0 0 60 30" fill="none" aria-hidden="true">
      <path d={d} stroke="rgba(255,255,255,0.16)" strokeWidth="4" strokeLinecap="round" />
      <path
        className="logo-mark-sweep"
        d={d}
        stroke="var(--accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="100"
      />
    </svg>
  );
}
