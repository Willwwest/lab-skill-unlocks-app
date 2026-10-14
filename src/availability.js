// When coaches can work and how many hours a week they want.
// Stored in state.staffing.availability[staffId]:
//   weekly:   [{weekday, start, end}]  windows by ISO weekday. A weekday with
//             no window is a day they can't work. No windows at all means
//             "any time".
//   dated:    [{id, from, to, note}]   days they can't work (no approval)
//   minHours, maxHours                 the weekly range they'd like
// A manager's cap (rules.maxWeekly, default 40) sits above everyone's max
// so nobody slides into overtime by accident.
import { addDays, toMinutes, weekdayOf } from "./gym-time.js";
import { dayAt } from "./gym-time.js";
import { shiftOn, staffingOf } from "./staffing.js";

export const MAX_WEEKLY = 40;

export const availabilityOf = (state, staffId) => {
  const a = staffingOf(state).availability?.[staffId];
  return {
    weekly: a?.weekly ?? [],
    dated: a?.dated ?? [],
    minHours: a?.minHours ?? null,
    maxHours: a?.maxHours ?? null,
    updatedAt: a?.updatedAt ?? null,
  };
};
export const weeklyCap = (state) =>
  staffingOf(state).rules.maxWeekly ?? MAX_WEEKLY;

// Can a coach work this stretch of a day? `{ok, reason}`.
export function availableFor(state, staffId, day, start, end) {
  const a = availabilityOf(state, staffId);
  const away = a.dated.find((d) => day >= d.from && day <= d.to);
  if (away)
    return {
      ok: false,
      reason: away.note ? `Can't work: ${away.note}` : "Marked can't work",
    };
  if (!a.weekly.length) return { ok: true, reason: null };
  const wd = weekdayOf(day);
  const windows = a.weekly.filter((w) => w.weekday === wd);
  if (!windows.length) return { ok: false, reason: "Not available that day" };
  const s = typeof start === "number" ? start : toMinutes(start);
  const e = typeof end === "number" ? end : toMinutes(end);
  const fits = windows.some(
    (w) => toMinutes(w.start) <= s && toMinutes(w.end) >= e,
  );
  return fits
    ? { ok: true, reason: null }
    : { ok: false, reason: "Outside their available hours" };
}

// Hours a coach is booked for in the week starting `weekKey` (a Monday).
export function weekHours(state, staffId, weekKey) {
  let minutes = 0;
  for (let i = 0; i < 7; i++) {
    const shift = shiftOn(state, staffId, dayAt(addDays(weekKey, i)));
    if (shift) minutes += toMinutes(shift.end) - toMinutes(shift.start);
  }
  return Math.round((minutes / 60) * 10) / 10;
}

// Where a coach's week sits against the range they asked for and the
// manager's cap: "under", "ok", "over" (above their max) or "cap"
// (above the cap), or "none" when they haven't set a range.
export function hoursBand(state, staffId, weekKey, extraHours = 0) {
  const a = availabilityOf(state, staffId);
  const cap = weeklyCap(state);
  const hours =
    Math.round((weekHours(state, staffId, weekKey) + extraHours) * 10) / 10;
  const status =
    hours > cap
      ? "cap"
      : a.maxHours != null && hours > a.maxHours
        ? "over"
        : a.minHours != null && hours < a.minHours
          ? "under"
          : a.minHours == null && a.maxHours == null
            ? "none"
            : "ok";
  return { hours, min: a.minHours, max: a.maxHours, cap, status };
}

export const bandText = {
  under: "Under their range",
  ok: "In their range",
  over: "Over their max",
  cap: "Over the weekly cap",
  none: "No range set",
};
