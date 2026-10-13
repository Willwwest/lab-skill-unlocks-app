// Coach staffing: shifts, breaks, floaters, time portfolios, shift requests
// and ratio-based staffing checks. Stored in `state.staffing`, next to the
// gym's weekly crew (`state.gym.crew`, edited in Plans & crew).
//
// Placeholders until the gym confirms them: shift times, the modality list,
// kids-per-coach ratios and the minimum crew per block.
import { coaches, staff } from "./roster.js";
import { sessions, dayKey } from "./club.js";
import { people } from "./domain.js";
import { rosterFor } from "./floor.js";
import { gymMinutes, toMinutes } from "./gym-time.js";
import { checkinsFor, crewFor, crewOn, staffName } from "./gym.js";

export { crewOn };

export const STAFFING_VERSION = 1;

// The kinds of work a coach's time is split across. Each coach keeps at
// least the owner's minimum share (MIN_SHARE by default) in every one.
export const modalities = [
  { id: "class", label: "Ninja classes", short: "Classes" },
  { id: "open", label: "Open gym", short: "Open gym" },
  { id: "floater", label: "Floater", short: "Floater" },
];
export const MIN_SHARE = 10;

// What a coach is doing at a moment.
export const statusInfo = {
  class: { label: "In class", tone: "info" },
  open: { label: "Open gym", tone: "good" },
  floater: { label: "Floating", tone: "brand" },
  break: { label: "On break", tone: "warn" },
  free: { label: "Available", tone: "neutral" },
  off: { label: "Off", tone: "outline" },
};

export const requestKinds = {
  cover: "Cover a block",
  timeoff: "Day off",
  hours: "Change my hours",
};

// Minutes around a class start and end that need a floater on the floor.
export const TRANSITION_MIN = 10;
export const BREAK_LENGTHS = [15, 30, 45, 60];

const defaultShifts = {
  jordan: { start: "09:30", end: "17:00" },
  sam: { start: "09:30", end: "18:30" },
  priya: { start: "09:30", end: "18:00" },
  riley: { start: "09:30", end: "18:00" },
  morgan: { start: "15:00", end: "20:15" },
  dev: { start: "15:00", end: "20:15" },
  alex: { start: "09:00", end: "17:30" },
};
const defaultPortfolios = {
  jordan: { class: 70, open: 15, floater: 15 },
  sam: { class: 60, open: 20, floater: 20 },
  priya: { class: 40, open: 45, floater: 15 },
  riley: { class: 45, open: 40, floater: 15 },
  morgan: { class: 30, open: 55, floater: 15 },
  dev: { class: 30, open: 55, floater: 15 },
  alex: { class: 30, open: 20, floater: 50 },
};

