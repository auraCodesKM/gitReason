import { useMemo } from "react";
import { roughLine, variants } from "drawably";

export function DrawnUnderline({ className = "headline-underline", seed = 42, strokeWidth = "3", color = "var(--accent)" }) {
  const paths = useMemo(
    () => variants((o) => roughLine(4, 9, 196, 11, o), { seed, roughness: 1.1, boil: 0.6 }, 3),
    [seed]
  );
  return (
    <svg className={className} viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          className="drawably-boil"
          data-i={i}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
