// Which parts of the gym a class actually uses, and when. A class plan
// lists stations (grip, wall, ...); this says which zones on the floor plan
// each station takes, plus the zones the warm-up and the close take. The
// TV board blocks only those zones, and only during that part of the class,
// so a class on L1–L3 doesn't close the whole rig.
//
// Stored per class (by its schedule index) under state.floorUse:
//   { warmup: [zoneId], close: [zoneId], stations: { grip: [zoneId], ... },
//     by, at }
// The class's head coach, the gym manager and the owners set it.
import { stations } from "./club.js";
import { blockById } from "./schedule.js";
import {
  CLOSE_MINUTES,
  crewFor,
  fitRounds,
  planFor,
  rotation,
  runOf,
} from "./gym.js";
import { gymLocalIso, toMinutes } from "./gym-time.js";

// A starting point that matches the coaches' rotation map: one section of
// the rig per station, the vault blocks for movement, laps on the track to
// warm up. Owners and head coaches change it per class.
export const defaultUse = () => ({
  warmup: ["track"],
  close: [],
  stations: {
    grip: ["rig-grip"],
    course: ["rig-course"],
    wall: ["red-walls"],
    movement: ["vault"],
    court: ["court"],
  },
});

const ids = (list) =>
  Array.isArray(list) &&
  list.length <= 40 &&
  list.every((x) => typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x));

export function validUse(u) {
  return (
    !!u &&
    ids(u.warmup) &&
    ids(u.close) &&
    !!u.stations &&
    typeof u.stations === "object" &&
    Object.entries(u.stations).every(
      ([k, v]) => stations.some((s) => s.id === k) && ids(v),
    )
  );
}

// The saved floor use for a class, or the default.
export function useFor(state, index) {
  index = String(index);
  const saved = state?.floorUse?.[index];
  return validUse(saved) ? saved : defaultUse();
}

// Who can mark a class's floor use: owners, the gym manager, or the
// class's own head coach.
export function canMarkUse(state, actor, index) {
  index = String(index);
  if (actor?.role !== "Coach") return false;
  if (actor.owner || actor.head) return true;
  return crewFor(state, index).some(
    (c) => c.staffId === actor.staffId && c.role === "head",
  );
}

export function applyFloorUse(state, action, now = new Date()) {
  const { actor = {} } = action;
  // Block ids are strings; older callers pass the list position.
  const index = String(action.index);
  // Any class in the weekly schedule, even one that doesn't run today.
  const block = blockById(state, index);
  if (!block || block.kind !== "class") throw Error("Choose a class.");
  if (!canMarkUse(state, actor, index))
    throw Error(
      "The class's head coach, the gym manager or an owner marks this.",
    );
  const all = { ...(state.floorUse ?? {}) };
  if (action.type === "reset") delete all[index];
  else if (action.type === "save") {
    const u = action.use ?? {};
    const clean = (list) => [...new Set(list ?? [])];
    const next = {
      warmup: clean(u.warmup),
      close: clean(u.close),
      stations: Object.fromEntries(
        Object.entries(u.stations ?? {}).map(([k, v]) => [k, clean(v)]),
      ),
      by: actor.name,
      at: new Date(now).toISOString(),
    };
    if (!validUse(next)) throw Error("Pick zones from the floor plan.");
    all[index] = next;
  } else throw Error("Unknown floor use action.");
  return { ...state, floorUse: all };
}

/* ---------- The class as segments of time ---------- */

const MINUTE = 60000;
const at = (day, hhmm) => Date.parse(gymLocalIso(day, hhmm));

/*
 * The parts of a class from now (or from its start) to its end, each with
 * the zones it holds: [{ from, to, label, zones: Set }] in ms. A running
 * rotation is followed exactly: the groups' stations each round, the time
 * left, pauses. Before the class starts, the plan's timing stands in, with
 * every planned station busy during the rotation.
 */
export function segmentsFor(state, block, now, zones) {
  const use = useFor(state, block.index);
  const known = new Set(zones.map((z) => z.id));
  const pick = (list) => new Set((list ?? []).filter((id) => known.has(id)));
  // A station with no zones marked falls back to every zone it covers.
  const ofStation = (st) =>
    use.stations[st]
      ? pick(use.stations[st])
      : new Set(zones.filter((z) => z.station === st).map((z) => z.id));
  const union = (list) => new Set(list.flatMap((st) => [...ofStation(st)]));
  const startMs = at(block.id.slice(0, 10), block.start);
  const endMs = at(block.id.slice(0, 10), block.end);
  const run = runOf(state, block.id);
  const plan = planFor(state, block.index);
  const segs = [];
  const push = (from, to, label, set) => {
    if (to > from) segs.push({ from, to, label, zones: set });
  };
  const r = rotation(run, now);
  if (r) {
    const n = run.stations.length;
    const groups = run.groups?.length ?? n;
    const busy = (i) =>
      union(
        Array.from({ length: groups }, (_, g) => run.stations[(g + i) % n]),
      );
    const span = run.minutes * MINUTE;
    let t = new Date(now).getTime();
    if (r.done) {
      push(t, endMs, "Close", pick(use.close));
      return segs;
    }
    let i = r.idx;
    if (r.warmup) {
      push(t, t + r.left, "Warm-up", pick(use.warmup));
      t += r.left;
    } else {
      push(t, t + r.left, `Round ${i + 1} of ${r.total}`, busy(i));
      t += r.left;
      i += 1;
    }
    for (; i < r.total; i++, t += span)
      push(t, t + span, `Round ${i + 1} of ${r.total}`, busy(i));
    push(t, Math.max(t, endMs), "Close", pick(use.close));
    return segs;
  }
  // Not started: the plan's (or the formed groups') timing from the start.
  const list = run?.stations?.length
    ? run.stations
    : plan.stations.map((s) => s.station);
  const warm = (run?.warmup ?? plan.warmup ?? 0) * MINUTE;
  const minutes = run?.minutes ?? plan.minutes;
  const length = toMinutes(block.end) - toMinutes(block.start);
  const rounds =
    run?.rounds ??
    fitRounds(length, run?.warmup ?? plan.warmup ?? 0, list.length, minutes);
  const rotating = list.length * rounds * minutes * MINUTE;
  push(startMs, startMs + warm, "Warm-up", pick(use.warmup));
  // A plan that overruns the block still gets its close, CLOSE_MINUTES long.
  const closeFrom = Math.min(
    startMs + warm + rotating,
    endMs - CLOSE_MINUTES * MINUTE,
  );
  push(startMs + warm, closeFrom, "Stations", union(list));
  push(closeFrom, endMs, "Close", pick(use.close));
  return segs;
}