export function seedStaffing(now = new Date()) {
  const day = dayKey(now);
  return {
    version: STAFFING_VERSION,
    shifts: structuredClone(defaultShifts),
    portfolios: structuredClone(defaultPortfolios),
    // Floater per class block (schedule index). Progressions has none, so
    // the staffing check has a gap to show.
    floaters: { 0: "sam", 4: "alex" },
    breaks: [
      {
        id: "seed-break-riley",
        staffId: "riley",
        day,
        start: "11:15",
        end: "11:45",
      },
      {
        id: "seed-break-jordan",
        staffId: "jordan",
        day,
        start: "13:00",
        end: "13:30",
      },
    ],
    // One-day changes keyed by gym day: crew per block, floaters, hours
    // per coach, and who has the day off.
    days: {},
    requests: [
      {
        id: "seed-request-dev",
        kind: "cover",
        staffId: "dev",
        day,
        index: 3,
        toStaffId: null,
        start: null,
        end: null,
        note: "Dentist appointment at 6.",
        status: "pending",
        at: new Date(now).toISOString(),
      },
    ],
    // Owner settings. Classes with a kid aged 6 or under use youngRatio.
    rules: {
      classMin: 3,
      openMin: 1,
      floaterPerClass: 1,
      classRatio: 8,
      youngRatio: 5,
      openRatio: 10,
      maxOnBreak: 1,
      minShare: MIN_SHARE,
      expected: {},
    },
    // Who manages, set by the owner. Missing means the roster default.
    roles: {},
  };
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const validTime = (t) => typeof t === "string" && timeRe.test(t);

export function validStaffing(s) {
  return (
    !!s &&
    s.version === STAFFING_VERSION &&
    ["shifts", "portfolios", "floaters", "days", "rules"].every(
      (k) => s[k] && typeof s[k] === "object",
    ) &&
    Array.isArray(s.breaks) &&
    Array.isArray(s.requests) &&
    s.breaks.every(
      (b) =>
        staff.some((x) => x.id === b.staffId) &&
        validTime(b.start) &&
        validTime(b.end),
    )
  );
}

// Saves made before staffing existed get today's seed.
const seeded = new Map();
export const staffingOf = (state) => {
  if (validStaffing(state?.staffing)) {
    const s = state.staffing;
    return s.roles && s.rules.maxOnBreak !== undefined
      ? s
      : {
          ...s,
          roles: s.roles ?? {},
          rules: { ...seedStaffing().rules, ...s.rules },
        };
  }
  const day = dayKey(new Date());
  if (!seeded.has(day)) seeded.set(day, seedStaffing());
  return seeded.get(day);
};

/* ---------- Levels ---------- */

// coach < manager < owner. The owner is fixed; managers are the roster's
// head flag unless the owner has changed it.
export const levelNames = {
  coach: "Coach",
  manager: "Gym manager",
  owner: "Owner",
};
export function levelOf(state, staffId) {
  const m = staff.find((x) => x.id === staffId);
  if (!m) return null;
  if (m.owner) return "owner";
  const set = state?.staffing?.roles?.[staffId];
  if (set) return set;
  return m.head ? "manager" : "coach";
}
// A staff member as the app should treat them right now.
export function withLevel(state, member) {
  const level = levelOf(state, member.id);
  return {
    ...member,
    level,
    head: level !== "coach",
    owner: level === "owner",
  };
}

/* ---------- Time helpers ---------- */

export const minutesToTime = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
const dayOf = (s, day) => s.days[day] ?? {};
// Midday on a gym day, as an instant, for day-based lookups.
export const noonOf = (day) => `${day}T19:00:00Z`;

/* ---------- Who works when ---------- */

export function shiftOn(state, staffId, at = new Date()) {
  const s = staffingOf(state);
  const d = dayOf(s, dayKey(at));
  if ((d.off ?? []).includes(staffId)) return null;
  return d.hours?.[staffId] ?? s.shifts[staffId] ?? null;
}

export const floaterOn = (state, index, at = new Date()) => {
  const s = staffingOf(state);
  const d = dayOf(s, dayKey(at));
  const id =
    d.floaters && index in d.floaters
      ? d.floaters[index]
      : (s.floaters[index] ?? null);
  return id && !(d.off ?? []).includes(id) ? id : null;
};

export const breaksOn = (state, at = new Date()) => {
  const day = dayKey(at);
  return staffingOf(state)
    .breaks.filter((b) => b.day === day)
    .sort((a, b) => a.start.localeCompare(b.start));
};

// Everything a coach is booked for on a day, as minute ranges.
export function commitments(state, staffId, at = new Date()) {
  const out = [];
  for (const b of sessions(at)) {
    const role = crewOn(state, b.index, at).find(
      (c) => c.staffId === staffId,
    )?.role;
    if (role)
      out.push({
        kind: role === "attendant" ? "open" : "class",
        role,
        block: b,
        start: toMinutes(b.start),
        end: toMinutes(b.end),
      });
    if (b.kind === "class" && floaterOn(state, b.index, at) === staffId)
      out.push({
        kind: "floater",
        role: "floater",
        block: b,
        start: toMinutes(b.start) - TRANSITION_MIN,
        end: toMinutes(b.end) + TRANSITION_MIN,
      });
  }
  return out.sort((a, b) => a.start - b.start);
}

// What a coach is doing at a minute of the day (defaults to now).
export function coachStatusAt(state, staffId, at = new Date(), minute) {
  const m = minute ?? gymMinutes(at);
  const shift = shiftOn(state, staffId, at);
  if (!shift || m < toMinutes(shift.start) || m >= toMinutes(shift.end))
    return { status: "off", shift };
  const brk = breaksOn(state, at).find(
    (b) =>
      b.staffId === staffId && m >= toMinutes(b.start) && m < toMinutes(b.end),
  );
  if (brk) return { status: "break", until: brk.end, break: brk, shift };
  const c = commitments(state, staffId, at);
  const work = c.find((x) => x.kind !== "floater" && m >= x.start && m < x.end);
  if (work)
    return {
      status: work.kind,
      role: work.role,
      block: work.block,
      until: work.block.end,
      shift,
    };
  const fl = c.find((x) => x.kind === "floater" && m >= x.start && m < x.end);
  if (fl)
    return {
      status: "floater",
      block: fl.block,
      until: minutesToTime(fl.end),
      shift,
    };
  const next = c.find((x) => x.start > m);
  return { status: "free", next, shift };
}

export const boardNow = (state, at = new Date()) =>
  coaches.map((s) => ({ staff: s, ...coachStatusAt(state, s.id, at) }));

// The day as a grid of time slots, one row per coach.
export function dayGrid(state, at = new Date(), step = 30) {
  const shifts = coaches.map((s) => shiftOn(state, s.id, at)).filter(Boolean);
  const first = Math.min(...shifts.map((s) => toMinutes(s.start)), 9 * 60);
  const last = Math.max(...shifts.map((s) => toMinutes(s.end)), 20 * 60);
  const start = Math.floor(first / 60) * 60;
  const end = Math.ceil(last / 60) * 60;
  const slots = [];
  for (let m = start; m < end; m += step) slots.push(m);
  return {
    slots,
    step,
    rows: coaches.map((s) => ({
      staff: s,
      cells: slots.map((m) => coachStatusAt(state, s.id, at, m).status),
    })),
    breaks: slots.map(
      (m) =>
        breaksOn(state, at).filter((b) =>
          overlaps(m, m + step, toMinutes(b.start), toMinutes(b.end)),
        ).length,
    ),
  };
}

/* ---------- Breaks ---------- */

// Why a break can't go there, or null if it can.
export function breakProblem(
  state,
  staffId,
  start,
  end,
  at = new Date(),
  ignoreId,
) {
  if (!validTime(start) || !validTime(end)) return "Pick a start and end time.";
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (b - a < 10) return "Breaks are at least 10 minutes.";
  if (b - a > 60) return "Breaks are at most an hour.";
  const name = staffName(staffId);
  const shift = shiftOn(state, staffId, at);
  if (!shift) return `${name} isn't working that day.`;
  if (a < toMinutes(shift.start) || b > toMinutes(shift.end))
    return `That's outside ${name}'s shift (${shift.start}–${shift.end}).`;
  const others = breaksOn(state, at).filter(
    (x) =>
      x.id !== ignoreId && overlaps(a, b, toMinutes(x.start), toMinutes(x.end)),
  );
  if (others.some((x) => x.staffId === staffId))
    return "That overlaps a break you already have.";
  const max = staffingOf(state).rules.maxOnBreak ?? 1;
  if (others.length >= max) {
    const o = others[0];
    return max === 1
      ? `${staffName(o.staffId)} is on break ${o.start}–${o.end}. One coach on break at a time.`
      : `${others.length} coaches are already on break then. The limit is ${max}.`;
  }
  const busy = commitments(state, staffId, at).find((c) =>
    overlaps(a, b, c.start, c.end),
  );
  if (busy)
    return `${name} is ${busy.kind === "floater" ? "floating for" : "working"} ${busy.block.name} then. Get it covered first.`;
  return null;
}

// Open break windows left in a coach's shift, earliest first.
export function breakSlots(
  state,
  staffId,
  at = new Date(),
  length = 30,
  limit = 4,
) {
  const shift = shiftOn(state, staffId, at);
  if (!shift) return [];
  const from = Math.max(
    toMinutes(shift.start),
    Math.ceil(gymMinutes(at) / 15) * 15,
  );
  const out = [];
  for (let m = from; m + length <= toMinutes(shift.end); m += 15) {
    const s0 = minutesToTime(m);
    const s1 = minutesToTime(m + length);
    if (!breakProblem(state, staffId, s0, s1, at)) {
      out.push({ start: s0, end: s1 });
      if (out.length >= limit) break;
      m += length - 15;
    }
  }
  return out;
}

// Pairs of breaks on a day that overlap (more than one coach out at once).
export function breakClashes(state, at = new Date()) {
  const list = breaksOn(state, at);
  const out = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (
        overlaps(
          toMinutes(a.start),
          toMinutes(a.end),
          toMinutes(b.start),
          toMinutes(b.end),
        )
      )
        out.push([a, b]);
    }
  return out;
}

