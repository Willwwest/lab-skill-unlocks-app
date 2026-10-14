// Dated schedules, week by week. A manager builds a week as a draft, then
// publishes it; coaches see the published copy. A shift is one coach's
// working hours on one day plus the blocks they work in it:
//   {id, staffId, day, start, end, assignments: [{blockId, role}]}
// with role "head" | "station" | "attendant" | "floater".
// Stored in state.staffing.weeks[weekKey] = {draft, published, rev,
// publishedAt, publishedBy}. Weeks with nothing published fall back to
// the standing crew and standing hours, so nothing changes until a
// manager publishes.
import {
  addDays,
  calendarDayLabel,
  dayAt,
  toMinutes,
  weekKeyOf,
  weekdayOf,
} from "./gym-time.js";
import { withNotices } from "./outbox.js";
import { blocksOn } from "./schedule.js";
import { crewFor } from "./gym.js";
import { coaches, staff } from "./roster.js";
import {
  TRANSITION_MIN,
  minutesToTime,
  neededCoaches,
  staffingOf,
} from "./staffing.js";
import { availableFor, availabilityOf, weeklyCap } from "./availability.js";

// Minutes a coach is booked before their first block when a shift is
// built from assignments: setting up the floor.
export const PREP_MIN = 15;

export const weekOf = (state, week) => state?.staffing?.weeks?.[week] ?? null;
export const weekDays = (week) =>
  Array.from({ length: 7 }, (_, i) => addDays(week, i));

// The published shifts for a day, or null when that week isn't published.
export function publishedOn(state, day) {
  const w = weekOf(state, weekKeyOf(day));
  return w?.published ? w.published.filter((s) => s.day === day) : null;
}
export const publishedShift = (state, staffId, day) =>
  publishedOn(state, day)?.find((s) => s.staffId === staffId) ?? null;
// The crew a published week gives a block on a day (no floaters), or null.
export function publishedCrew(state, blockId, day) {
  const list = publishedOn(state, day);
  if (!list) return null;
  return list.flatMap((s) =>
    s.assignments
      .filter((a) => a.blockId === String(blockId) && a.role !== "floater")
      .map((a) => ({ staffId: s.staffId, role: a.role })),
  );
}
export function publishedFloater(state, blockId, day) {
  const list = publishedOn(state, day);
  if (!list) return undefined;
  return (
    list.find((s) =>
      s.assignments.some(
        (a) => a.blockId === String(blockId) && a.role === "floater",
      ),
    )?.staffId ?? null
  );
}

// "none", "draft" (never published), "published", or "changed"
// (published, with edits not published yet).
export function weekStatus(state, week) {
  const w = weekOf(state, week);
  if (!w) return "none";
  if (!w.published) return "draft";
  return JSON.stringify(w.draft) === JSON.stringify(w.published)
    ? "published"
    : "changed";
}
export const statusText = {
  none: "Not started",
  draft: "Draft",
  published: "Published",
  changed: "Published · unpublished changes",
};

export const shiftMinutes = (s) => toMinutes(s.end) - toMinutes(s.start);
export const draftShifts = (state, week) => weekOf(state, week)?.draft ?? [];
export function draftHours(state, week, staffId) {
  const min = draftShifts(state, week)
    .filter((s) => s.staffId === staffId)
    .reduce((n, s) => n + shiftMinutes(s), 0);
  return Math.round((min / 60) * 10) / 10;
}

const blockSpan = (block, role) => {
  const pad = role === "floater" ? TRANSITION_MIN : 0;
  return [toMinutes(block.start) - pad, toMinutes(block.end) + pad];
};
const blockOnDay = (state, day, blockId) =>
  blocksOn(state, day).find((b) => b.id === String(blockId)) ?? null;
const crewRole = (block, role) =>
  role === "floater"
    ? "floater"
    : block.kind === "class"
      ? role === "head"
        ? "head"
        : "station"
      : "attendant";

// Grow a shift to cover a block; a new shift starts PREP_MIN early.
function cover(shift, block, role, isNew) {
  const [b0, b1] = blockSpan(block, role);
  const start = isNew ? b0 - (role === "floater" ? 0 : PREP_MIN) : b0;
  shift.start = minutesToTime(Math.min(toMinutes(shift.start), start));
  shift.end = minutesToTime(Math.max(toMinutes(shift.end), b1));
}

