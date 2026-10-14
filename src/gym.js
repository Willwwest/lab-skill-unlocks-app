// The coach floor: membership data from Spark, each kid's level, coach
// check-ins into open gym and classes, who works which block, the week's
// class plans, and a running class (attendance, groups, rotations, bonus
// picks). Points still land as club events and skill awards, so the kid
// and parent views keep working from the same records.
import { apply, catalog, people } from "./domain.js";
import {
  applyClub,
  BONUS_PICKS,
  dayKey,
  seasonKey,
  sessions,
  stations,
} from "./club.js";
import { sessionFromId } from "./schedule.js";
import { arrival, readySkills, stationCategory } from "./floor.js";
import { coaches, families, kidInfo, staff } from "./roster.js";
import { seedHistory } from "./history.js";
import { gymLocalIso, toMinutes } from "./gym-time.js";
import { publishedCrew } from "./shifts.js";

export const levels = [
  { id: "beginner", label: "Beginner", short: "B" },
  { id: "intermediate", label: "Intermediate", short: "I" },
  { id: "advanced", label: "Advanced", short: "A" },
];
const levelRank = (id) =>
  Math.max(
    0,
    levels.findIndex((l) => l.id === id),
  );

// Lab Coins for kids under 10, Lab XP from 10 up. Same points, two names.
export const currency = (child) =>
  child?.age >= 10
    ? { one: "XP", many: "XP" }
    : { one: "Lab Coin", many: "Lab Coins" };
export const pointsLabel = (child, n) => {
  const c = currency(child);
  return `${n} ${n === 1 ? c.one : c.many}`;
};

// Placeholder age rules until the gym confirms them: a 5-year-old only
// groups with 6-year-olds, 7 to 12 within two years, teens within three.
export const maxAgeSpread = (youngest) =>
  youngest <= 6 ? 1 : youngest <= 12 ? 2 : 3;

/* ---------- Seed and shape ---------- */

// Days since joining for the demo roster. Everyone else joined months ago.
const demoJoined = {
  isla: 0,
  kai: 3,
  piper: 5,
  rhys: 12,
  hana: 20,
  gabe: 26,
  eli: 45,
  june: 50,
};
const demoPastDue = new Set(["haddad", "ortiz"]);
// About a third of the roster has no level yet, as on day one.
const demoUnrated = new Set([
  "kai",
  "piper",
  "rhys",
  "isla",
  "hana",
  "gabe",
  "june",
  "owen",
  "aria",
  "ben",
  "noah",
  "omar",
]);
const demoLevel = (child, i) =>
  child.age <= 6
    ? "beginner"
    : ["beginner", "intermediate", "advanced", "intermediate"][i % 4];

const isoDay = (at) => dayKey(at);
const daysAgo = (n, now) =>
  isoDay(new Date(new Date(now).getTime() - n * 86400000));

// `history` adds eight weeks of demo activity for the insights dashboard.
export function seedGym(now = new Date(), { history = false } = {}) {
  const members = {};
  const levelMap = {};
  people.forEach((p, i) => {
    members[p.id] = {
      status: "active",
      pastDue: demoPastDue.has(kidInfo[p.id]?.family),
      joined: daysAgo(demoJoined[p.id] ?? 90 + ((i * 53) % 400), now),
    };
    if (!demoUnrated.has(p.id))
      levelMap[p.id] = {
        level: demoLevel(p, i),
        by: "Coach Jordan",
        at: daysAgo(7, now),
      };
  });
  return {
    version: 1,
    ...(history
      ? {
          historyGeneratedAt: new Date(now).toISOString(),
          history: seedHistory(members, now),
        }
      : {}),
    members,
    spark: {
      syncedAt: new Date(now).toISOString(),
      source: "Spark (demo data)",
    },
    levels: levelMap,
    checkins: [],
    crew: {},
    plans: {},
    runs: {},
  };
}

export function validGym(g) {
  return (
    !!g &&
    g.version === 1 &&
    ["members", "levels", "crew", "plans", "runs", "spark"].every(
      (k) => g[k] && typeof g[k] === "object",
    ) &&
    Array.isArray(g.checkins) &&
    g.checkins.every(
      (c) =>
        people.some((p) => p.id === c.childId) && typeof c.session === "string",
    )
  );
}

export const gymOf = (state) => state.gym ?? seedGym();
// Only the generation time goes to browser storage. The large deterministic
// history is reconstructed in memory after a reload. Existing saves with full
// history retain the original generation time when they are next written.
export const withoutHistory = (g) => {
  if (!g?.history) return g;
  const { history, ...rest } = g;
  return { ...rest, historyGeneratedAt: history.generated };
};
export const withHistory = (g) => {
  if (g.history) return g;
  const at = Number.isFinite(Date.parse(g.historyGeneratedAt))
    ? g.historyGeneratedAt
    : Number.isFinite(Date.parse(g.spark?.syncedAt))
      ? g.spark.syncedAt
      : new Date().toISOString();
  return { ...g, historyGeneratedAt: at, history: seedHistory(g.members, at) };
};

/* ---------- Who works when ---------- */

// Default crew per schedule index. "head" runs a class, "station" holds a
// station while the groups rotate, "attendant" staffs open gym.
const defaultCrew = {
  0: [
    { staffId: "jordan", role: "head" },
    { staffId: "priya", role: "station" },
    { staffId: "riley", role: "station" },
  ],
  1: [
    { staffId: "sam", role: "head" },
    { staffId: "morgan", role: "station" },
    { staffId: "priya", role: "station" },
    { staffId: "dev", role: "station" },
  ],
  2: [
    { staffId: "priya", role: "attendant" },
    { staffId: "riley", role: "attendant" },
  ],
  3: [
    { staffId: "morgan", role: "attendant" },
    { staffId: "dev", role: "attendant" },
  ],
  4: [
    { staffId: "jordan", role: "head" },
    { staffId: "sam", role: "station" },
    { staffId: "priya", role: "station" },
    { staffId: "riley", role: "station" },
  ],
};
export const roleNames = {
  head: "Head coach",
  station: "Station coach",
  attendant: "Open gym",
  helper: "Helping today",
};