/* ---------- Time portfolios ---------- */

export function portfolioProblem(p, min = MIN_SHARE) {
  if (!p || typeof p !== "object") return "Fill in every type of work.";
  let sum = 0;
  for (const m of modalities) {
    const v = p[m.id];
    if (!Number.isInteger(v) || v < 0)
      return `Enter a whole number for ${m.label}.`;
    if (v < min) return `${m.label} needs at least ${min}%.`;
    sum += v;
  }
  if (sum !== 100)
    return `The shares add up to ${sum}%. They need to make 100%.`;
  return null;
}

export const portfolioOf = (state, staffId) =>
  staffingOf(state).portfolios[staffId] ??
  Object.fromEntries(
    modalities.map((m) => [m.id, Math.round(100 / modalities.length)]),
  );

// How a coach's booked minutes on a day split across the modalities.
export function actualMix(state, staffId, at = new Date()) {
  const mins = Object.fromEntries(modalities.map((m) => [m.id, 0]));
  for (const c of commitments(state, staffId, at))
    mins[c.kind] += c.end - c.start;
  const total = Object.values(mins).reduce((a, b) => a + b, 0);
  return {
    minutes: mins,
    total,
    share: Object.fromEntries(
      modalities.map((m) => [
        m.id,
        total ? Math.round((mins[m.id] / total) * 100) : 0,
      ]),
    ),
  };
}

