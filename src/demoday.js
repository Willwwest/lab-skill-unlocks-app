// A scripted gym day for showing the TV screens: run the clock from before
// opening to after close and watch zones change. Built in memory from the
// real records and the real class-runner actions; nothing is saved.
//
//   9:45   closed, every zone dark
//   10:00  Homeschool ninja runs: its stations go gold
//   12:00  open gym: everything mint; crowns and shoutouts start to land
//   14:00  the court is paused for a net repair (red) until 14:45
//   15:00  Ninja foundations' zones get a gold edge (class at 3:30)
//   15:30  Ninja foundations runs, then progressions at 4:45
//   18:00  evening open gym, 20:00 closed
import { dayKey, sessions } from "./club.js";
import { emptyFloor, rosterFor } from "./floor.js";
import { applyGym, leadOf, withoutHistory } from "./gym.js";
import { gymLocalIso, toMinutes } from "./gym-time.js";
import { staff } from "./roster.js";
import { blocksOn, hoursOn } from "./schedule.js";

// The seed's day: before opening to after close.
export const DEMO_START = toMinutes("09:45");
export const DEMO_END = toMinutes("20:30");

// The demo runs on the first day from `from` that has classes (a Sunday
// demo would be empty), from 15 minutes before opening to 30 after close.
export function demoDayFrom(state, from = new Date()) {
  const base = Date.parse(`${dayKey(from)}T12:00:00Z`);
  for (let i = 0; i < 14; i++) {
    const day = new Date(base + i * 86400000).toISOString().slice(0, 10);
    if (blocksOn(state, day).some((b) => b.kind === "class")) return day;
  }
  return dayKey(from);
}
export function demoRange(state, day) {
  const h = hoursOn(state, day);
  return h
    ? { start: h.start - 15, end: h.end + 30 }
    : { start: DEMO_START, end: DEMO_END };
}

const hhmm = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
// The moment `minute` (minutes since midnight, gym clock) on `day`.
export const demoMoment = (day, minute) =>
  new Date(
    Date.parse(gymLocalIso(day, hhmm(minute))) +
      Math.round((minute % 1) * 60000),
  );

// Families who opted in, with the nicknames they chose.
const profiles = {
  theo: { optIn: true, alias: "Turbo Theo", group: "6–8 / Foundations" },
  ava: { optIn: true, alias: "Ava Rocket", group: "6–8 / Foundations" },
  eli: { optIn: true, alias: "Eli the Eagle", group: "6–8 / Developing" },
  maya: { optIn: true, alias: "Maya the Mighty", group: "9–12 / Foundations" },
  zoe: { optIn: true, alias: "Zoe Zoom", group: "9–12 / Developing" },
  mateo: { optIn: true, alias: "Mateo Moves", group: "9–12 / Developing" },
};

// What happens on the floor, by gym time.
const script = [
  [
    "10:40",
    "ava",
    "praise",
    { category: "Brave first try", coach: "Coach Jordan" },
  ],
  ["12:20", "theo", "complete", { station: "court" }],
  ["12:45", "maya", "complete", { station: "wall" }],
  ["13:05", "zoe", "complete", { station: "grip" }],
  [
    "13:30",
    "maya",
    "praise",
    { category: "Kept trying", coach: "Coach Priya" },
  ],
  ["13:50", "mateo", "complete", { station: "course" }],
  ["14:20", "eli", "complete", { station: "movement" }],
  [
    "16:10",
    "eli",
    "praise",
    { category: "Helped a teammate", coach: "Coach Jordan" },
  ],
  ["17:20", "mateo", "praise", { category: "Kept trying", coach: "Coach Sam" }],
  ["18:30", "zoe", "complete", { station: "wall" }],
];
const PAUSE = {
  station: "court",
  from: toMinutes("14:00"),
  to: toMinutes("14:45"),
  reason: "Hoop net repair",
};

const manager = staff.find((s) => s.head && !s.owner) ?? staff[0];
const actorFor = (state, block, at) => {
  const s = staff.find((x) => x.id === leadOf(state, block.index, at));
  // The lead runs the class; the manager's override keeps the demo moving
  // if the crew plan changes.
  return {
    role: "Coach",
    name: (s ?? manager).name,
    staffId: (s ?? manager).id,
    head: true,
  };
};

// The whole state as it stands at minute `minute` of the demo day.
export function demoState(base, day, minute) {
  const at = (m) => demoMoment(day, m);
  const blocks = sessions(at(minute), base);
  const open = blocks.find((b) => b.kind === "open") ?? blocks[0];
  const events = script
    .filter(([t]) => toMinutes(t) <= minute)
    .map(([t, childId, kind, extra], i) => ({
      id: `demo-${i}`,
      childId,
      kind,
      status: "approved",
      at: at(toMinutes(t)).toISOString(),
      session: open.id,
      ...extra,
    }));
  let s = {
    ...base,
    club: { events, claims: [], profiles },
    floor: {
      ...emptyFloor(),
      outages:
        minute >= PAUSE.from && minute < PAUSE.to
          ? {
              [PAUSE.station]: {
                reason: PAUSE.reason,
                by: manager.name,
                at: at(PAUSE.from).toISOString(),
              },
            }
          : {},
    },
    gym: { ...withoutHistory(base.gym), checkins: [], runs: {} },
  };
  // Each class that has started: attendance, groups, the rotation, the end.
  for (const b of blocks.filter((x) => x.kind === "class")) {
    const start = toMinutes(b.start);
    const end = toMinutes(b.end);
    if (minute < start) continue;
    const actor = actorFor(s, b, at(start));
    const kids = rosterFor(b.index)
      .slice(0, 16)
      .map((p) => p.id);
    s = applyGym(
      s,
      { type: "checkIn", session: b.id, childIds: kids, actor },
      at(start),
    );
    s = applyGym(
      s,
      { type: "attendanceDone", session: b.id, actor },
      at(start + 1),
    );
    if (minute >= start + 3)
      s = applyGym(
        s,
        { type: "startClass", session: b.id, actor },
        at(start + 3),
      );
    if (minute >= end)
      s = applyGym(s, { type: "endClass", session: b.id, actor }, at(end));
  }
  return s;
}

// One line on what the screen is showing right now, for the demo bar.
export function demoCaption(status) {
  const paused = status.zones.find((z) => z.status === "paused");
  const live = status.liveClasses[0];
  const soon = status.zones.find((z) => z.status === "open" && z.soon)?.soon;
  if (status.hours.closedToday)
    return "Closed today. Nothing is scheduled, so every zone is dark.";
  if (!status.hours.open)
    return "Closed. Before opening and after close every zone is dark.";
  if (paused)
    return `${paused.name} is paused (${paused.reason}), so it shows red and leaves the points strip until a coach reopens it.`;
  if (live && soon)
    return `${live.name} holds the gold zones. ${soon.name} starts soon, so the zones it will use get a gold edge.`;
  if (live)
    return `${live.name} is running. Its zones are gold; everything else stays mint for open gym.`;
  if (soon)
    return `${soon.name} starts soon. The zones it will use get a gold edge 30 minutes ahead.`;
  if (status.live.some((b) => b.kind === "open"))
    return "Open gym. Every station is mint and free to use.";
  return "Between blocks. The floor is open with nothing scheduled.";
}
