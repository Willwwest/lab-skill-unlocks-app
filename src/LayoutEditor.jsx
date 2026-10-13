import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Lock, Plus, RotateCw, Trash2 } from "lucide-react";
import { stations } from "./club.js";
import { gymSyncedAt } from "./gym-time.js";
import {
  BUILDING,
  NOTE_MAX,
  applyLayout,
  arts,
  clampZone,
  facing,
  layoutOf,
  newZoneId,
  turnZone,
} from "./layout.js";
import {
  Button,
  Card,
  CardHead,
  Eyebrow,
  Field,
  IconButton,
  SaveBar,
  Select,
  Tag,
  TextArea,
} from "./ds/index.jsx";

const PAD = 4;
// Models with a clear front get an arrow on the plan showing which way
// they face.
const directional = new Set([
  "wall",
  "court",
  "arcade",
  "golf",
  "desk",
  "room",
  "fitgames",
]);
// The arrow on a zone's front edge, pointing the way it faces. At 0 the
// front is the south edge; each quarter turn moves it clockwise.
function facingArrow(z) {
  const [dx, dy] = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[
    z.rotation ?? 0
  ];
  const cx = z.x + z.w / 2 + (dx * z.w) / 2;
  const cy = z.y + z.d / 2 + (dy * z.d) / 2;
  const tip = [cx - dx * 0.8, cy - dy * 0.8];
  const back = [cx - dx * 3.6, cy - dy * 3.6];
  const [px, py] = [-dy * 2.2, dx * 2.2];
  return [tip, [back[0] + px, back[1] + py], [back[0] - px, back[1] - py]]
    .map((p) => p.join(","))
    .join(" ");
}
const artOptions = Object.entries(arts).map(([value, label]) => ({
  value,
  label,
}));
const stationOptions = [
  { value: "", label: "None · shared space" },
  ...stations.map((s) => ({ value: s.id, label: s.name })),
];