// Target minus booked share per modality: positive means under target.
export function portfolioGap(state, staffId, at = new Date()) {
  const target = portfolioOf(state, staffId);
  const { share, total } = actualMix(state, staffId, at);
  return Object.fromEntries(
    modalities.map((m) => [
      m.id,
      total ? target[m.id] - share[m.id] : target[m.id],
    ]),
  );
}

/* ---------- Staffing checks and ratios ---------- */

// Kids to plan for: the class roster or today's check-ins, whichever is
// higher, or the manager's expected headcount if that's higher still.
export function expectedKids(state, block) {
  const set = staffingOf(state).rules.expected?.[block.index] ?? 0;
  const checked = checkinsFor(state, block.id).length;
  if (block.kind === "class")
    return Math.max(rosterFor(block.index).length, checked, set);
  return Math.max(set, checked);
}

// How many coaches a block needs: the minimum, or more if the kids need it.
// The youngest kid on a class roster, for the age-based ratio.
export function youngestIn(block) {
  const ages = rosterFor(block.index)
    .map((k) => people.find((p) => p.id === k.id)?.age)
    .filter(Number.isFinite);
  return ages.length ? Math.min(...ages) : null;
}
export function neededCoaches(state, block) {
  const r = staffingOf(state).rules;
  const kids = expectedKids(state, block);
  const young = block.kind === "class" && (youngestIn(block) ?? 99) <= 6;
  const ratio =
    block.kind === "class"
      ? young
        ? (r.youngRatio ?? r.classRatio)
        : r.classRatio
      : r.openRatio;
  const min = block.kind === "class" ? r.classMin : r.openMin;
  return {
    kids,
    ratio,
    young,
    min,
    need: Math.max(min, Math.ceil(kids / ratio)),
  };
}