// Start a week from standing hours and the standing crew: every coach with
// standing hours that weekday gets them, plus the blocks they normally
// work, stretched to cover a block that runs past their hours.
export function fromStanding(state, week) {
  const s = staffingOf(state);
  const out = [];
  for (const day of weekDays(week)) {
    const wd = weekdayOf(day);
    const byStaff = new Map();
    const get = (staffId) => {
      if (!byStaff.has(staffId)) {
        const st = s.shifts[staffId];
        const works = st && (!st.weekdays || st.weekdays.includes(wd));
        byStaff.set(staffId, {
          id: crypto.randomUUID(),
          staffId,
          day,
          start: works ? st.start : null,
          end: works ? st.end : null,
          assignments: [],
        });
      }
      return byStaff.get(staffId);
    };
    for (const c of coaches) {
      const st = s.shifts[c.id];
      if (st && (!st.weekdays || st.weekdays.includes(wd))) get(c.id);
    }
    for (const b of blocksOn(state, day)) {
      const roles = crewFor(state, b.id).map((c) => [c.staffId, c.role]);
      const fl = s.floaters[b.id];
      if (b.kind === "class" && fl) roles.push([fl, "floater"]);
      for (const [staffId, role] of roles) {
        // The standing crew only applies on days the coach normally works;
        // other days are left for the manager to fill.
        if (!byStaff.has(staffId)) continue;
        const sh = get(staffId);
        const isNew = sh.start === null;
        if (isNew) {
          const [b0, b1] = blockSpan(b, role);
          sh.start = minutesToTime(b0 - (role === "floater" ? 0 : PREP_MIN));
          sh.end = minutesToTime(b1);
        } else cover(sh, b, role, false);
        sh.assignments.push({ blockId: b.id, role: crewRole(b, role) });
      }
    }
    out.push(...byStaff.values());
  }
  return out;
}

// Copy last week onto this one, dropping blocks that don't run any more.
export function fromLastWeek(state, week) {
  const prev = weekOf(state, addDays(week, -7));
  const src = prev?.published ?? prev?.draft ?? [];
  return src.map((s) => {
    const day = addDays(s.day, 7);
    const runs = new Set(blocksOn(state, day).map((b) => b.id));
    return {
      ...s,
      id: crypto.randomUUID(),
      day,
      assignments: s.assignments.filter((a) => runs.has(a.blockId)),
    };
  });
}

// Coaches who could take a block in the draft, best first.
export function suggestFor(state, week, day, blockId, role = "station") {
  const block = blockOnDay(state, day, blockId);
  if (!block) return [];
  const [b0, b1] = blockSpan(block, role);
  const shifts = draftShifts(state, week).filter((s) => s.day === day);
  const cap = weeklyCap(state);
  const off = staffingOf(state).days?.[day]?.off ?? [];
  return coaches
    .map((c) => {
      const mine = shifts.find((s) => s.staffId === c.id);
      if (mine?.assignments.some((a) => a.blockId === block.id)) return null;
      const clash = mine?.assignments.some((a) => {
        const other = blockOnDay(state, day, a.blockId);
        if (!other) return false;
        const [o0, o1] = blockSpan(other, a.role);
        return o0 < b1 && b0 < o1;
      });
      if (clash) return null;
      const avail = availableFor(state, c.id, day, b0, b1);
      const adds = mine
        ? Math.max(0, toMinutes(mine.start) - b0) +
          Math.max(0, b1 - toMinutes(mine.end))
        : b1 - b0 + PREP_MIN;
      const hours = draftHours(state, week, c.id) + adds / 60;
      const a = availabilityOf(state, c.id);
      const overMax = hours > cap || (a.maxHours != null && hours > a.maxHours);
      const underMin = a.minHours != null && hours - adds / 60 < a.minHours;
      return {
        staff: c,
        available: avail.ok && !off.includes(c.id),
        why: off.includes(c.id) ? "Has the day off" : avail.reason,
        onShift: !!mine,
        addsMinutes: adds,
        hours: Math.round(hours * 10) / 10,
        overMax,
        underMin,
      };
    })
    .filter(Boolean)
    .sort(
      (x, y) =>
        Number(!x.available) - Number(!y.available) ||
        Number(x.overMax) - Number(y.overMax) ||
        Number(y.underMin) - Number(x.underMin) ||
        Number(y.onShift) - Number(x.onShift) ||
        x.addsMinutes - y.addsMinutes,
    );
}

