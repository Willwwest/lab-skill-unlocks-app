import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clock } from "./club.js";
import { createFloorScene } from "./floorScene.js";
import "./ds/tokens.css";
import "./floortv.css";

const reduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Which labels win a spot when two would overlap.
export const rank = { class: 0, paused: 1, open: 2, amenity: 3, closed: 4 };

// On the map a word is enough; the screen around it carries the detail.
function labelLine(z) {
  if (z.status === "class")
    return z.class?.segment === "Warm-up" ? "Warm-up" : "Class";
  if (z.status === "paused") return "Paused";
  if (z.status === "open")
    return z.soon ? `Class at ${clock(z.soon.start)}` : "Open";
  return null;
}

function Label({ zone, selected, innerRef }) {
  // A shared space a class is holding (the track at warm-up) gets a full label.
  const minor = !zone.station && zone.status !== "class";
  const line = minor ? null : labelLine(zone);
  return (
    <div
      ref={innerRef}
      className={`ftv-label is-${zone.status}${zone.soon ? " is-soon" : ""}${minor ? " is-minor" : ""}${selected ? " is-selected" : ""}`}
      aria-hidden="true"
    >
      <span className="ftv-label-name">{zone.name}</span>
      {line && <span className="ftv-label-state">{line}</span>}
    </div>
  );
}

/*
 * The gym floor model with its zone labels and legend, shared by every TV
 * screen. `status` is floorStatus(state, now); `view` is "3d" or "top";
 * `held` outlines a zone (and flies the 3D camera to it). `onPick` gets the
 * zone tapped, or null for empty floor. `apiRef.current.home()` resets the
 * camera. Anything passed as children sits on the stage (tools, insets).
 */
export default function FloorMap({
  layout,
  status,
  view = "3d",
  held = null,
  onPick,
  apiRef,
  legend = true,
  className = "",
  children,
}) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const labels = useRef({});
  const sizes = useRef({});
  const order = useRef({});
  const [error, setError] = useState("");
  const signature = status.zones
    .map((z) => `${z.id}:${z.status}:${z.soon?.start ?? ""}`)
    .join("|");

  // Label sizes and priority change only with their text; refresh after
  // each render so the frame loop reads them without touching layout.
  useLayoutEffect(() => {
    for (const [id, el] of Object.entries(labels.current))
      if (el) sizes.current[id] = { w: el.offsetWidth, h: el.offsetHeight };
    order.current = Object.fromEntries(
      [...status.zones]
        .sort(
          (a, b) =>
            rank[a.status] - rank[b.status] ||
            !a.station - !b.station ||
            b.w * b.d - a.w * a.d,
        )
        .map((z, i) => [z.id, i]),
    );
  });

  useEffect(() => {
    let scene;
    try {
      scene = createFloorScene(canvasRef.current, { reducedMotion: reduced() });
    } catch {
      setError("This screen can't draw the floor (WebGL is off).");
      return;
    }
    sceneRef.current = scene;
    if (apiRef) apiRef.current = { home: () => scene.home() };
    // Place labels, then hide any that would overlap a more important one.
    scene.onFrame = (pos, mode) => {
      const placed = [];
      const rankOf = order.current;
      const ids = Object.keys(pos).sort(
        (a, b) => (rankOf[a] ?? 99) - (rankOf[b] ?? 99),
      );
      for (const id of ids) {
        const el = labels.current[id];
        const s = sizes.current[id];
        const p = pos[id];
        if (!el || !s) continue;
        const left = p.x - s.w / 2;
        const top = mode === "top" ? p.y - s.h / 2 : p.y - s.h - 6;
        const box = {
          l: left - 8,
          t: top - 4,
          r: left + s.w + 8,
          b: top + s.h + 4,
        };
        const clash = placed.some(
          (o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t,
        );
        const show = !p.behind && !clash && top > 8;
        el.style.transform = `translate(${left}px, ${top}px)`;
        el.style.opacity = show ? "" : 0;
        if (show) placed.push(box);
      }
    };
    return () => {
      scene.dispose();
      sceneRef.current = null;
      if (apiRef) apiRef.current = null;
    };
    // The scene lives as long as the map does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setZones(layout.zones);
    sceneRef.current?.setStatus(status.zones);
    sceneRef.current?.setView(view);
    sceneRef.current?.focus(held);
    // Rebuild only when the plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);
  useEffect(() => {
    sceneRef.current?.setStatus(status.zones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);
  useEffect(() => {
    sceneRef.current?.focus(held);
  }, [held]);

  const down = useRef(null);
  const onPointerDown = (e) => (down.current = { x: e.clientX, y: e.clientY });
  const onPointerUp = (e) => {
    const d = down.current;
    if (!onPick || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6)
      return;
    onPick(sceneRef.current?.pick(e.clientX, e.clientY) ?? null);
  };

  return (
    <div className={`ftv-stage ${className}`.trim()}>
      <canvas
        ref={canvasRef}
        className="ftv-canvas"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        aria-label={
          view === "top"
            ? "Overhead plan of the gym floor"
            : "3D model of the gym floor"
        }
        role="img"
      />
      <div className="ftv-labels">
        {status.zones.map((z) => (
          <Label
            key={z.id}
            zone={z}
            selected={z.id === held}
            innerRef={(el) => (labels.current[z.id] = el)}
          />
        ))}
      </div>
      {legend && (
        <ul className="ftv-legend" aria-label="Legend">
          <li className="is-class">Class now</li>
          <li className="is-soon">Class soon</li>
          <li className="is-open">Open gym</li>
          <li className="is-paused">Paused</li>
          <li className="is-amenity">Shared space</li>
        </ul>
      )}
      {children}
      {error && <p className="ftv-error">{error}</p>}
    </div>
  );
}
