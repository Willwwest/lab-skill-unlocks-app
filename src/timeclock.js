// The time clock: coaches clock in and out on their phone, take breaks,
// and managers fix mistakes with a reason that is kept. Stored in
// state.time:
//   entries: [{id, staffId, day, in, out, source, breaks: [{start, end}],
//              late, unscheduled, edits: [{by, at, reason, before, after}],
//              approvedBy, approvedAt}]
//   settings: {earlyMin, graceMin, paidBreakUnder}
// In the database the clock uses server time; here it uses the device's,
// so treat this as a trial until it's on the server.
import {
  addDays,
  dayAt,
  gymDayKey,
  gymLocalIso,
  gymMinutes,
  toMinutes,
} from "./gym-time.js";
import { shiftOn } from "./staffing.js";
import { coaches, staff } from "./roster.js";

export const TIME_VERSION = 1;
export const defaultTimeSettings = {
  earlyMin: 10, // how early a coach may clock in before their shift
  graceMin: 5, // minutes after the start before they count as late
  paidBreakUnder: 20, // breaks shorter than this are paid
};

export const timeOf = (state) => ({
  version: TIME_VERSION,
  entries: state?.time?.entries ?? [],
  settings: { ...defaultTimeSettings, ...(state?.time?.settings ?? {}) },
});
export const entriesOf = (state, staffId) =>
  timeOf(state).entries.filter((e) => !staffId || e.staffId === staffId);
export const openEntry = (state, staffId) =>
  entriesOf(state, staffId).find((e) => !e.out) ?? null;
const onBreak = (e) => e?.breaks?.some((b) => !b.end);

const ms = (iso) => Date.parse(iso);
const mins = (a, b) => Math.max(0, Math.round((ms(b) - ms(a)) / 60000));

// Minutes a time entry pays for: in to out (or now), minus breaks that
// run at least `paidBreakUnder` minutes.
export function paidMinutes(
  e,
  settings = defaultTimeSettings,
  now = new Date(),
) {
  const end = e.out ?? new Date(now).toISOString();
  let total = mins(e.in, end);
  for (const b of e.breaks ?? []) {
    const len = mins(b.start, b.end ?? end);
    if (len >= settings.paidBreakUnder) total -= len;
  }
  return Math.max(0, total);
}

// Where a coach is on the clock right now: "in", "break", "out",
// "late" (their shift started and they haven't clocked in) or "off".
export function clockStatus(state, staffId, at = new Date()) {
  const e = openEntry(state, staffId);
  if (e) return { status: onBreak(e) ? "break" : "in", entry: e };
  const shift = shiftOn(state, staffId, at);
  if (!shift) return { status: "off", shift: null };
  const { graceMin } = timeOf(state).settings;
  const now = gymMinutes(at);
  const day = gymDayKey(at);
  const worked = entriesOf(state, staffId).some((x) => x.day === day);
  if (
    !worked &&
    now > toMinutes(shift.start) + graceMin &&
    now < toMinutes(shift.end)
  )
    return { status: "late", shift };
  return { status: "out", shift };
}
export const clockText = {
  in: "Clocked in",
  break: "On break",
  out: "Clocked out",
  late: "Not clocked in",
  off: "Not scheduled",
};

// Scheduled against worked, day by day, for one coach's week.
export function timesheet(state, staffId, week, now = new Date()) {
  const { settings, entries: all } = timeOf(state);
  // Before the clock was first used there's nothing to have missed.
  const inUse = all.length > 0;
  const firstDay = all.reduce((d, e) => (e.day < d ? e.day : d), "9999");
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).map(
    (day) => {
      const shift = shiftOn(state, staffId, new Date(dayAt(day)));
      const entries = entriesOf(state, staffId).filter((e) => e.day === day);
      const scheduled = shift
        ? toMinutes(shift.end) - toMinutes(shift.start)
        : 0;
      const worked = entries.reduce(
        (n, e) => n + paidMinutes(e, settings, now),
        0,
      );
      return {
        day,
        shift,
        entries,
        scheduled,
        worked,
        flags: [
          ...(entries.some((e) => e.late) ? ["Late"] : []),
          ...(entries.some((e) => e.unscheduled) ? ["Not scheduled"] : []),
          ...(entries.some((e) => !e.out) && day < gymDayKey(now)
            ? ["No clock-out"]
            : []),
          ...(shift &&
          !entries.length &&
          inUse &&
          day >= firstDay &&
          day < gymDayKey(now)
            ? ["Missed shift"]
            : []),
          ...(entries.some((e) => e.edits?.length) ? ["Edited"] : []),
        ],
      };
    },
  );
  const scheduled = days.reduce((n, d) => n + d.scheduled, 0);
  const worked = days.reduce((n, d) => n + d.worked, 0);
  const entries = days.flatMap((d) => d.entries);
  return {
    days,
    scheduled,
    worked,
    approved: entries.length > 0 && entries.every((e) => e.approvedAt),
  };
}

/* ---------- Actions ---------- */

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
// "2026-10-12" + "09:30" → an instant on the gym's clock.
const instant = (day, hhmm) => new Date(gymLocalIso(day, hhmm)).toISOString();