// SVG user units from a pointer event.
function svgPoint(svg, e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

/*
 * The owners' floor plan editor. Drag a zone to move it, drag its
 * corner to resize, and set what it is and which class station it holds.
 * Everything waits in a draft until Save; the TVs pick up the saved plan.
 */
export default function LayoutEditor({ state, setState, session, onClose }) {
  const saved = layoutOf(state);
  const [zones, setZones] = useState(() => structuredClone(saved.zones));
  const [selected, setSelected] = useState(zones[0]?.id ?? null);
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const dirty = useMemo(
    () => JSON.stringify(zones) !== JSON.stringify(saved.zones),
    [zones, saved],
  );
  const owner = session?.kind === "staff" && !!session.owner;
  const actor = {
    role: "Coach",
    name: session?.name,
    staffId: session?.staffId,
    head: !!session?.head,
    owner,
  };
  const zone = zones.find((z) => z.id === selected) ?? null;
  const update = (id, patch) =>
    setZones((list) =>
      list.map((z) => (z.id === id ? clampZone({ ...z, ...patch }) : z)),
    );

  if (!owner)
    return (
      <main className="lay lay-locked">
        <Card>
          <CardHead
            title="Floor plan"
            note="Only the owners change the floor plan the TVs show."
            aside={
              <Tag tone="outline" icon={Lock}>
                Owners
              </Tag>
            }
          />
          <p>Sign in as Charlie or Ally on this screen, then open it again.</p>
          <Button variant="secondary" icon={ArrowLeft} onClick={onClose}>
            Back to the board
          </Button>
        </Card>
      </main>
    );

  const start = (e, z, mode) => {
    e.stopPropagation();
    setSelected(z.id);
    const p = svgPoint(svgRef.current, e);
    drag.current = { id: z.id, mode, p, z: { ...z } };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = svgPoint(svgRef.current, e);
    const dx = p.x - d.p.x;
    const dy = p.y - d.p.y;
    update(
      d.id,
      d.mode === "move"
        ? { x: d.z.x + dx, y: d.z.y + dy }
        : { w: d.z.w + dx, d: d.z.d + dy },
    );
  };
  const end = () => (drag.current = null);
  const turn = () =>
    setZones((list) => list.map((z) => (z.id === selected ? turnZone(z) : z)));
  const nudge = (e) => {
    if (!zone) return;
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      return turn();
    }
    const step = e.shiftKey ? 5 : 1;
    const by = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key];
    if (!by) return;
    e.preventDefault();
    update(zone.id, { x: zone.x + by[0], y: zone.y + by[1] });
  };
  const add = () => {
    const id = newZoneId(zones, "New zone");
    const z = clampZone({
      id,
      name: "New zone",
      art: "field",
      station: null,
      x: BUILDING.w / 2 - 10,
      y: BUILDING.d / 2 - 8,
      w: 20,
      d: 16,
      photo: null,
      rotation: 0,
    });
    setZones([...zones, z]);
    setSelected(id);
  };
  const duplicate = () => {
    const id = newZoneId(zones, zone.name);
    setZones([
      ...zones,
      clampZone({
        ...zone,
        id,
        name: `${zone.name} copy`.slice(0, 40),
        x: zone.x + 6,
        y: zone.y + 6,
      }),
    ]);
    setSelected(id);
  };
  const remove = () => {
    setZones(zones.filter((z) => z.id !== zone.id));
    setSelected(null);
  };
  const save = () => {
    try {
      setState((s) => applyLayout(s, { type: "save", zones, actor }));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  const reset = () => {
    if (!confirmReset) return setConfirmReset(true);
    const next = applyLayout(state, { type: "reset", actor });
    setState(next);
    setZones(structuredClone(next.layout.zones));
    setConfirmReset(false);
  };

  return (
    <main className="lay">
      <header className="lay-head">
        <div>
          <Eyebrow>Gym floor · TV board</Eyebrow>
          <h1 className="ds-h2">Floor plan</h1>
          <p className="ds-note">
            Drag a zone to move it and its corner to resize. Arrow keys nudge
            the selected zone (Shift for 5 ft) and R turns it a quarter; the
            arrow shows which way its model faces.
            {saved.by &&
              ` Last saved by ${saved.by}, ${gymSyncedAt(saved.at)}.`}
          </p>
        </div>
        <div className="lay-actions">
          <Button variant="secondary" icon={ArrowLeft} onClick={onClose}>
            Back to the board
          </Button>
          <Button variant="secondary" icon={Plus} onClick={add}>
            Add zone
          </Button>
        </div>
      </header>
      <div className="lay-body">
        <Card className="lay-plan">
          <svg
            ref={svgRef}
            viewBox={`${-PAD} ${-PAD} ${BUILDING.w + PAD * 2} ${BUILDING.d + PAD * 2 + 6}`}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerDown={() => setSelected(null)}
            onKeyDown={nudge}
            tabIndex={0}
            role="application"
            aria-label="Floor plan. Select a zone, then use the arrow keys to move it."
          >
            <rect
              className="lay-building"
              x="0"
              y="0"
              width={BUILDING.w}
              height={BUILDING.d}
            />
            {Array.from({ length: BUILDING.w / 10 - 1 }, (_, i) => (
              <line
                key={`v${i}`}
                className="lay-grid"
                x1={(i + 1) * 10}
                y1="0"
                x2={(i + 1) * 10}
                y2={BUILDING.d}
              />
            ))}
            {Array.from({ length: BUILDING.d / 10 - 1 }, (_, i) => (
              <line
                key={`h${i}`}
                className="lay-grid"
                x1="0"
                y1={(i + 1) * 10}
                x2={BUILDING.w}
                y2={(i + 1) * 10}
              />
            ))}
            <rect
              className="lay-doorway"
              x={BUILDING.door - 5}
              y={BUILDING.d - 0.8}
              width="10"
              height="1.6"
            />
            <text className="lay-door" x={BUILDING.door} y={BUILDING.d + 6}>
              Front door ↑
            </text>
            {zones.map((z) => (
              <g
                key={z.id}
                className={`lay-zone${z.id === selected ? " is-on" : ""}${z.station ? "" : " is-shared"}`}
                style={
                  z.station
                    ? { "--zone": `var(--ds-station-${z.station})` }
                    : undefined
                }
              >
                <rect
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.d}
                  rx="1.5"
                  onPointerDown={(e) => start(e, z, "move")}
                />
                <text
                  x={z.x + z.w / 2}
                  y={z.y + z.d / 2}
                  className="lay-name"
                  // Tall, thin zones (the track, the lounge) read sideways.
                  transform={
                    z.d > z.w * 1.5 && z.w < 24
                      ? `rotate(-90 ${z.x + z.w / 2} ${z.y + z.d / 2})`
                      : undefined
                  }
                >
                  {z.name}
                </text>
                {z.code && (
                  <text
                    x={z.x + z.w / 2}
                    y={z.y + z.d / 2 + 4.5}
                    className="lay-sub"
                  >
                    {z.code}
                  </text>
                )}
                {(directional.has(z.art) || z.id === selected) && (
                  <polygon className="lay-facing" points={facingArrow(z)} />
                )}
                {z.id === selected && (
                  <circle
                    className="lay-handle"
                    cx={z.x + z.w}
                    cy={z.y + z.d}
                    r="2.4"
                    onPointerDown={(e) => start(e, z, "size")}
                  />
                )}
              </g>
            ))}
          </svg>
        </Card>
        <Card className="lay-side" tone={zone ? "plain" : "muted"}>
          {zone ? (
            <>
              <CardHead
                title={zone.name || "Zone"}
                note={`${zone.w} × ${zone.d} ft at ${zone.x}, ${zone.y} · faces ${facing[zone.rotation ?? 0]}`}
                aside={
                  <div className="lay-icons">
                    <IconButton
                      icon={RotateCw}
                      label="Rotate a quarter turn (R)"
                      onClick={turn}
                    />
                    <IconButton
                      icon={Copy}
                      label="Duplicate"
                      onClick={duplicate}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Remove"
                      tone="danger"
                      onClick={remove}
                    />
                  </div>
                }
              />
              <Field label="Name">
                <input
                  className="lay-input"
                  value={zone.name}
                  maxLength={40}
                  onChange={(e) => update(zone.id, { name: e.target.value })}
                />
              </Field>
              <Field
                label="Short code"
                hint="From the rotation map, like L1–L3 or WW."
              >
                <input
                  className="lay-input"
                  value={zone.code ?? ""}
                  maxLength={12}
                  onChange={(e) =>
                    update(zone.id, { code: e.target.value || undefined })
                  }
                />
              </Field>
              <Field label="What's there" hint="Sets the 3D model on the TV.">
                <Select
                  value={zone.art}
                  onChange={(v) => update(zone.id, { art: v })}
                  options={artOptions}
                />
              </Field>
              <Field
                label="Class station"
                hint="A class planned on this station lights the zone gold; otherwise it shows open gym."
              >
                <Select
                  value={zone.station ?? ""}
                  onChange={(v) => update(zone.id, { station: v || null })}
                  options={stationOptions}
                />
              </Field>
              <Field
                label="Note for the TV"
                hint="Shown with the zone on the TV's spotlight card."
              >
                <TextArea
                  value={zone.note ?? ""}
                  maxLength={NOTE_MAX}
                  onChange={(v) => update(zone.id, { note: v || undefined })}
                />
              </Field>
            </>
          ) : (
            <CardHead
              title="Pick a zone"
              note="Select a zone on the plan to edit it, or add a new one."
            />
          )}
          <div className="lay-reset">
            <Button variant="secondary" size="sm" onClick={reset}>
              {confirmReset
                ? "Tap again to reset"
                : "Reset to the original plan"}
            </Button>
          </div>
          {error && (
            <p className="lay-error" role="alert">
              {error}
            </p>
          )}
        </Card>
      </div>
      <SaveBar
        show={dirty}
        message="Floor plan changed"
        onSave={save}
        onDiscard={() => {
          setZones(structuredClone(saved.zones));
          setError("");
        }}
        saveLabel="Save floor plan"
      />
    </main>
  );
}
