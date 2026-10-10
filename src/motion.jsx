import React, { useEffect, useRef, useState } from "react";
import "./motion.css";

/*
 * Small motion pieces for the app's "it happened" moments. Several are
 * adapted from React Bits (reactbits.dev, MIT + Commons Clause): ClickSpark,
 * CountUp, GlareHover and ShinyText, rewritten without dependencies.
 *
 * Every JS-driven effect checks prefers-reduced-motion itself; the global
 * CSS rule only stops CSS animations and transitions. Environments without
 * matchMedia (jsdom in tests) are treated as reduced motion, so values
 * render final immediately.
 */
export function reducedMotion() {
  return (
    typeof window === "undefined" ||
    !window.matchMedia ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/*
 * Animates from the previous value to `value`; from 0 on first mount.
 * Pass round: false for fractional output such as a ring's arc.
 */
export function useCountUp(value, { duration = 900, round = true } = {}) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  const from = useRef(shown);
  useEffect(() => {
    if (reducedMotion() || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let id;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const v = start + (value - start) * easeOut(t);
      from.current = v;
      setShown(round ? Math.round(v) : v);
      if (t < 1) id = requestAnimationFrame(tick);
      else from.current = value;
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, duration, round]);
  return shown;
}

export function CountUp({ value, duration, className = "" }) {
  const shown = useCountUp(value, { duration });
  return <span className={`count-up ${className}`.trim()}>{shown}</span>;
}

/*
 * Spark burst on a single fixed, full-viewport canvas appended to <body>,
 * so a burst outlives the dialog or button that fired it. The frame loop
 * only runs while sparks are alive.
 */
const brandSparks = ["#22bced", "#a1e2f7", "#c2e6db", "#ffffff"];
let layer = null;
let ctx = null;
let sparks = [];
let frame = 0;

function ensureLayer() {
  if (layer) return ctx;
  layer = document.createElement("canvas");
  layer.className = "spark-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  ctx = layer.getContext("2d");
  return ctx;
}

function draw(now) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, layer.width, layer.height);
  sparks = sparks.filter((s) => now - s.start < s.duration);
  for (const s of sparks) {
    const t = Math.max(0, (now - s.start) / s.duration);
    const e = easeOut(t);
    const d = e * s.radius;
    const len = s.size * (1 - e);
    const cos = Math.cos(s.angle);
    const sin = Math.sin(s.angle);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x + d * cos, s.y + d * sin);
    ctx.lineTo(s.x + (d + len) * cos, s.y + (d + len) * sin);
    ctx.stroke();
  }
  frame = sparks.length ? requestAnimationFrame(draw) : 0;
  if (!frame) ctx.clearRect(0, 0, layer.width, layer.height);
}

export function spark(
  x,
  y,
  {
    colors = brandSparks,
    count = 12,
    radius = 56,
    size = 16,
    width = 3,
    duration = 560,
  } = {},
) {
  if (reducedMotion() || !ensureLayer()) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (layer.width !== w || layer.height !== h) {
    layer.width = w;
    layer.height = h;
  }
  const start = performance.now();
  const offset = Math.random() * Math.PI;
  for (let i = 0; i < count; i++) {
    sparks.push({
      x,
      y,
      angle: offset + (2 * Math.PI * i) / count,
      color: colors[i % colors.length],
      radius: radius * (i % 2 ? 0.72 : 1),
      size,
      width,
      duration,
      start,
    });
  }
  if (!frame) frame = requestAnimationFrame(draw);
}

/* Burst from the centre of an element, e.g. the button that was pressed. */
export function sparkFrom(el, options) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  spark(r.left + r.width / 2, r.top + r.height / 2, options);
}

/*
 * A light sweep across its positioned parent, on parent hover. The layer
 * paints its own gradient, so the parent needs no overflow: hidden and
 * shirts can still break out of the card. `once` also sweeps on mount,
 * which is the only way touch screens see it; key the parent to replay.
 */
export function Glare({ once = false, className = "" }) {
  return (
    <span
      className={`glare ${once ? "glare-once" : ""} ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