export function applyTime(state, action, now = new Date()) {
  const actor = action.actor ?? {};
  if (actor.role !== "Coach" || !actor.staffId)
    throw Error("Sign in as a coach first.");
  const t = structuredClone(timeOf(state));
  const at = new Date(now).toISOString();
  const day = gymDayKey(now);
  const self = (id) => {
    if (id !== actor.staffId && !actor.head)
      throw Error("You can only clock yourself in.");
  };
  const manager = () => {
    if (!actor.head) throw Error("Only a gym manager can change time records.");
  };
  const coach = (id) => {
    if (!coaches.some((c) => c.id === id)) throw Error("Choose a coach.");
  };
  const find = (id) => {
    const e = t.entries.find((x) => x.id === id);
    if (!e) throw Error("That time record is gone.");
    return e;
  };
  switch (action.type) {
    case "clockIn": {
      coach(action.staffId);
      self(action.staffId);
      if (t.entries.some((e) => e.staffId === action.staffId && !e.out))
        throw Error("You're already clocked in.");
      const shift = shiftOn(state, action.staffId, now);
      const minute = gymMinutes(now);
      const e = {
        id: crypto.randomUUID(),
        staffId: action.staffId,
        day,
        in: at,
        out: null,
        source: action.source ?? "phone",
        breaks: [],
        edits: [],
      };
      // No shift today, or it's already over: flagged, not "late".
      if (!shift || minute >= toMinutes(shift.end)) e.unscheduled = true;
      else {
        const from = toMinutes(shift.start) - t.settings.earlyMin;
        if (minute < from)
          throw Error(
            `Your shift starts at ${shift.start}. You can clock in ${t.settings.earlyMin} minutes before.`,
          );
        const late = minute - toMinutes(shift.start);
        if (late > t.settings.graceMin) e.late = late;
      }
      t.entries.push(e);
      break;
    }
    case "clockOut": {
      self(action.staffId);
      const e = t.entries.find((x) => x.staffId === action.staffId && !x.out);
      if (!e) throw Error("You aren't clocked in.");
      for (const b of e.breaks) if (!b.end) b.end = at;
      e.out = at;
      break;
    }
    case "breakStart": {
      self(action.staffId);
      const e = t.entries.find((x) => x.staffId === action.staffId && !x.out);
      if (!e) throw Error("Clock in first.");
      if (onBreak(e)) throw Error("You're already on a break.");
      e.breaks.push({ start: at, end: null });
      break;
    }
    case "breakEnd": {
      self(action.staffId);
      const e = t.entries.find((x) => x.staffId === action.staffId && !x.out);
      const b = e?.breaks.find((x) => !x.end);
      if (!b) throw Error("You aren't on a break.");
      b.end = at;
      break;
    }
    // A manager fixes a record. The reason and the old times are kept.
    case "editEntry": {
      manager();
      const e = find(action.id);
      const reason = String(action.reason ?? "").trim();
      if (!reason) throw Error("Say why the time is changing.");
      if (
        !timeRe.test(action.in ?? "") ||
        (action.out && !timeRe.test(action.out))
      )
        throw Error("Use times like 09:30.");
      const nextIn = instant(e.day, action.in);
      const nextOut = action.out ? instant(e.day, action.out) : null;
      if (nextOut && nextOut <= nextIn)
        throw Error("Clock-out has to be after clock-in.");
      e.edits.push({
        by: actor.staffId,
        at,
        reason: reason.slice(0, 200),
        before: { in: e.in, out: e.out },
        after: { in: nextIn, out: nextOut },
      });
      e.in = nextIn;
      e.out = nextOut;
      for (const b of e.breaks) if (!b.end && nextOut) b.end = nextOut;
      delete e.approvedAt;
      delete e.approvedBy;
      break;
    }
    // A missed punch, entered by a manager.
    case "addEntry": {
      manager();
      coach(action.staffId);
      const reason = String(action.reason ?? "").trim();
      if (!reason) throw Error("Say why you're adding the time.");
      if (!dayRe.test(action.day ?? "")) throw Error("Choose a day.");
      if (
        !timeRe.test(action.in ?? "") ||
        !timeRe.test(action.out ?? "") ||
        action.out <= action.in
      )
        throw Error("Clock-out has to be after clock-in.");
      t.entries.push({
        id: crypto.randomUUID(),
        staffId: action.staffId,
        day: action.day,
        in: instant(action.day, action.in),
        out: instant(action.day, action.out),
        source: "manager",
        breaks: [],
        edits: [
          {
            by: actor.staffId,
            at,
            reason: reason.slice(0, 200),
            before: null,
            after: null,
          },
        ],
      });
      break;
    }
    case "approve": {
      manager();
      const ids = new Set(action.ids ?? []);
      const list = t.entries.filter((e) => ids.has(e.id));
      if (!list.length) throw Error("Nothing to approve.");
      if (list.some((e) => !e.out)) throw Error("Someone is still clocked in.");
      for (const e of list) {
        e.approvedBy = actor.staffId;
        e.approvedAt = at;
      }
      break;
    }
    case "timeSettings": {
      if (!actor.owner) throw Error("Only an owner can change this.");
      for (const k of ["earlyMin", "graceMin", "paidBreakUnder"]) {
        const v = Number(action.settings?.[k] ?? t.settings[k]);
        if (!Number.isInteger(v) || v < 0 || v > 60)
          throw Error("Use whole minutes from 0 to 60.");
        t.settings[k] = v;
      }
      break;
    }
    default:
      throw Error("Unknown time action.");
  }
  return { ...state, time: t };
}

export const staffNameOf = (id) =>
  staff.find((s) => s.id === id)?.name ?? "Coach";
