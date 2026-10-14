// The class schedule: programs (kinds of work, some not running yet), a
// weekly template of blocks by weekday, and dated exceptions such as
// holidays. `sessionsOn` turns it into one day's sessions, the way the
// database's ensure_sessions does: the template for that weekday, then
// the exceptions. A block id is a string; the original five keep "0"–"4"
// so stored session ids ("2026-10-12:1") keep resolving. Blocks are never
// deleted, only ended with `effectiveUntil`, so past days rebuild.
import { gymDayKey, toMinutes, weekdayOf } from "./gym-time.js";

export const SCHEDULE_VERSION = 1;
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]; // ISO: 1 Monday … 7 Sunday
export const weekdayNames = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};
export const programStatuses = {
  active: "Running",
  coming: "Coming soon",
  retired: "Retired",
};

// What a coach's time is split across. Programs point at one of these.
// Managers add buckets and mark them running or coming soon.
const seedBuckets = [
  { id: "class", label: "Ninja classes", short: "Classes", status: "active" },
  { id: "open", label: "Open gym", short: "Open gym", status: "active" },
  { id: "floater", label: "Floater", short: "Floater", status: "active" },
  { id: "golf", label: "Golf simulator", short: "Golf", status: "coming" },
];
const seedPrograms = [
  {
    id: "ninja-foundations",
    name: "Ninja foundations",
    kind: "class",
    bucket: "class",
    status: "active",
  },
  {
    id: "ninja-progressions",
    name: "Ninja progressions",
    kind: "class",
    bucket: "class",
    status: "active",
  },
  {
    id: "open-gym",
    name: "Open gym",
    kind: "open",
    bucket: "open",
    status: "active",
  },
  {
    id: "homeschool",
    name: "Homeschool ninja",
    kind: "class",
    bucket: "class",
    status: "active",
  },
  {
    id: "golf",
    name: "Golf simulator lessons",
    kind: "class",
    bucket: "golf",
    status: "coming",
  },
];
// Until the gym gives its real weekday schedule, the demo runs every block
// every day, the way the app always has. Managers change weekdays in Plans.
const seedBlocks = [
  {
    id: "0",
    legacyIndex: 0,
    programId: "ninja-foundations",
    name: "Ninja foundations",
    kind: "class",
    start: "15:30",
    end: "16:30",
    ages: "6–8",
    lead: "Coach Jordan",
    weekdays: WEEKDAYS,
  },
  {
    id: "1",
    legacyIndex: 1,
    programId: "ninja-progressions",
    name: "Ninja progressions",
    kind: "class",
    start: "16:45",
    end: "17:45",
    ages: "9–12",
    lead: "Coach Sam",
    weekdays: WEEKDAYS,
  },
  {
    id: "2",
    legacyIndex: 2,
    programId: "open-gym",
    name: "Open gym rotation",
    kind: "open",
    start: "12:00",
    end: "15:15",
    weekdays: WEEKDAYS,
  },
  {
    id: "3",
    legacyIndex: 3,
    programId: "open-gym",
    name: "Evening open gym",
    kind: "open",
    start: "18:00",
    end: "20:00",
    weekdays: WEEKDAYS,
  },
  {
    id: "4",
    legacyIndex: 4,
    programId: "homeschool",
    name: "Homeschool ninja",
    kind: "class",
    start: "10:00",
    end: "11:00",
    ages: "5–12",
    lead: "Coach Jordan",
    weekdays: WEEKDAYS,
  },
];

export const seedSchedule = () => ({
  version: SCHEDULE_VERSION,
  buckets: structuredClone(seedBuckets),
  programs: structuredClone(seedPrograms),
  blocks: structuredClone(seedBlocks),
  exceptions: [],
});

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
export function validSchedule(s) {
  return (
    !!s &&
    s.version === SCHEDULE_VERSION &&
    Array.isArray(s.buckets) &&
    Array.isArray(s.programs) &&
    Array.isArray(s.blocks) &&
    Array.isArray(s.exceptions) &&
    s.blocks.every(
      (b) =>
        typeof b.id === "string" &&
        timeRe.test(b.start) &&
        timeRe.test(b.end) &&
        Array.isArray(b.weekdays),
    )
  );
}
const seeded = seedSchedule();
export const scheduleOf = (state) =>
  validSchedule(state?.schedule) ? state.schedule : seeded;

export const blockById = (state, id) =>
  scheduleOf(state).blocks.find((b) => b.id === String(id)) ?? null;
export const programOf = (state, block) =>
  scheduleOf(state).programs.find((p) => p.id === block?.programId) ?? null;
// The bucket a block's minutes count toward in a coach's time split.
export const bucketOf = (state, block) =>
  programOf(state, block)?.bucket ??
  (block?.kind === "open" ? "open" : "class");

const inEffect = (b, day) =>
  (!b.effectiveFrom || day >= b.effectiveFrom) &&
  (!b.effectiveUntil || day <= b.effectiveUntil);
export const exceptionsOn = (state, day) =>
  scheduleOf(state).exceptions.filter((e) => e.day === day);
export const isClosed = (state, day) =>
  exceptionsOn(state, day).some((e) => !e.blockId && e.kind === "closed");

