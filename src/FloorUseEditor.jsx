import React, { useMemo, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { clock, dayKey } from "./club.js";
import {
  blockById,
  scheduleOf,
  sessionFromId,
  weekdayNames,
} from "./schedule.js";
import { planFor, stationLabel } from "./gym.js";
import { gymClockTime, gymSyncedAt } from "./gym-time.js";
import { BUILDING, layoutOf } from "./layout.js";
import { applyFloorUse, canMarkUse, segmentsFor, useFor } from "./flooruse.js";
import {
  Button,
  Card,
  CardHead,
  Eyebrow,
  SaveBar,
  Segmented,
  Tag,
} from "./ds/index.jsx";

const PAD = 4;
// "10:05" from a moment; the class times give the morning or afternoon.
const short = (ms) => gymClockTime(ms).replace(/\s?[AP]M$/, "");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// "Every day", "Weekdays" or "Mon, Wed, Fri" for a block's weekdays.
const days = (b) => {
  const w = [...(b?.weekdays ?? [])].sort();
  if (w.length === 7) return "Every day";
  if (w.join() === "1,2,3,4,5") return "Weekdays";
  return w.map((d) => weekdayNames[d].slice(0, 3)).join(", ") || "Not running";
};

// The zones a part of the class uses, from the draft.
const zonesOf = (use, part) =>
  part === "warmup"
    ? use.warmup
    : part === "close"
      ? use.close
      : (use.stations[part.slice(8)] ?? []);
const withZones = (use, part, list) =>
  part === "warmup"
    ? { ...use, warmup: list }
    : part === "close"
      ? { ...use, close: list }
      : { ...use, stations: { ...use.stations, [part.slice(8)]: list } };

function ClassUse({ state, setState, actor, block }) {
  const layout = layoutOf(state);
  const saved = useFor(state, block.index);
  const [use, setUse] = useState(() => structuredClone(saved));
  const [part, setPart] = useState("warmup");
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const can = canMarkUse(state, actor, block.index);
  const plan = planFor(state, block.index);
  const parts = [
    { key: "warmup", label: "Warm-up" },
    ...plan.stations.map((s) => ({
      key: `station:${s.station}`,
      label: stationLabel(s.station),
    })),
    { key: "close", label: "Close" },
  ];
  // When each part runs, from the plan's timing.
  const times = useMemo(() => {
    const start = new Date(Date.parse(`${block.id.slice(0, 10)}T12:00:00Z`));
    const segs = segmentsFor(
      { ...state, gym: { ...state.gym, runs: {} } },
      block,
      start,
      layout.zones,
    );
    const find = (label) => segs.find((s) => s.label === label);
    const span = (s) =>
      s ? `${short(s.from)}–${short(s.to)}` : "Not in the plan";
    return {
      warmup: span(find("Warm-up")),
      stations: span(find("Stations")),
      close: span(find("Close")),
    };
  }, [state, block, layout.zones]);
  const timeOf = (key) =>
    key === "warmup"
      ? times.warmup
      : key === "close"
        ? times.close
        : `${times.stations} · groups rotate`;
  const name = (id) => layout.zones.find((z) => z.id === id)?.name ?? id;
  const chosen = new Set(zonesOf(use, part));
  const elsewhere = new Set(
    parts.filter((p) => p.key !== part).flatMap((p) => zonesOf(use, p.key)),
  );
  const toggle = (id) => {
    if (!can) return;
    const list = chosen.has(id)
      ? [...chosen].filter((x) => x !== id)
      : [...chosen, id];
    setUse(withZones(use, part, list));
  };
  const save = () => {
    try {
      setState((s) =>
        applyFloorUse(s, { type: "save", index: block.index, use, actor }),
      );
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  const reset = () => {
    if (!confirmReset) return setConfirmReset(true);
    const next = applyFloorUse(state, {
      type: "reset",
      index: block.index,
      actor,
    });
    setState(next);
    setUse(structuredClone(useFor(next, block.index)));
    setConfirmReset(false);
  };

  return (
    <>
      <div className="lay-body">
        <Card className="lay-plan">
          <svg
            viewBox={`${-PAD} ${-PAD} ${BUILDING.w + PAD * 2} ${BUILDING.d + PAD * 2}`}
            role="group"
            aria-label={`Floor plan. Zones ${parts.find((p) => p.key === part).label} uses are highlighted.`}
          >
            <rect
              className="lay-building"
              x="0"
              y="0"
              width={BUILDING.w}
              height={BUILDING.d}
            />
            {layout.zones.map((z) => (
              <g
                key={z.id}
                className={`use-zone${chosen.has(z.id) ? " is-on" : ""}${elsewhere.has(z.id) ? " is-other" : ""}${can ? "" : " is-locked"}`}
              >
                <rect
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.d}
                  rx="1.5"
                  role={can ? "checkbox" : undefined}
                  aria-checked={can ? chosen.has(z.id) : undefined}
                  aria-label={z.name}
                  tabIndex={can ? 0 : undefined}
                  onClick={() => toggle(z.id)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggle(z.id);
                    }
                  }}
                />
                <text
                  x={z.x + z.w / 2}
                  y={z.y + z.d / 2}
                  className="lay-name"
                  transform={
                    z.d > z.w * 1.5 && z.w < 24
                      ? `rotate(-90 ${z.x + z.w / 2} ${z.y + z.d / 2})`
                      : undefined
                  }
                >
                  {z.name}
                </text>
              </g>
            ))}
          </svg>
        </Card>
        <Card className="lay-side">
          <CardHead
            title={block.name}
            note={`${days(blockById(state, block.index))} · ${clock(block.start)}–${clock(block.end)}${block.ages ? ` · ages ${block.ages}` : ""}`}
            aside={
              !can && (
                <Tag tone="outline" icon={Lock}>
                  Head coach or owner
                </Tag>
              )
            }
          />
          <ol className="use-parts">
            {parts.map((p) => {
              const list = zonesOf(use, p.key);
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    aria-pressed={p.key === part}
                    onClick={() => setPart(p.key)}
                  >
                    <span className="use-part-head">
                      <strong>{p.label}</strong>
                      <small>{timeOf(p.key)}</small>
                    </span>
                    <span className="use-part-zones">
                      {list.length
                        ? list.map(name).join(", ")
                        : "No zones held"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {can && (
            <div className="lay-reset">
              <Button variant="secondary" size="sm" onClick={reset}>
                {confirmReset ? "Tap again to reset" : "Back to the default"}
              </Button>
            </div>
          )}
          {saved.by && (
            <p className="ds-note">
              Last marked by {saved.by}, {gymSyncedAt(saved.at)}.
            </p>
          )}
          {error && (
            <p className="lay-error" role="alert">
              {error}
            </p>
          )}
        </Card>
      </div>
      <SaveBar
        show={can && !same(use, saved)}
        message={`${block.name} floor use changed`}
        onSave={save}
        onDiscard={() => {
          setUse(structuredClone(saved));
          setError("");
        }}
        saveLabel="Save floor use"
      />
    </>
  );
}

/*
 * Class floor use: for each class, which zones its warm-up, each station
 * and its close hold. The TV board blocks only those, only then. The
 * class's head coach, the gym manager and the owners edit; everyone else
 * sees it read-only.
 */
export default function FloorUseEditor({ state, setState, session, onClose }) {
  const actor = {
    role: "Coach",
    name: session?.name,
    staffId: session?.staffId,
    head: !!session?.head,
    owner: !!session?.owner,
  };
  // Every class in the weekly schedule, as a session today, so a class
  // can be marked on a day it doesn't run (or on a closed day).
  const today = dayKey(new Date());
  const classes = scheduleOf(state)
    .blocks.filter((b) => b.kind === "class")
    .map((b) => sessionFromId(state, `${today}:${b.id}`));
  const [index, setIndex] = useState(
    () =>
      (classes.find((b) => canMarkUse(state, actor, b.index)) ?? classes[0])
        .index,
  );
  const block = classes.find((b) => b.index === index);
  return (
    <main className="lay">
      <header className="lay-head">
        <div>
          <Eyebrow>Gym floor · TV board</Eyebrow>
          <h1 className="ds-h2">Class floor use</h1>
          <p className="ds-note">
            Pick a part of the class, then tap the zones it uses. The TVs mark
            only those zones, and only while that part runs; the rest of the
            floor stays open.
          </p>
        </div>
        <div className="lay-actions">
          <Button variant="secondary" icon={ArrowLeft} onClick={onClose}>
            Back to the board
          </Button>
        </div>
      </header>
      <div className="use-classes">
        <Segmented
          label="Class"
          options={classes.map((b) => ({ value: b.index, label: b.name }))}
          value={index}
          onChange={setIndex}
        />
      </div>
      <ClassUse
        key={index}
        state={state}
        setState={setState}
        actor={actor}
        block={block}
      />
    </main>
  );
}