// Gaps and clashes for one block on a day.
export function blockCheck(state, block, at = new Date()) {
  const s = staffingOf(state);
  const crew = crewOn(state, block.index, at);
  const { kids, ratio, min, need } = neededCoaches(state, block);
  const issues = [];
  const b0 = toMinutes(block.start);
  const b1 = toMinutes(block.end);
  const off = dayOf(s, dayKey(at)).off ?? [];
  for (const c of crewFor(state, block.index))
    if (off.includes(c.staffId) && !crew.some((x) => x.staffId === c.staffId))
      issues.push({
        tone: "bad",
        text: `${staffName(c.staffId)} is off. Find cover.`,
      });
  if (crew.length < need)
    issues.push({
      tone: "bad",
      text:
        crew.length < min
          ? `${crew.length} of ${min} coaches minimum`
          : `${kids} kids at 1:${ratio} need ${need} coaches, ${crew.length} booked`,
    });
  let floater = null;
  if (block.kind === "class") {
    if (!crew.some((c) => c.role === "head"))
      issues.push({ tone: "bad", text: "No head coach" });
    floater = floaterOn(state, block.index, at);
    if (s.rules.floaterPerClass > 0 && !floater)
      issues.push({ tone: "warn", text: "No floater for the transitions" });
  }
  for (const c of crew) {
    const shift = shiftOn(state, c.staffId, at);
    if (!shift || toMinutes(shift.start) > b0 || toMinutes(shift.end) < b1)
      issues.push({
        tone: "bad",
        text: `${staffName(c.staffId)} isn't on shift for all of it`,
      });
    const brk = breaksOn(state, at).find(
      (x) =>
        x.staffId === c.staffId &&
        overlaps(b0, b1, toMinutes(x.start), toMinutes(x.end)),
    );
    if (brk)
      issues.push({
        tone: "warn",
        text: `${staffName(c.staffId)} has a break ${brk.start}–${brk.end}`,
      });
  }
  return { block, crew, floater, kids, ratio, need, issues };
}

export const dayCheck = (state, at = new Date()) =>
  sessions(at)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => blockCheck(state, b, at));

// Coaches who could take a block (or float it), best fit first: on shift
// for the whole block, not booked or on break then, and furthest under
// their target share for that kind of work.
export function coverCandidates(state, block, at = new Date(), { kind } = {}) {
  const want = kind ?? (block.kind === "class" ? "class" : "open");
  const pad = want === "floater" ? TRANSITION_MIN : 0;
  const b0 = toMinutes(block.start) - pad;
  const b1 = toMinutes(block.end) + pad;
  return coaches
    .map((s) => {
      const shift = shiftOn(state, s.id, at);
      if (!shift || toMinutes(shift.start) > b0 || toMinutes(shift.end) < b1)
        return null;
      const inBlock =
        crewOn(state, block.index, at).some((c) => c.staffId === s.id) ||
        floaterOn(state, block.index, at) === s.id;
      const busy = commitments(state, s.id, at).some(
        (c) =>
          c.block.index !== block.index && overlaps(b0, b1, c.start, c.end),
      );
      const onBreak = breaksOn(state, at).some(
        (x) =>
          x.staffId === s.id &&
          overlaps(b0, b1, toMinutes(x.start), toMinutes(x.end)),
      );
      if (inBlock || busy || onBreak) return null;
      return { staff: s, gap: portfolioGap(state, s.id, at)[want] };
    })
    .filter(Boolean)
    .sort((a, b) => b.gap - a.gap);
}

/* ---------- Actions ---------- */

const touchDay = (s, day) => (s.days[day] ??= {});

