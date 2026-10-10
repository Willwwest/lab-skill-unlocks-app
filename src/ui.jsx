import React from "react";
import { tiers } from "./domain";

export const categoryMeta = {
  "Grip & traverse": { color: "#22bced", slug: "grip" },
  "Warped wall": { color: "#f25c9a", slug: "wall" },
  Movement: { color: "#34c98a", slug: "movement" },
  Basketball: { color: "#ff9a1f", slug: "basketball" },
  "Course skills": { color: "#9b7bff", slug: "course" },
};

export const stationMeta = {
  grip: categoryMeta["Grip & traverse"],
  wall: categoryMeta["Warped wall"],
  movement: categoryMeta.Movement,
  court: categoryMeta.Basketball,
  course: categoryMeta["Course skills"],
};

const HEX = "M50 3 L91 26.5 V73.5 L50 97 L9 73.5 V26.5 Z";

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
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`ring ${className}`.trim()} style={{ width: size, height: size }}>
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
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

/*
 * Skill patch: a hexagon in the category color carrying the skill number.
 * Earned patches are filled, open ones outlined, locked ones dashed.
 */
export function Badge({ category, label, state = "open", className = "" }) {
  const meta = categoryMeta[category] ?? categoryMeta["Course skills"];
  return (
    <span
      className={`badge badge-${state} ${className}`.trim()}
      style={{ "--cat": meta.color }}
      aria-hidden="true"
    >
      <svg className="badge-shape" viewBox="0 0 100 100">
        <path className="badge-hex" d={HEX} />
      </svg>
      <span className="badge-label">{label}</span>
    </span>
  );
}

export const skillNumber = (id) => id.replace(/^S/, "");

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
