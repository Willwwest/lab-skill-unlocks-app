// Payroll: pay periods, overtime and sick time from the time clock, and
// the CSV a payroll provider imports. Settings and pay rates are the
// owner's (state.pay):
//   {periodKind: "weekly" | "biweekly", anchor: Monday day key,
//    otWeeklyHours, sickPerHours, sickCapHours,
//    people: {staffId: {payrollId, rate}}, periods: [{start, end, status,
//    exportedAt, exportedBy}]}
// Overtime is anything over 40 hours in a workweek (federal rule; Arizona
// has no daily overtime). Arizona earned sick time accrues one hour for
// every 30 worked.
import { addDays, gymDayKey, weekKeyOf } from "./gym-time.js";
import { coaches, staff } from "./roster.js";
import { entriesOf, paidMinutes, timeOf } from "./timeclock.js";

export const defaultPay = {
  periodKind: "biweekly",
  anchor: "2026-10-05",
  otWeeklyHours: 40,
  sickPerHours: 30,
  sickCapHours: 24,
  people: {},
  periods: [],
};
export const payOf = (state) => ({ ...defaultPay, ...(state?.pay ?? {}) });

const daysBetween = (a, b) =>
  Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000,
  );

// The pay period a day falls in.
export function periodOf(state, day) {
  const p = payOf(state);
  const len = p.periodKind === "weekly" ? 7 : 14;
  const offset = Math.floor(daysBetween(p.anchor, day) / len) * len;
  const start = addDays(p.anchor, offset);
  return { start, end: addDays(start, len - 1) };
}
export const periodStatus = (state, start) =>
  payOf(state).periods.find((x) => x.start === start)?.status ?? "open";

const hours = (m) => Math.round((m / 60) * 100) / 100;

// Paid minutes per coach per workweek inside a period, split into regular
// and overtime by workweek.
export function payrollRows(state, start, end, now = new Date()) {
  const p = payOf(state);
  const { settings } = timeOf(state);
  return coaches.map((c) => {
    const entries = entriesOf(state, c.id).filter(
      (e) => e.day >= start && e.day <= end,
    );
    const byWeek = new Map();
    for (const e of entries) {
      const w = weekKeyOf(e.day);
      byWeek.set(w, (byWeek.get(w) ?? 0) + paidMinutes(e, settings, now));
    }
    let regular = 0;
    let overtime = 0;
    for (const m of byWeek.values()) {
      const cap = p.otWeeklyHours * 60;
      regular += Math.min(m, cap);
      overtime += Math.max(0, m - cap);
    }
    const [first, ...rest] = c.name.replace("Coach ", "").split(" ");
    const who = p.people[c.id] ?? {};
    return {
      staffId: c.id,
      payrollId: who.payrollId ?? "",
      firstName: first,
      lastName: rest.join(" "),
      regular: hours(regular),
      overtime: hours(overtime),
      total: hours(regular + overtime),
      unapproved: entries.filter((e) => !e.approvedAt).length,
      open: entries.filter((e) => !e.out).length,
      rate: who.rate ?? null,
      gross:
        who.rate != null
          ? Math.round(
              (hours(regular) * who.rate + hours(overtime) * who.rate * 1.5) *
                100,
            ) / 100
          : null,
    };
  });
}

// Earned sick hours for a coach in a calendar year.
export function sickAccrued(state, staffId, year) {
  const p = payOf(state);
  const { settings } = timeOf(state);
  const worked = entriesOf(state, staffId)
    .filter((e) => e.day.startsWith(String(year)))
    .reduce((n, e) => n + paidMinutes(e, settings), 0);
  return Math.min(p.sickCapHours, Math.floor(worked / 60 / p.sickPerHours));
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows) =>
  rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

export function payrollCsv(state, start, end, now = new Date()) {
  const rows = payrollRows(state, start, end, now).filter((r) => r.total > 0);
  return toCsv([
    [
      "payroll_id",
      "first_name",
      "last_name",
      "period_start",
      "period_end",
      "regular_hours",
      "overtime_hours",
      "total_hours",
      "unapproved_entries",
    ],
    ...rows.map((r) => [
      r.payrollId,
      r.firstName,
      r.lastName,
      start,
      end,
      r.regular.toFixed(2),
      r.overtime.toFixed(2),
      r.total.toFixed(2),
      r.unapproved,
    ]),
  ]);
}

/* ---------- Actions ---------- */

export function applyPay(state, action, now = new Date()) {
  const actor = action.actor ?? {};
  if (actor.role !== "Coach" || !actor.owner)
    throw Error("Only an owner can change pay settings or export payroll.");
  const p = structuredClone(payOf(state));
  switch (action.type) {
    case "paySettings": {
      const next = { ...p, ...action.settings };
      if (!["weekly", "biweekly"].includes(next.periodKind))
        throw Error("Pay weekly or every two weeks.");
      if (weekKeyOf(next.anchor) !== next.anchor)
        throw Error("Pay periods start on a Monday.");
      for (const k of ["otWeeklyHours", "sickPerHours", "sickCapHours"])
        if (!(Number(next[k]) > 0 && Number(next[k]) <= 80))
          throw Error("Use hours from 1 to 80.");
      Object.assign(p, next);
      break;
    }
    case "person": {
      if (!staff.some((s) => s.id === action.staffId))
        throw Error("Choose a coach.");
      const rate =
        action.rate === "" || action.rate == null ? null : Number(action.rate);
      if (rate != null && !(rate >= 0 && rate < 1000))
        throw Error("Enter an hourly rate.");
      p.people[action.staffId] = {
        payrollId: String(action.payrollId ?? "")
          .trim()
          .slice(0, 40),
        rate,
      };
      break;
    }
    // Exporting locks the period so nobody edits hours after payroll ran.
    case "exportPeriod": {
      const rows = payrollRows(state, action.start, action.end, now);
      if (rows.some((r) => r.open))
        throw Error("Someone is still clocked in for this period.");
      p.periods = p.periods.filter((x) => x.start !== action.start);
      p.periods.push({
        start: action.start,
        end: action.end,
        status: "exported",
        exportedAt: new Date(now).toISOString(),
        exportedBy: actor.staffId,
      });
      break;
    }
    default:
      throw Error("Unknown pay action.");
  }
  return { ...state, pay: p };
}

export const today = (now = new Date()) => gymDayKey(now);