export function applyStaffing(state, action, now = new Date()) {
  const s = structuredClone(staffingOf(state));
  const actor = action.actor ?? {};
  if (actor.role !== "Coach" || !actor.staffId)
    throw Error("Sign in as a coach first.");
  const manager = () => {
    if (!actor.head) throw Error("Only the gym manager can change this.");
  };
  const owner = () => {
    if (!actor.owner) throw Error("Only the owner can change this.");
  };
  const self = (id) => {
    if (id !== actor.staffId && !actor.head)
      throw Error("You can only change your own schedule.");
  };
  const coach = (id) => {
    if (!staff.some((x) => x.id === id)) throw Error("Choose a coach.");
  };
  const day = action.day ?? dayKey(now);
  const at = action.day ? noonOf(day) : now;
  const view = () => ({ ...state, staffing: s });
  const blockAt = (index, when = at) => {
    const b = sessions(when).find((x) => x.index === Number(index));
    if (!b) throw Error("Choose a block.");
    return b;
  };
  switch (action.type) {
    case "addBreak": {
      coach(action.staffId);
      self(action.staffId);
      const why = breakProblem(
        view(),
        action.staffId,
        action.start,
        action.end,
        at,
      );
      if (why) throw Error(why);
      s.breaks.push({
        id: crypto.randomUUID(),
        staffId: action.staffId,
        day,
        start: action.start,
        end: action.end,
        by: actor.staffId,
      });
      break;
    }
    case "removeBreak": {
      const b = s.breaks.find((x) => x.id === action.id);
      if (!b) throw Error("That break is gone.");
      self(b.staffId);
      s.breaks = s.breaks.filter((x) => x.id !== action.id);
      break;
    }
    case "portfolio": {
      coach(action.staffId);
      self(action.staffId);
      const p = Object.fromEntries(
        modalities.map((m) => [m.id, Number(action.portfolio?.[m.id])]),
      );
      const why = portfolioProblem(p, s.rules.minShare ?? MIN_SHARE);
      if (why) throw Error(why);
      s.portfolios[action.staffId] = p;
      break;
    }
    case "shift": {
      owner();
      coach(action.staffId);
      if (
        !validTime(action.start) ||
        !validTime(action.end) ||
        action.start >= action.end
      )
        throw Error("Shifts need a start before the end.");
      s.shifts[action.staffId] = { start: action.start, end: action.end };
      break;
    }
    case "floater": {
      manager();
      const b = blockAt(action.index);
      if (b.kind !== "class") throw Error("Floaters cover class transitions.");
      if (action.staffId) {
        coach(action.staffId);
        if (
          crewOn(view(), b.index, at).some((c) => c.staffId === action.staffId)
        )
          throw Error(
            `${staffName(action.staffId)} is already in that class's crew.`,
          );
      }
      if (action.today)
        (touchDay(s, day).floaters ??= {})[b.index] = action.staffId || null;
      else if (action.staffId) s.floaters[b.index] = action.staffId;
      else delete s.floaters[b.index];
      break;
    }
    case "assign": {
      // One-day crew change from the staffing check: add a coach to a block.
      manager();
      coach(action.staffId);
      const b = blockAt(action.index);
      if (
        !coverCandidates(view(), b, at).some(
          (c) => c.staff.id === action.staffId,
        )
      )
        throw Error(`${staffName(action.staffId)} is busy or off then.`);
      const crew = crewOn(view(), b.index, at);
      const role =
        b.kind === "class"
          ? crew.some((c) => c.role === "head")
            ? "station"
            : "head"
          : "attendant";
      (touchDay(s, day).crew ??= {})[b.index] = [
        ...crew,
        { staffId: action.staffId, role },
      ];
      break;
    }
    case "rules": {
      // Expected headcounts are the manager's call; the rest is the owner's.
      const { expected, ...rest } = action.rules ?? {};
      if (Object.keys(rest).length) owner();
      else manager();
      const r = { ...s.rules, ...rest };
      if (expected !== undefined) {
        const clean = {};
        for (const [k, v] of Object.entries(expected ?? {})) {
          if (v === "" || v === null) continue;
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > 200)
            throw Error("Expected kids is a whole number up to 200.");
          clean[k] = n;
        }
        r.expected = clean;
      }
      for (const k of [
        "classMin",
        "openMin",
        "classRatio",
        "youngRatio",
        "openRatio",
      ])
        if (!Number.isInteger(r[k]) || r[k] < 1 || r[k] > 40)
          throw Error("Use whole numbers from 1 to 40.");
      if (![0, 1].includes(r.floaterPerClass))
        throw Error("Floater is on or off.");
      if (
        !Number.isInteger(r.maxOnBreak) ||
        r.maxOnBreak < 1 ||
        r.maxOnBreak > 5
      )
        throw Error("Coaches on break at once is 1 to 5.");
      if (
        !Number.isInteger(r.minShare) ||
        r.minShare < 0 ||
        r.minShare * modalities.length > 100
      )
        throw Error(
          `The minimum share is 0 to ${Math.floor(100 / modalities.length)}%.`,
        );
      s.rules = r;
      break;
    }
    case "role": {
      owner();
      const m = staff.find((x) => x.id === action.staffId);
      if (!m || m.owner) throw Error("Choose a coach.");
      if (!["coach", "manager"].includes(action.level))
        throw Error("Choose coach or gym manager.");
      s.roles = { ...(s.roles ?? {}), [m.id]: action.level };
      break;
    }
    case "request": {
      coach(action.staffId);
      self(action.staffId);
      if (!requestKinds[action.kind]) throw Error("Choose what you need.");
      const req = {
        id: crypto.randomUUID(),
        kind: action.kind,
        staffId: action.staffId,
        day,
        index: null,
        toStaffId: null,
        start: null,
        end: null,
        note: String(action.note ?? "")
          .trim()
          .slice(0, 280),
        status: "pending",
        at: new Date(now).toISOString(),
      };
      if (action.kind === "cover") {
        const b = blockAt(action.index);
        if (
          !crewOn(view(), b.index, at).some(
            (c) => c.staffId === action.staffId,
          ) &&
          floaterOn(view(), b.index, at) !== action.staffId
        )
          throw Error(`You're not on ${b.name} that day.`);
        req.index = b.index;
      }
      if (action.kind === "hours") {
        if (
          !validTime(action.start) ||
          !validTime(action.end) ||
          action.start >= action.end
        )
          throw Error("Pick new hours with the start before the end.");
        req.start = action.start;
        req.end = action.end;
      }
      if (
        s.requests.some(
          (r) =>
            r.status === "pending" &&
            r.staffId === req.staffId &&
            r.kind === req.kind &&
            r.day === req.day &&
            r.index === req.index,
        )
      )
        throw Error("You already asked for that.");
      s.requests.push(req);
      break;
    }
    case "volunteer": {
      const r = s.requests.find((x) => x.id === action.id);
      if (!r || r.status !== "pending" || r.kind !== "cover")
        throw Error("That request is closed.");
      if (r.staffId === actor.staffId)
        throw Error("Someone else has to cover it.");
      const rAt = noonOf(r.day);
      const b = blockAt(r.index, rAt);
      const kind =
        floaterOn(view(), b.index, rAt) === r.staffId ? "floater" : undefined;
      if (
        !coverCandidates(view(), b, rAt, { kind }).some(
          (c) => c.staff.id === actor.staffId,
        )
      )
        throw Error(`You're busy or off during ${b.name}.`);
      r.toStaffId = actor.staffId;
      r.volunteered = true;
      break;
    }
    case "cancelRequest": {
      const r = s.requests.find((x) => x.id === action.id);
      if (!r || r.status !== "pending") throw Error("That request is closed.");
      self(r.staffId);
      r.status = "cancelled";
      break;
    }
    case "decide": {
      manager();
      const r = s.requests.find((x) => x.id === action.id);
      if (!r || r.status !== "pending")
        throw Error("That request is already decided.");
      if (!action.approve) {
        r.status = "denied";
        r.decidedBy = actor.staffId;
        r.decidedAt = new Date(now).toISOString();
        r.reply = String(action.reply ?? "")
          .trim()
          .slice(0, 280);
        break;
      }
      const d = touchDay(s, r.day);
      const rAt = noonOf(r.day);
      if (r.kind === "cover") {
        const to = action.toStaffId ?? r.toStaffId;
        if (!to) throw Error("Pick who covers it.");
        coach(to);
        const b = blockAt(r.index, rAt);
        const asFloater = floaterOn(view(), b.index, rAt) === r.staffId;
        const free = coverCandidates(view(), b, rAt, {
          kind: asFloater ? "floater" : undefined,
        }).some((c) => c.staff.id === to);
        if (!free)
          throw Error(`${staffName(to)} is busy or off during ${b.name}.`);
        if (asFloater) (d.floaters ??= {})[b.index] = to;
        else
          (d.crew ??= {})[b.index] = crewOn(view(), b.index, rAt).map((c) =>
            c.staffId === r.staffId ? { ...c, staffId: to } : c,
          );
        r.toStaffId = to;
      }
      if (r.kind === "timeoff")
        d.off = [...new Set([...(d.off ?? []), r.staffId])];
      if (r.kind === "hours")
        (d.hours ??= {})[r.staffId] = { start: r.start, end: r.end };
      r.status = "approved";
      r.decidedBy = actor.staffId;
      r.decidedAt = new Date(now).toISOString();
      break;
    }
    default:
      throw Error("Unknown staffing action.");
  }
  return { ...state, staffing: s };
}

export const requestsFor = (state, staffId) =>
  staffingOf(state)
    .requests.filter((r) => !staffId || r.staffId === staffId)
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));

export const pendingRequests = (state) =>
  staffingOf(state).requests.filter((r) => r.status === "pending");

export function requestSummary(r) {
  if (r.kind === "cover") {
    const b = sessions(noonOf(r.day)).find((x) => x.index === r.index);
    return b ? `Cover ${b.name}, ${b.start}–${b.end}` : "Cover a block";
  }
  if (r.kind === "hours") return `Work ${r.start}–${r.end}`;
  return "Day off";
}
