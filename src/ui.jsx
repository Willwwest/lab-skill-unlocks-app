import React from "react";
import { tiers } from "./domain";
import { useCountUp } from "./motion.jsx";

export function Ring({
  value = 0,
  max = 1,
  size = 48,
  stroke = 5,
  color = "var(--cyan)",
  track = "rgba(15,14,84,0.08)",
  className = "",
  children,
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = useCountUp(value, { round: false });
  const pct = max > 0 ? Math.max(0, Math.min(1, shown / max)) : 0;
  return (
    <div
      className={`ring ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-content">{children}</div>
    </div>
  );
}

/* A thin linear meter: the default way to show progress. */
export function Meter({ value = 0, max = 1, color, label, className = "" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      className={`meter ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      style={color ? { "--meter": color } : undefined}
    >
      <span style={{ transform: `scaleX(${pct / 100})` }} />
    </span>
  );
}

/*
 * Skill number tile, set like a jersey number. Earned tiles use the brand
 * gradient, open ones pale cyan, locked ones an outlined numeral.
 */
export function Badge({ label, state = "open", className = "" }) {
  return (
    <span
      className={`badge badge-${state} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="badge-label">{label}</span>
    </span>
  );
}

export const skillNumber = (id) => id.replace(/^S/, "");

/* The site's outlined LEARN / ADAPT / BUILD lettering, used as a backdrop. */
export function OutlineWords({ className = "" }) {
  return (
    <span className={`outline-words ${className}`.trim()} aria-hidden="true">
      <span>LEARN</span>
      <span>ADAPT</span>
      <span>BUILD</span>
    </span>
  );
}

/*
 * Shirt photography: cutouts of the four concept mockups in
 * ../brandkit/shirts, exported to public/shirts/tier-{n}-{front|back}.webp.
 */
export function ShirtImage({
  tier = 1,
  view = "front",
  className = "",
  alt,
  eager = false,
}) {
  const t = tiers[tier - 1];
  return (
    <img
      className={`shirt-img ${className}`.trim()}
      src={`${import.meta.env.BASE_URL}shirts/tier-${tier}-${view}.webp`}
      alt={alt ?? `${t.name} tier ${tier} shirt, ${view}`}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      draggable={false}
    />
  );
}