// The blocks that run on a gym day, in template order, with retimes
// applied. Cancelled blocks and closed days drop out.
export function blocksOn(state, day) {
  if (isClosed(state, day)) return [];
  const wd = weekdayOf(day);
  const ex = exceptionsOn(state, day);
  return scheduleOf(state)
    .blocks.filter((b) => b.weekdays.includes(wd) && inEffect(b, day))
    .filter(
      (b) => !ex.some((e) => e.blockId === b.id && e.kind === "cancelled"),
    )
    .map((b) => {
      const re = ex.find((e) => e.blockId === b.id && e.kind === "retimed");
      return re ? { ...b, start: re.start, end: re.end, retimed: true } : b;
    });
}

const asSession = (b, day) => ({
  name: b.name,
  kind: b.kind,
  start: b.start,
  end: b.end,
  ...(b.ages ? { ages: b.ages } : {}),
  ...(b.lead ? { lead: b.lead } : {}),
  programId: b.programId,
  blockId: b.id,
  // `index` is the block id. It was a list position before blocks had ids.
  index: b.id,
  id: `${day}:${b.id}`,
  ...(b.retimed ? { retimed: true } : {}),
});
export const sessionsOn = (state, at = new Date()) => {
  const day = gymDayKey(at);
  return blocksOn(state, day).map((b) => asSession(b, day));
};
// Rebuild a session from a stored id, even if its block no longer runs
// that weekday.
export function sessionFromId(state, id) {
  const day = String(id).slice(0, 10);
  const block = blockById(state, String(id).slice(11));
  return block ? asSession(block, day) : null;
}

// Opening hours for a day: first block start to last block end.
export function hoursOn(state, day) {
  const list = blocksOn(state, day);
  if (!list.length) return null;
  return {
    start: Math.min(...list.map((b) => toMinutes(b.start))),
    end: Math.max(...list.map((b) => toMinutes(b.end))),
  };
}

// Buckets a coach can split time across: the running ones. Coming-soon
// buckets can be marked "want to add".
export const portfolioBuckets = (state) =>
  scheduleOf(state).buckets.filter((b) => b.status === "active");
export const comingBuckets = (state) =>
  scheduleOf(state).buckets.filter((b) => b.status === "coming");

/* ---------- Actions ---------- */

// Managers run the schedule day to day (exceptions, bucket status);
// the owner shapes the template and the programs.
export function applySchedule(state, action, now = new Date()) {
  const s = structuredClone(scheduleOf(state));
  const actor = action.actor ?? {};
  if (actor.role !== "Coach" || !actor.staffId)
    throw Error("Sign in as a coach first.");
  const manager = () => {
    if (!actor.head) throw Error("Only a gym manager can change this.");
  };
  const owner = () => {
    if (!actor.owner) throw Error("Only an owner can change this.");
  };
  const time = (t) => {
    if (!timeRe.test(t ?? "")) throw Error("Use a time like 15:30.");
  };
  switch (action.type) {
    case "bucket": {
      manager();
      const label = String(action.label ?? "").trim();
      if (!programStatuses[action.status]) throw Error("Choose a status.");
      const b = s.buckets.find((x) => x.id === action.id);
      if (b) {
        if (
          ["class", "open", "floater"].includes(b.id) &&
          action.status !== "active"
        )
          throw Error(`${b.label} is part of every coach's day.`);
        if (label) b.label = label;
        b.status = action.status;
      } else {
        if (!label) throw Error("Name the program.");
        const id = label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        if (!id || s.buckets.some((x) => x.id === id))
          throw Error("That program is already on the list.");
        s.buckets.push({ id, label, short: label, status: action.status });
      }
      break;
    }
    case "blockDays": {
      owner();
      const b = s.blocks.find((x) => x.id === String(action.blockId));
      if (!b) throw Error("Choose a block.");
      const days = [...new Set(action.weekdays ?? [])].filter((d) =>
        WEEKDAYS.includes(d),
      );
      b.weekdays = days.sort();
      break;
    }
    case "blockTimes": {
      owner();
      const b = s.blocks.find((x) => x.id === String(action.blockId));
      if (!b) throw Error("Choose a block.");
      time(action.start);
      time(action.end);
      if (action.start >= action.end) throw Error("Start before the end.");
      b.start = action.start;
      b.end = action.end;
      break;
    }
    case "exception": {
      manager();
      if (!dayRe.test(action.day ?? "")) throw Error("Choose a day.");
      if (!["closed", "cancelled", "retimed"].includes(action.kind))
        throw Error("Choose closed, cancelled or new times.");
      const blockId =
        action.kind === "closed" || action.blockId == null
          ? null
          : String(action.blockId);
      if (action.kind !== "closed" && !s.blocks.some((b) => b.id === blockId))
        throw Error("Choose a block.");
      if (action.kind === "retimed") {
        time(action.start);
        time(action.end);
        if (action.start >= action.end) throw Error("Start before the end.");
      }
      s.exceptions = s.exceptions.filter(
        (e) => !(e.day === action.day && (e.blockId ?? null) === blockId),
      );
      s.exceptions.push({
        id: crypto.randomUUID(),
        day: action.day,
        blockId,
        kind: action.kind,
        ...(action.kind === "retimed"
          ? { start: action.start, end: action.end }
          : {}),
        note: String(action.note ?? "")
          .trim()
          .slice(0, 140),
        by: actor.name,
        at: new Date(now).toISOString(),
      });
      break;
    }
    case "clearException": {
      manager();
      s.exceptions = s.exceptions.filter((e) => e.id !== action.id);
      break;
    }
    default:
      throw Error("Unknown schedule action.");
  }
  return { ...state, schedule: s };
}