export const crewFor = (state, index) =>
  gymOf(state).crew[index] ?? defaultCrew[index] ?? [];
// The crew on a given day: a one-day change from Staffing if there is one
// (an approved cover or an added coach), else the weekly crew, minus anyone
// with the day off. Plans & crew edits the weekly crew through crewFor.
export function crewOn(state, index, at = new Date()) {
  const day = dayKey(at);
  const d = state?.staffing?.days?.[day];
  // A one-day change wins, then a published week's schedule, then the
  // standing crew.
  const list =
    d?.crew?.[index] ??
    publishedCrew(state, index, day) ??
    crewFor(state, index);
  const off = new Set(d?.off ?? []);
  return off.size ? list.filter((c) => !off.has(c.staffId)) : list;
}
export const staffName = (id) =>
  staff.find((s) => s.id === id)?.name ?? "Coach";
export const leadOf = (state, index, at = new Date()) =>
  crewOn(state, index, at).find((c) => c.role === "head")?.staffId ?? null;

// The blocks a coach works today, in time order, with their role.
export function myBlocks(state, staffId, at = new Date()) {
  return sessions(at, state)
    .map((s) => ({
      ...s,
      role:
        crewOn(state, s.index, at).find((c) => c.staffId === staffId)?.role ??
        (gymOf(state).runs[s.id]?.helpers?.includes(staffId)
          ? "helper"
          : undefined),
    }))
    .filter((s) => s.role)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/* ---------- Class plans ---------- */

export const stationFocus = {
  grip: "Dead hangs, rung crossings and ring swings",
  wall: "Run-ups, catches and top-outs on the warped walls",
  movement: "Balance routes, landings and rolls",
  court: "Dribbling, passing and shots from the marked spots",
  course: "Linking obstacles into a full run",
};
// How a class with more than one group moves. "station": each coach holds
// a station and the groups rotate between coaches. "group": each coach
// keeps one group all class and walks it from station to station, so a
// class can visit more stations than it has coaches. "auto" picks
// "group" when there are fewer coaches than planned stations.
export const coachModes = {
  station: {
    label: "Coaches stay",
    long: "Coaches stay at their station and the groups rotate",
  },
  group: {
    label: "Coaches travel",
    long: "Each coach keeps one group and walks it from station to station",
  },
};
export const DEFAULT_WARMUP = 5;
// Minutes kept free at the end for the cool-down, wins and pickup.
export const CLOSE_MINUTES = 5;
export const MAX_ROUNDS = 3;
const defaultPlans = {
  0: { minutes: 12, stations: ["grip", "wall", "movement"] },
  1: { minutes: 12, stations: ["grip", "wall", "course", "court"] },
  4: { minutes: 12, stations: ["grip", "wall", "movement", "course"] },
};
export function planFor(state, index) {
  const saved = gymOf(state).plans[index];
  if (saved) return { warmup: DEFAULT_WARMUP, mode: "auto", ...saved };
  const d = defaultPlans[index] ?? {
    minutes: 12,
    stations: ["grip", "wall", "movement"],
  };
  return {
    minutes: d.minutes,
    warmup: DEFAULT_WARMUP,
    mode: "auto",
    stations: d.stations.map((station) => ({
      station,
      focus: stationFocus[station],
    })),
  };
}
// The first `count` planned stations, topped up from the rest of the gym.
// Paused stations are left out and replaced.
export function pickStations(plan, count, paused = []) {
  const planned = plan.stations.map((s) => s.station);
  const extra = stations.map((s) => s.id).filter((id) => !planned.includes(id));
  const open = [...planned, ...extra].filter((id) => !paused.includes(id));
  return open.slice(0, Math.min(count, open.length));
}
// "auto" resolved against the coaches on hand.
export const modeFor = (plan, coachCount) =>
  plan.mode === "station" || plan.mode === "group"
    ? plan.mode
    : coachCount < plan.stations.length
      ? "group"
      : "station";
// How many times through the stations fit the class after the warm-up and
// the close.
export function fitRounds(length, warmup, stationCount, minutes) {
  const room = length - warmup - CLOSE_MINUTES;
  return Math.max(
    1,
    Math.min(MAX_ROUNDS, Math.floor(room / (stationCount * minutes))),
  );
}
// The class timeline in minutes: warm-up, rotations, close.
export function classTimeline(length, { warmup, minutes, stations, rounds }) {
  const rotating = stations * rounds * minutes;
  return {
    warmup,
    rotating,
    used: warmup + rotating,
    spare: length - warmup - rotating,
    over: warmup + rotating > length,
  };
}
export const focusAt = (plan, stationId) =>
  plan.stations.find((s) => s.station === stationId)?.focus ??
  stationFocus[stationId];

/* ---------- Members, levels and tenure ---------- */

export const member = (state, childId) => gymOf(state).members[childId] ?? null;
export const levelOf = (state, childId) =>
  gymOf(state).levels[childId]?.level ?? null;

// How new a kid is, for the colored bubble. Everyone past 60 days is plain.
export const tenureKinds = {
  first: "First visit",
  week: "First week",
  month: "First 30 days",
  sixty: "First 60 days",
};
export function tenure(state, childId, at = new Date()) {
  const m = member(state, childId);
  if (!m?.joined) return null;
  const days = Math.round(
    (Date.parse(`${isoDay(at)}T12:00:00Z`) -
      Date.parse(`${m.joined}T12:00:00Z`)) /
      86400000,
  );
  const before = (state.club?.events ?? []).some(
    (e) =>
      e.childId === childId &&
      ["class", "open"].includes(e.kind) &&
      e.status === "approved" &&
      dayKey(e.at) < isoDay(at),
  );
  if (days <= 0 || (days < 7 && !before))
    return { id: "first", label: tenureKinds.first, days };
  if (days < 7) return { id: "week", label: tenureKinds.week, days };
  if (days < 30) return { id: "month", label: tenureKinds.month, days };
  if (days < 60) return { id: "sixty", label: tenureKinds.sixty, days };
  return null;
}

// Name, last name, parent name, family PIN or any part of a parent's phone.
export function findKids(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const digits = q.replace(/\D/g, "");
  const phoneHit = (fam) =>
    digits.length >= 3 &&
    /^[\d\s().+-]+$/.test(q) &&
    fam?.guardians.some((g) => g.phone.replace(/\D/g, "").includes(digits));
  return people.filter((p) => {
    const fam = families.find((f) => f.id === kidInfo[p.id]?.family);
    const words = [p.name, kidInfo[p.id]?.last, fam?.guardian]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .split(/\s+/);
    return (
      words.some((w) => w.startsWith(q)) ||
      p.name.toLowerCase().startsWith(q) ||
      fam?.pin === q ||
      phoneHit(fam)
    );
  });
}

// Problems the coach should see before or while checking a kid in.
export function flagsFor(state, childId, at = new Date()) {
  const m = member(state, childId);
  const out = [];
  if (m && m.status !== "active")
    out.push({ id: "inactive", label: "Not an active member" });
  if (m?.pastDue) out.push({ id: "pastDue", label: "Past due" });
  if (!arrival(state, childId, at))
    out.push({ id: "desk", label: "Not checked in at the front desk" });
  return out;
}

/* ---------- Check-ins and runs ---------- */

export const checkinsFor = (state, sessionId) =>
  gymOf(state).checkins.filter((c) => c.session === sessionId);
export const checkedIn = (state, sessionId, childId) =>
  gymOf(state).checkins.some(
    (c) => c.session === sessionId && c.childId === childId,
  );
export const runOf = (state, sessionId) => gymOf(state).runs[sessionId] ?? null;

// The next skill a coach can check off in one tap: goals first, then the
// current shirt tier. Skills that need a dated or written record stay on
// the full assessment sheet.
// Skills the head coach picked for this week come first when the kid is
// ready for them.
export const nextSkills = (state, childId, stationId, prefer = []) =>
  readySkills(state, childId, stationId)
    .filter((s) => !s.special)
    .sort(
      (a, b) => Number(prefer.includes(b.id)) - Number(prefer.includes(a.id)),
    );
export const nextSkill = (state, childId, stationId, prefer) =>
  nextSkills(state, childId, stationId, prefer)[0] ?? null;
export const focusSkills = (plan, stationId) =>
  plan.stations.find((s) => s.station === stationId)?.skills ?? [];

// Splits a class into `count` groups: age first, then level. Kids are cut
// into age bands that respect maxAgeSpread, the groups are shared across
// bands by size, and each band is split by level. If the ages can't fit
// the rule in `count` groups, it falls back to splitting by age alone and
// marks the groups that break it.
export function autoGroups(kids, count) {
  const n = Math.max(1, Math.min(count, kids.length || 1));
  const byAge = kids
    .slice()
    .sort(
      (a, b) =>
        a.age - b.age ||
        levelRank(a.level) - levelRank(b.level) ||
        a.name.localeCompare(b.name),
    );
  if (!byAge.length) return Array.from({ length: count }, () => []);
  const bands = ageBands(byAge);
  let groups;
  if (bands.length > n) groups = chunk(byAge, n);
  else {
    // Every band gets one group, the rest go to the biggest remainders.
    const share = bands.map((b) => ({ b, g: 1 }));
    for (let left = n - bands.length; left > 0; left--) {
      const pick = share
        .filter((s) => s.g < s.b.length)
        .sort((x, y) => y.b.length / (y.g + 1) - x.b.length / (x.g + 1))[0];
      if (!pick) break;
      pick.g += 1;
    }
    groups = share.flatMap(({ b, g }) =>
      chunk(
        b
          .slice()
          .sort(
            (x, y) =>
              levelRank(x.level) - levelRank(y.level) ||
              x.age - y.age ||
              x.name.localeCompare(y.name),
          ),
        g,
      ),
    );
  }
  while (groups.length < count) groups.push([]);
  return groups.map((g) => g.map((k) => k.id));
}
// The fewest groups that keep every kid inside the age rule.
export function ageBands(kids) {
  const bands = [];
  for (const k of kids.slice().sort((a, b) => a.age - b.age)) {
    const band = bands[bands.length - 1];
    if (band && k.age - band[0].age <= maxAgeSpread(band[0].age)) band.push(k);
    else bands.push([k]);
  }
  return bands;
}
function chunk(list, n) {
  const out = [];
  let i = 0;
  for (let g = 0; g < n; g++) {
    const size = Math.floor(list.length / n) + (g < list.length % n ? 1 : 0);
    out.push(list.slice(i, i + size));
    i += size;
  }
  return out;
}
export const groupKid = (state, id) => {
  const p = people.find((x) => x.id === id);
  return {
    id,
    name: p.name,
    age: p.age,
    level: levelOf(state, id) ?? "beginner",
  };
};
export function groupSummary(state, ids) {
  const kids = ids.map((id) => groupKid(state, id));
  if (!kids.length) return { ages: "Empty", level: "", tooWide: false };
  const ages = kids.map((k) => k.age);
  const lo = Math.min(...ages);
  const hi = Math.max(...ages);
  const counts = levels.map((l) => kids.filter((k) => k.level === l.id).length);
  const top = levels[counts.indexOf(Math.max(...counts))];
  return {
    ages: lo === hi ? `Age ${lo}` : `Ages ${lo}–${hi}`,
    level:
      counts.filter(Boolean).length === 1
        ? top.label
        : `Mostly ${top.label.toLowerCase()}`,
    tooWide: hi - lo > maxAgeSpread(lo),
  };
}
// A late arrival joins the group whose ages fit best, then the smallest.
function placeLate(state, groups, childId) {
  const age = people.find((p) => p.id === childId).age;
  const score = (g) => {
    if (!g.length) return 50;
    const ages = g.map((id) => people.find((p) => p.id === id).age);
    const lo = Math.min(...ages, age);
    const hi = Math.max(...ages, age);
    return (
      (hi - lo > maxAgeSpread(lo) ? 100 : 0) +
      Math.abs(age - ages.reduce((a, b) => a + b, 0) / ages.length) * 4 +
      g.length
    );
  };
  const best = groups
    .map((g, i) => ({ i, s: score(g) }))
    .sort((a, b) => a.s - b.s)[0].i;
  return groups.map((g, i) => (i === best ? [...g, childId] : g));
}

// Who stands at each station: the class's station coaches in order, then
// the head coach for anything left over.
// Coaches helping on the day come after the crew.
const coachPool = (state, index, leadId, helpers = []) => {
  const pool = crewOn(state, index)
    .filter((c) => c.role === "station")
    .map((c) => c.staffId);
  for (const id of helpers) if (!pool.includes(id)) pool.push(id);
  if (leadId && !pool.includes(leadId)) pool.push(leadId);
  return pool;
};
export function suggestCoaches(state, index, stationIds, leadId, helpers) {
  const pool = coachPool(state, index, leadId, helpers);
  return Object.fromEntries(stationIds.map((id, i) => [id, pool[i] ?? null]));
}

// Each coach keeps one group: the station coaches in order, then the head
// coach.
export function suggestLeaders(state, index, count, leadId, helpers) {
  const pool = coachPool(state, index, leadId, helpers);
  return Array.from({ length: count }, (_, g) => pool[g] ?? null);
}

// Where the class is: warming up, which rotation, how long is left, and
// which group is at which station. Group g starts at station g and moves
// one along each rotation, `rounds` times through the stations. With fewer
// groups than stations (coaches travel), some stations sit empty each
// rotation. `offset` holds time skipped with "Rotate now" and given back
// after a hold; `pausedAt` freezes the clock.
export const WARN_MS = 90 * 1000;
export function rotation(run, at = Date.now()) {
  if (!run?.startedAt) return null;
  const span = run.minutes * 60000;
  const warm = (run.warmup ?? 0) * 60000;
  const n = run.stations.length;
  const rounds = run.rounds ?? 1;
  const total = n * rounds;
  const groups = run.groups?.length ?? n;
  const clock = run.pausedAt
    ? Date.parse(run.pausedAt)
    : new Date(at).getTime();
  const elapsed = Math.max(
    0,
    clock - Date.parse(run.startedAt) + (run.offset ?? 0),
  );
  const done = !!run.endedAt || elapsed >= warm + total * span;
  const warmup = !done && elapsed < warm;
  const into = Math.max(0, elapsed - warm);
  const idx = Math.min(Math.floor(into / span), total - 1);
  const left = done ? 0 : warmup ? warm - elapsed : span - (into % span);
  const paused = !!run.pausedAt && !done;
  const stationOf = (g, i = idx) =>
    g >= 0 && g < groups ? run.stations[(g + i) % n] : null;
  return {
    idx,
    total,
    round: Math.floor(idx / n) + 1,
    rounds,
    done,
    left,
    warmup,
    paused,
    warn: !done && !warmup && !paused && left <= WARN_MS,
    stationOf,
    nextStationOf: (g) => (idx + 1 < total ? stationOf(g, idx + 1) : null),
    groupAt: (stationId) => {
      const s = run.stations.indexOf(stationId);
      if (s < 0) return -1;
      const g = (((s - idx) % n) + n) % n;
      return g < groups ? g : -1;
    },
  };
}
export const runMode = (run) => (run?.mode === "group" ? "group" : "station");
// The group at a station before the class starts or at a rotation.
const groupAtStart = (run, stationId) => {
  const s = run.stations.indexOf(stationId);
  return s >= 0 && s < (run.groups?.length ?? 0) ? s : -1;
};
// The coach at a station right now: the station's own coach, or the
// coach traveling with the group that's there.
export function coachAt(run, stationId, r = null) {
  if (!run) return null;
  if (runMode(run) === "station") return run.coaches?.[stationId] ?? null;
  const g = r ? r.groupAt(stationId) : groupAtStart(run, stationId);
  return g >= 0 ? (run.leaders?.[g] ?? null) : null;
}
// The coach with a group right now.
export function coachOfGroup(run, g, r = null) {
  if (!run) return null;
  if (runMode(run) === "group") return run.leaders?.[g] ?? null;
  const st = r ? r.stationOf(g) : run.stations[g];
  return run.coaches?.[st] ?? null;
}
// Where a coach is in a class: their group and station, now.
export function postOf(run, staffId, at = Date.now()) {
  if (!run?.groups || !staffId) return null;
  const r = run.startedAt ? rotation(run, at) : null;
  if (runMode(run) === "group") {
    const group = (run.leaders ?? []).indexOf(staffId);
    if (group < 0) return null;
    return {
      group,
      station: r ? r.stationOf(group) : run.stations[group],
      next: r && !r.done ? r.nextStationOf(group) : null,
    };
  }
  const station =
    Object.entries(run.coaches ?? {}).find(([, id]) => id === staffId)?.[0] ??
    null;
  if (!station) return null;
  return {
    station,
    group: r ? r.groupAt(station) : groupAtStart(run, station),
    next: null,
  };
}
export const stationOfCoach = (run, staffId, at = Date.now()) =>
  postOf(run, staffId, at)?.station ?? null;
// Everyone coaching a class: station coaches, group coaches and the lead.
export const runCoaches = (run) =>
  run
    ? [
        ...new Set(
          [
            ...Object.values(run.coaches ?? {}),
            ...(run.leaders ?? []),
            ...(run.helpers ?? []),
            staff.find((s) => s.name === run.lead)?.id,
          ].filter(Boolean),
        ),
      ]
    : [];
// Notes passed between coaches for a kid in this class, newest first.
export const handoffsFor = (run, childId) =>
  (run?.handoffs ?? [])
    .filter((h) => h.childId === childId)
    .slice()
    .reverse();

export const bonusesBy = (state, sessionId, coachName) =>
  (state.club?.events ?? []).filter(
    (e) =>
      e.kind === "bonus" &&
      e.session === sessionId &&
      e.coach === coachName &&
      !["rejected", "revoked"].includes(e.status),
  );

/* ---------- Actions ---------- */

const blockOf = (sessionId, now, state) => {
  const b = sessions(now, state).find((s) => s.id === sessionId);
  if (!b) throw Error("Choose a class or open gym block from today.");
  return b;
};
const withGym = (state, g) => ({ ...state, gym: g });

export function applyGym(state, action, now = new Date()) {
  const g = structuredClone(gymOf(state));
  const at = new Date(now).toISOString();
  const actor = action.actor ?? {};
  if (actor.role !== "Coach" || !actor.name)
    throw Error("Sign in as a coach first.");
  const manager = () => {
    if (!actor.head) throw Error("Only the gym manager can change this.");
  };
  const kid = (id) => {
    if (!people.some((p) => p.id === id)) throw Error("Choose an athlete.");
  };
  const coachEvent = (s, a) =>
    applyClub(s, { role: "Coach", coach: actor.name, ...a }, now);
  // The class's head coach (or whoever took over), or the gym manager.
  const lead = (run, index) => {
    if (!run) throw Error("Take attendance first.");
    if (!(
      actor.head ||
      run.lead === actor.name ||
      leadOf(state, index) === actor.staffId
    ))
      throw Error(`${run.lead} is running this class.`);
  };
  // Anyone coaching the class, its lead, or the gym manager.
  const inClass = (run, index) => {
    if (
      actor.head ||
      run.lead === actor.name ||
      leadOf(state, index) === actor.staffId ||
      runCoaches(run).includes(actor.staffId) ||
      crewOn(state, index).some((c) => c.staffId === actor.staffId)
    )
      return;
    throw Error("Only coaches in this class can do that.");
  };
  // A session id is "<day>:<block id>"; the block id is the class.
  const indexOf = (session) => String(session).slice(11);
  let next = state;
  switch (action.type) {
    case "level": {
      kid(action.childId);
      if (!levels.some((l) => l.id === action.level))
        throw Error("Choose beginner, intermediate or advanced.");
      g.levels[action.childId] = { level: action.level, by: actor.name, at };
      break;
    }
    case "checkIn": {
      const block = blockOf(action.session, now, state);
      if (!action.childIds?.length) throw Error("Choose who to check in.");
      let added = 0;
      for (const childId of action.childIds) {
        kid(childId);
        if (
          g.checkins.some(
            (c) => c.session === block.id && c.childId === childId,
          )
        )
          continue;
        const desk = arrival(state, childId, now);
        g.checkins.push({
          id: crypto.randomUUID(),
          childId,
          session: block.id,
          kind: block.kind,
          by: actor.name,
          at,
          deskAt: desk?.in ?? null,
          pastDue: !!g.members[childId]?.pastDue,
          inactive:
            !!g.members[childId] && g.members[childId].status !== "active",
        });
        added += 1;
        // Points for showing up: a class check-in confirms any front-desk
        // request for this class; open gym gets its own record.
        const mine = (next.club?.events ?? []).filter(
          (e) =>
            e.childId === childId &&
            e.kind === block.kind &&
            e.session === block.id,
        );
        if (!mine.some((e) => e.status === "approved")) {
          const pending = mine.find((e) => e.status === "pending");
          next = pending
            ? coachEvent(next, { type: "approve", id: pending.id, childId })
            : coachEvent(next, {
                type: "record",
                kind: block.kind,
                session: block.id,
                childId,
              });
        }
        const run = g.runs[block.id];
        if (run && !run.attendanceAt) run.attendanceAt = at;
        if (run?.groups && !run.groups.flat().includes(childId))
          run.groups = placeLate(state, run.groups, childId);
      }
      if (!added) throw Error("Already checked in.");
      if (block.kind === "class" && !g.runs[block.id]) {
        const head = leadOf(state, block.index);
        g.runs[block.id] = {
          session: block.id,
          lead: action.asLead || !head ? actor.name : staffName(head),
          attendanceAt: at,
        };
      }
      break;
    }
    case "undoCheckIn": {
      const block = blockOf(action.session, now, state);
      const row = g.checkins.find(
        (c) => c.session === block.id && c.childId === action.childId,
      );
      if (!row) throw Error("Not checked in.");
      g.checkins = g.checkins.filter((c) => c !== row);
      const ev = (next.club?.events ?? []).find(
        (e) =>
          e.childId === action.childId &&
          e.kind === block.kind &&
          e.session === block.id &&
          e.status === "approved",
      );
      if (ev)
        next = coachEvent(next, {
          type: "revoke",
          id: ev.id,
          childId: action.childId,
          reason: "Checked in by mistake",
        });
      const run = g.runs[block.id];
      if (run?.groups)
        run.groups = run.groups.map((grp) =>
          grp.filter((id) => id !== action.childId),
        );
      break;
    }
    case "attendanceDone":
    case "regroup": {
      const block = blockOf(action.session, now, state);
      if (block.kind !== "class") throw Error("Groups are for classes.");
      const present = g.checkins
        .filter((c) => c.session === block.id)
        .map((c) => c.childId);
      if (!present.length) throw Error("Check in at least one kid first.");
      const plan = planFor(withGym(state, g), block.index);
      const run = g.runs[block.id] ?? {
        session: block.id,
        lead: actor.name,
        attendanceAt: at,
      };
      lead(run, block.index);
      if (run.startedAt)
        throw Error("The class has started. Move kids by hand.");
      const kids = present.map((id) => groupKid(withGym(state, g), id));
      const gs = withGym(state, g);
      // One group per coach on the crew unless the head coach asks for
      // another number. The age rule wins: add groups when the asked-for
      // number would mix ages.
      const helpers = run.helpers ?? [];
      const crewSize = new Set([
        ...crewOn(gs, block.index, now)
          .filter((c) => ["head", "station"].includes(c.role))
          .map((c) => c.staffId),
        ...helpers,
      ]).size;
      const want = Math.max(
        1,
        action.count ??
          run.groups?.length ??
          (crewSize || plan.stations.length),
      );
      const count = Math.min(
        Math.max(want, ageBands(kids).length),
        stations.length,
      );
      // One group always travels: the coach takes the class round together.
      const mode =
        count === 1
          ? "group"
          : (action.mode ??
            (run.groups?.length > 1 ? run.mode : null) ??
            modeFor(plan, action.count ?? (crewSize || count)));
      if (!coachModes[mode]) throw Error("Choose how the coaches move.");
      const paused = Object.keys(state.floor?.outages ?? {});
      // Coaches who stay need one station per group. Coaches who travel
      // take their groups through every planned station.
      const ids = pickStations(
        plan,
        mode === "group" ? Math.max(count, plan.stations.length) : count,
        paused,
      );
      if (ids.length < count)
        throw Error("Not enough open stations for that many groups.");
      const leadId =
        staff.find((s) => s.name === run.lead)?.id ?? actor.staffId;
      const length = toMinutes(block.end) - toMinutes(block.start);
      const warmup = run.warmup ?? plan.warmup ?? DEFAULT_WARMUP;
      Object.assign(run, {
        attendanceDoneAt: run.attendanceDoneAt ?? at,
        groups: autoGroups(kids, count),
        raised: count > want ? want : null,
        mode,
        stations: ids,
        coaches:
          mode === "station"
            ? suggestCoaches(gs, block.index, ids, leadId, helpers)
            : {},
        leaders:
          mode === "group"
            ? suggestLeaders(gs, block.index, count, leadId, helpers)
            : [],
        minutes: plan.minutes,
        warmup,
        rounds: fitRounds(length, warmup, ids.length, plan.minutes),
      });
      g.runs[block.id] = run;
      break;
    }
    // Another coach jumps in to help on the day. They get the class on
    // their phone like the crew: their group or station, check-offs,
    // bonus picks, the clock and notes.
    case "addHelper": {
      const block = blockOf(action.session, now, state);
      if (block.kind !== "class") throw Error("Helpers are for classes.");
      if (!coaches.some((c) => c.id === action.staffId))
        throw Error("Choose a coach.");
      const run = g.runs[block.id] ?? {
        session: block.id,
        lead: actor.name,
        attendanceAt: at,
      };
      lead(run, block.index);
      const crewIds = crewOn(state, block.index, now).map((c) => c.staffId);
      if (
        crewIds.includes(action.staffId) ||
        (run.helpers ?? []).includes(action.staffId) ||
        staff.find((s) => s.name === run.lead)?.id === action.staffId
      )
        throw Error(`${staffName(action.staffId)} is already in this class.`);
      run.helpers = [...(run.helpers ?? []), action.staffId];
      g.runs[block.id] = run;
      break;
    }
    case "removeHelper": {
      const run = g.runs[action.session];
      if (!run?.helpers?.includes(action.staffId))
        throw Error("That coach isn't helping in this class.");
      lead(run, indexOf(action.session));
      run.helpers = run.helpers.filter((id) => id !== action.staffId);
      for (const [st, id] of Object.entries(run.coaches ?? {}))
        if (id === action.staffId) run.coaches[st] = null;
      if (run.leaders)
        run.leaders = run.leaders.map((id) =>
          id === action.staffId ? null : id,
        );
      break;
    }
    case "takeLead": {
      const run = g.runs[action.session];
      if (!run) throw Error("Take attendance first.");
      run.lead = actor.name;
      break;
    }
    case "moveKid": {
      const run = g.runs[action.session];
      if (!run?.groups) throw Error("Make the groups first.");
      lead(run, indexOf(action.session));
      if (!(action.to >= 0 && action.to < run.groups.length))
        throw Error("Choose a group.");
      run.groups = run.groups.map((grp) =>
        grp.filter((id) => id !== action.childId),
      );
      run.groups[action.to].push(action.childId);
      break;
    }
    case "setCoach": {
      const run = g.runs[action.session];
      if (!run?.stations?.includes(action.station))
        throw Error("Choose a station in this class.");
      lead(run, indexOf(action.session));
      if (runMode(run) === "group")
        throw Error("Coaches travel with their groups in this class.");
      if (action.staffId && !staff.some((s) => s.id === action.staffId))
        throw Error("Choose a coach.");
      // A coach holds one station; picking them again moves them.
      for (const [st, id] of Object.entries(run.coaches))
        if (id === action.staffId) run.coaches[st] = null;
      run.coaches[action.station] = action.staffId || null;
      break;
    }
    case "setLeader": {
      const run = g.runs[action.session];
      if (!run?.groups) throw Error("Make the groups first.");
      if (runMode(run) !== "group")
        throw Error("Coaches stay at their stations in this class.");
      lead(run, indexOf(action.session));
      if (!(action.group >= 0 && action.group < run.groups.length))
        throw Error("Choose a group.");
      if (action.staffId && !staff.some((s) => s.id === action.staffId))
        throw Error("Choose a coach.");
      // A coach keeps one group; picking them again moves them.
      run.leaders = run.groups.map((_, i) =>
        i === action.group
          ? action.staffId || null
          : run.leaders?.[i] === action.staffId
            ? null
            : (run.leaders?.[i] ?? null),
      );
      break;
    }
    case "startClass": {
      const run = g.runs[action.session];
      if (!run?.groups) throw Error("Finish attendance first.");
      lead(run, indexOf(action.session));
      if (run.startedAt) throw Error("The class is already running.");
      if (action.minutes)
        run.minutes = Math.max(3, Math.min(30, Number(action.minutes)));
      if (action.warmup !== undefined) {
        const w = Number(action.warmup);
        if (!(Number.isInteger(w) && w >= 0 && w <= 15))
          throw Error("A warm-up runs 0 to 15 minutes.");
        run.warmup = w;
      }
      if (action.rounds !== undefined) {
        const n = Number(action.rounds);
        if (!(Number.isInteger(n) && n >= 1 && n <= MAX_ROUNDS))
          throw Error(`Go through the stations 1 to ${MAX_ROUNDS} times.`);
        run.rounds = n;
      }
      run.startedAt = at;
      run.offset = 0;
      break;
    }
    case "rotate": {
      const run = g.runs[action.session];
      const r = rotation(run, now);
      if (!r || r.done) throw Error("No rotation is running.");
      lead(run, indexOf(action.session));
      run.offset = (run.offset ?? 0) + r.left;
      break;
    }
    // Any coach in the class can hold the clock, the way any coach can
    // give the stop signal. Resuming picks up where it stopped.
    case "hold": {
      const run = g.runs[action.session];
      const r = rotation(run, now);
      if (!r || r.done) throw Error("No rotation is running.");
      inClass(run, indexOf(action.session));
      if (run.pausedAt) throw Error("The clock is already on hold.");
      run.pausedAt = at;
      break;
    }
    case "resume": {
      const run = g.runs[action.session];
      if (!run?.pausedAt) throw Error("The clock isn't on hold.");
      inClass(run, indexOf(action.session));
      run.offset =
        (run.offset ?? 0) - (Date.parse(at) - Date.parse(run.pausedAt));
      run.pausedAt = null;
      break;
    }
    // A line for whoever has the kid next: "sore wrist, keep off rings".
    case "handoff": {
      const run = g.runs[action.session];
      if (!run?.groups?.flat().includes(action.childId))
        throw Error("Choose a kid in this class.");
      inClass(run, indexOf(action.session));
      const text = String(action.text ?? "")
        .trim()
        .slice(0, 140);
      if (!text) throw Error("Write the note first.");
      run.handoffs = [
        ...(run.handoffs ?? []),
        {
          id: crypto.randomUUID(),
          childId: action.childId,
          text,
          by: actor.name,
          at,
        },
      ];
      break;
    }
    case "endClass": {
      const run = g.runs[action.session];
      if (!run?.startedAt) throw Error("Start the class first.");
      lead(run, indexOf(action.session));
      run.endedAt = run.endedAt ?? at;
      break;
    }
    case "bonus": {
      const block = blockOf(action.session, now, state);
      const ids = [...new Set(action.childIds ?? [])];
      if (!ids.length) throw Error("Pick at least one kid.");
      const given = bonusesBy(next, block.id, actor.name).length;
      if (given + ids.length > BONUS_PICKS)
        throw Error(`Pick up to ${BONUS_PICKS} kids.`);
      for (const childId of ids)
        next = coachEvent(next, {
          type: "record",
          kind: "bonus",
          session: block.id,
          childId,
        });
      break;
    }
    case "plan": {
      const lead = crewFor(state, action.index).some(
        (c) => c.staffId === actor.staffId && c.role === "head",
      );
      if (!actor.head && !lead)
        throw Error("The class's head coach or the gym manager plans it.");
      const list = (action.plan?.stations ?? []).filter((s) =>
        stations.some((x) => x.id === s.station),
      );
      if (!list.length) throw Error("Plan at least one station.");
      if (new Set(list.map((s) => s.station)).size !== list.length)
        throw Error("Each station appears once.");
      const minutes = Number(action.plan.minutes);
      if (!(minutes >= 3 && minutes <= 30))
        throw Error("Rotations run 3 to 30 minutes.");
      const warmup = Number(action.plan.warmup ?? DEFAULT_WARMUP);
      if (!(Number.isInteger(warmup) && warmup >= 0 && warmup <= 15))
        throw Error("A warm-up runs 0 to 15 minutes.");
      const mode = action.plan.mode ?? "auto";
      if (mode !== "auto" && !coachModes[mode])
        throw Error("Choose how the coaches move.");
      g.plans[action.index] = {
        minutes,
        warmup,
        mode,
        stations: list.map((s) => ({
          station: s.station,
          focus: String(s.focus ?? "")
            .trim()
            .slice(0, 140),
          skills: (s.skills ?? []).filter((id) =>
            catalog.some(
              (k) => k.id === id && categoryAt(s.station) === k.category,
            ),
          ),
        })),
        week: seasonKey(now),
        by: actor.name,
        at,
      };
      break;
    }
    case "crew": {
      manager();
      const list = (action.crew ?? []).filter(
        (c) =>
          staff.some((s) => s.id === c.staffId) &&
          roleNames[c.role] &&
          c.role !== "helper",
      );
      if (new Set(list.map((c) => c.staffId)).size !== list.length)
        throw Error("Each coach appears once.");
      if (list.filter((c) => c.role === "head").length > 1)
        throw Error("One head coach per class.");
      g.crew[action.index] = list;
      break;
    }
    case "import": {
      manager();
      const { rows, unmatched } = parseMembers(action.text ?? "");
      if (!rows.length)
        throw Error(
          unmatched.length
            ? "No names matched the roster."
            : "Paste the export first.",
        );
      for (const r of rows)
        g.members[r.childId] = { ...g.members[r.childId], ...r.member };
      g.spark = {
        syncedAt: at,
        source: action.source ?? "Spark export",
        by: actor.name,
        matched: rows.length,
        unmatched,
      };
      break;
    }
    default:
      throw Error("Unknown action.");
  }
  return { ...next, gym: g };
}

// Award a skill from the floor: the coach watched it, one tap records it.
export function checkOff(state, actor, childId, skillId) {
  const skill = catalog.find((s) => s.id === skillId);
  if (!skill) throw Error("Choose a skill.");
  return apply(state, {
    type: "award",
    childId,
    skillId,
    coach: actor.name,
    value: skill.target ?? "Demonstrated",
    confirmed: true,
    note: "Checked off on the floor",
  });
}

/* ---------- Spark export ---------- */

// Reads "first,last,status,past_due,joined" rows (header optional) and
// matches them to the roster by name. Adding brand-new kids needs the
// shared database, so unmatched names are reported back.
export function parseMembers(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = [];
  const unmatched = [];
  for (const line of lines) {
    const cells = line
      .split(/[,\t]/)
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    if (/^first/i.test(cells[0])) continue;
    const [first, last, status = "active", pastDue = "", joined = ""] = cells;
    const child = people.find(
      (p) =>
        p.first.toLowerCase() === first?.toLowerCase() &&
        kidInfo[p.id]?.last.toLowerCase() === last?.toLowerCase(),
    );
    if (!child) {
      unmatched.push(`${first ?? ""} ${last ?? ""}`.trim());
      continue;
    }
    const member = {
      status: status.toLowerCase() || "active",
      pastDue: /^(y|yes|true|1|past due)$/i.test(pastDue),
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(joined)) member.joined = joined;
    rows.push({ childId: child.id, member });
  }
  return { rows, unmatched };
}

/* ---------- Coach measures ---------- */

const minutesBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 60000;
const avg = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

// Per coach since `from`: check-ins, how long kids waited between the front
// desk and the floor, how fast class attendance got done, skills checked
// off and bonus picks given.
export function coachStats(state, from) {
  const g = gymOf(state);
  const since = (x) => Date.parse(x) >= from.getTime();
  const ins = g.checkins.filter((c) => since(c.at));
  return coaches.map((s) => {
    const mine = ins.filter((c) => c.by === s.name);
    const waits = mine
      .filter((c) => c.deskAt)
      .map((c) => minutesBetween(c.deskAt, c.at));
    const runs = Object.values(g.runs).filter(
      (r) =>
        r.lead === s.name && r.attendanceDoneAt && since(r.attendanceDoneAt),
    );
    const late = runs
      .map((r) => {
        const block = sessionFromId(state, r.session);
        return block
          ? minutesBetween(
              gymLocalIso(r.session.slice(0, 10), block.start),
              r.attendanceDoneAt,
            )
          : null;
      })
      .filter((x) => x !== null);
    return {
      staff: s,
      checkins: mine.length,
      deskWait: avg(waits),
      classes: runs.length,
      attendance: avg(late),
      // Seeded demo history is not coaching anyone did.
      skills: state.awards.filter(
        (a) =>
          a.coach === s.name &&
          !a.revoked &&
          since(a.at) &&
          !a.id.startsWith("seed-"),
      ).length,
      bonuses: (state.club?.events ?? []).filter(
        (e) =>
          e.kind === "bonus" &&
          e.coach === s.name &&
          e.status === "approved" &&
          since(e.at),
      ).length,
    };
  });
}

// Check-ins today that the front desk should hear about.
export function deskIssues(state, at = new Date()) {
  return gymOf(state)
    .checkins.filter(
      (c) =>
        dayKey(c.at) === dayKey(at) && (!c.deskAt || c.pastDue || c.inactive),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}

export const stationLabel = (id) =>
  stations.find((s) => s.id === id)?.name ?? "Station";
export const categoryAt = (id) => stationCategory[id];