// Problems in a draft week: thin blocks, missing heads, people booked
// outside their availability or on a day off, double bookings, and hours
// over the cap or outside a coach's range.
export function weekConflicts(state, week) {
  const out = [];
  const shifts = draftShifts(state, week);
  if (!shifts.length) return out;
  const s = staffingOf(state);
  for (const day of weekDays(week)) {
    const today = shifts.filter((x) => x.day === day);
    for (const b of blocksOn(state, day)) {
      const crew = today.flatMap((x) =>
        x.assignments
          .filter((a) => a.blockId === b.id && a.role !== "floater")
          .map((a) => a.role),
      );
      const { need } = neededCoaches(state, { ...b, index: b.id });
      if (crew.length < need)
        out.push({
          tone: "bad",
          day,
          blockId: b.id,
          text: `${b.name}: ${crew.length} of ${need} coaches`,
        });
      if (b.kind === "class" && crew.length && !crew.includes("head"))
        out.push({
          tone: "bad",
          day,
          blockId: b.id,
          text: `${b.name}: no head coach`,
        });
    }
    for (const x of today) {
      const name = staff.find((p) => p.id === x.staffId)?.name ?? "Coach";
      if ((s.days?.[day]?.off ?? []).includes(x.staffId))
        out.push({
          tone: "bad",
          day,
          staffId: x.staffId,
          text: `${name} has the day off`,
        });
      const avail = availableFor(state, x.staffId, day, x.start, x.end);
      if (!avail.ok)
        out.push({
          tone: "warn",
          day,
          staffId: x.staffId,
          text: `${name}: ${avail.reason.toLowerCase()}`,
        });
      const spans = x.assignments
        .map((a) => {
          const blk = blockOnDay(state, day, a.blockId);
          return blk ? blockSpan(blk, a.role) : null;
        })
        .filter(Boolean)
        .sort((p, q) => p[0] - q[0]);
      for (let i = 1; i < spans.length; i++)
        if (spans[i][0] < spans[i - 1][1])
          out.push({
            tone: "bad",
            day,
            staffId: x.staffId,
            text: `${name} is booked on two blocks at once`,
          });
    }
  }
  const cap = weeklyCap(state);
  for (const c of coaches) {
    const h = draftHours(state, week, c.id);
    const a = availabilityOf(state, c.id);
    if (h > cap)
      out.push({
        tone: "bad",
        staffId: c.id,
        text: `${c.name}: ${h} h, over the ${cap} h cap`,
      });
    else if (a.maxHours != null && h > a.maxHours)
      out.push({
        tone: "warn",
        staffId: c.id,
        text: `${c.name}: ${h} h, over their ${a.maxHours} h max`,
      });
    else if (a.minHours != null && h < a.minHours)
      out.push({
        tone: "warn",
        staffId: c.id,
        text: `${c.name}: ${h} h, under their ${a.minHours} h minimum`,
      });
  }
  return out;
}

/* ---------- Actions ---------- */

const dayRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

export function applyShifts(state, action, now = new Date()) {
  const actor = action.actor ?? {};
  if (actor.role !== "Coach" || !actor.staffId)
    throw Error("Sign in as a coach first.");
  if (!actor.head) throw Error("Only a gym manager builds the schedule.");
  const week = action.week;
  if (!dayRe.test(week ?? "") || weekKeyOf(week) !== week)
    throw Error("Choose a week.");
  const s = structuredClone(staffingOf(state));
  const weeks = (s.weeks ??= {});
  const w = weeks[week] ?? { draft: [], published: null, rev: 0 };
  const view = () => ({
    ...state,
    staffing: { ...s, weeks: { ...weeks, [week]: w } },
  });
  const findShift = (id) => {
    const x = w.draft.find((y) => y.id === id);
    if (!x) throw Error("That shift is gone.");
    return x;
  };
  const inWeek = (day) => {
    if (!weekDays(week).includes(day)) throw Error("Pick a day in this week.");
  };
  switch (action.type) {
    case "startWeek": {
      if (w.draft.length && !action.replace)
        throw Error("This week already has a draft.");
      w.draft =
        action.from === "lastWeek"
          ? fromLastWeek(state, week)
          : fromStanding(state, week);
      if (!w.draft.length) throw Error("Nothing to copy from last week.");
      break;
    }
    case "assign": {
      inWeek(action.day);
      const block = blockOnDay(state, action.day, action.blockId);
      if (!block) throw Error("That block doesn't run that day.");
      if (!coaches.some((c) => c.id === action.staffId))
        throw Error("Choose a coach.");
      const role = crewRole(
        block,
        action.role ??
          (block.kind === "class" &&
          !w.draft.some(
            (x) =>
              x.day === action.day &&
              x.assignments.some(
                (a) => a.blockId === block.id && a.role === "head",
              ),
          )
            ? "head"
            : "station"),
      );
      let sh = w.draft.find(
        (x) => x.day === action.day && x.staffId === action.staffId,
      );
      if (sh?.assignments.some((a) => a.blockId === block.id))
        throw Error("Already on that block.");
      if (!sh) {
        const [b0, b1] = blockSpan(block, role);
        sh = {
          id: crypto.randomUUID(),
          staffId: action.staffId,
          day: action.day,
          start: minutesToTime(b0 - (role === "floater" ? 0 : PREP_MIN)),
          end: minutesToTime(b1),
          assignments: [],
        };
        w.draft.push(sh);
      } else cover(sh, block, role, false);
      if (role === "head")
        for (const x of w.draft)
          if (x.day === action.day)
            for (const a of x.assignments)
              if (a.blockId === block.id && a.role === "head")
                a.role = "station";
      sh.assignments.push({ blockId: block.id, role });
      break;
    }
    case "unassign": {
      const sh = findShift(action.id);
      sh.assignments = sh.assignments.filter(
        (a) => a.blockId !== String(action.blockId),
      );
      break;
    }
    case "shiftTimes": {
      const sh = findShift(action.id);
      if (!timeRe.test(action.start ?? "") || !timeRe.test(action.end ?? ""))
        throw Error("Use times like 09:30.");
      if (action.start >= action.end) throw Error("Start before the end.");
      for (const a of sh.assignments) {
        const blk = blockOnDay(state, sh.day, a.blockId);
        const [b0, b1] = blk ? blockSpan(blk, a.role) : [0, 0];
        if (blk && (toMinutes(action.start) > b0 || toMinutes(action.end) < b1))
          throw Error(`The shift has to cover ${blk.name}.`);
      }
      sh.start = action.start;
      sh.end = action.end;
      break;
    }
    case "addShift": {
      inWeek(action.day);
      if (!coaches.some((c) => c.id === action.staffId))
        throw Error("Choose a coach.");
      if (
        w.draft.some(
          (x) => x.day === action.day && x.staffId === action.staffId,
        )
      )
        throw Error("They already have a shift that day.");
      if (
        !timeRe.test(action.start ?? "") ||
        !timeRe.test(action.end ?? "") ||
        action.start >= action.end
      )
        throw Error("Start before the end.");
      w.draft.push({
        id: crypto.randomUUID(),
        staffId: action.staffId,
        day: action.day,
        start: action.start,
        end: action.end,
        assignments: [],
      });
      break;
    }
    case "removeShift": {
      findShift(action.id);
      w.draft = w.draft.filter((x) => x.id !== action.id);
      break;
    }
    // Fill thin blocks with the best-fitting coach until each has the
    // coaches it needs. Coaches who can't work it or would go over their
    // hours are skipped.
    case "autoFill": {
      let added = 0;
      for (const day of weekDays(week))
        for (const b of blocksOn(state, day)) {
          const { need } = neededCoaches(view(), { ...b, index: b.id });
          for (let guard = 0; guard < 6; guard++) {
            const have = w.draft.filter(
              (x) =>
                x.day === day &&
                x.assignments.some(
                  (a) => a.blockId === b.id && a.role !== "floater",
                ),
            ).length;
            if (have >= need) break;
            const pick = suggestFor(view(), week, day, b.id).find(
              (c) => c.available && !c.overMax,
            );
            if (!pick) break;
            const next = applyShifts(
              view(),
              {
                type: "assign",
                actor,
                week,
                day,
                blockId: b.id,
                staffId: pick.staff.id,
              },
              now,
            );
            w.draft = next.staffing.weeks[week].draft;
            added++;
          }
        }
      if (!added) throw Error("Every block already has its coaches.");
      break;
    }
    case "publish": {
      if (!w.draft.length) throw Error("Build the week first.");
      const bad = weekConflicts(view(), week).filter((c) => c.tone === "bad");
      if (bad.length && !action.force)
        throw Error(`${bad.length} problems to fix first: ${bad[0].text}.`);
      w.published = structuredClone(w.draft);
      w.rev = (w.rev ?? 0) + 1;
      w.publishedAt = new Date(now).toISOString();
      w.publishedBy = actor.staffId;
      break;
    }
    case "discardChanges": {
      if (!w.published) throw Error("Nothing is published yet.");
      w.draft = structuredClone(w.published);
      break;
    }
    default:
      throw Error("Unknown schedule action.");
  }
  weeks[week] = w;
  const next = { ...state, staffing: s };
  if (action.type !== "publish") return next;
  // Everyone on the week hears it's out.
  const to = [...new Set(w.published.map((x) => x.staffId).filter(Boolean))];
  return withNotices(
    next,
    [
      {
        kind: "week.published",
        to,
        text: `Your schedule for the week of ${calendarDayLabel(week)} is ${w.rev > 1 ? "updated" : "out"}.`,
      },
    ],
    now,
  );
}

// The day as an instant, for selectors that take one.
export const dayInstant = dayAt;
