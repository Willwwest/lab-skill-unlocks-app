import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub, sessions } from "./club.js";
import { emptyFloor } from "./floor.js";
import { crewOn, myBlocks, seedGym } from "./gym.js";
import { dayAt } from "./gym-time.js";
import {
  applyShifts,
  draftHours,
  draftShifts,
  publishedOn,
  suggestFor,
  weekConflicts,
  weekStatus,
} from "./shifts.js";
import { applyStaffing, floaterOn, seedStaffing, shiftOn } from "./staffing.js";
import { weekHours } from "./availability.js";

// Monday 2026-10-12, 9:45 am in Phoenix. The next week starts the 19th.
const now = new Date("2026-10-12T16:45:00Z");
const WEEK = "2026-10-19";
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(now),
  staffing: seedStaffing(now),
});
const coach = (id, extra = {}) => ({
  role: "Coach",
  name: `Coach ${id[0].toUpperCase()}${id.slice(1)}`,
  staffId: id,
  head: false,
  ...extra,
});
const alex = coach("alex", { head: true });
const build = (s, action) =>
  applyShifts(s, { actor: alex, week: WEEK, ...action }, now);
const tue = new Date(dayAt("2026-10-20"));

test("only managers build weeks, and weeks start on Monday", () => {
  assert.throws(
    () =>
      applyShifts(
        base(),
        { type: "startWeek", actor: coach("sam"), week: WEEK },
        now,
      ),
    /gym manager/,
  );
  assert.throws(
    () =>
      applyShifts(
        base(),
        { type: "startWeek", actor: alex, week: "2026-10-20" },
        now,
      ),
    /Choose a week/,
  );
});

test("a week starts from standing hours and the standing crew", () => {
  const s = build(base(), { type: "startWeek" });
  assert.equal(weekStatus(s, WEEK), "draft");
  const shifts = draftShifts(s, WEEK);
  const priyaTue = shifts.find(
    (x) => x.staffId === "priya" && x.day === "2026-10-20",
  );
  assert.deepEqual([priyaTue.start, priyaTue.end], ["09:30", "18:00"]);
  assert.ok(priyaTue.assignments.some((a) => a.blockId === "0"));
  // Nobody works Sunday by default, so Sunday's blocks are left to fill.
  assert.equal(shifts.filter((x) => x.day === "2026-10-25").length, 0);
  assert.ok(
    weekConflicts(s, WEEK).some(
      (c) => c.day === "2026-10-25" && /0 of/.test(c.text),
    ),
  );
  // Nothing changes for coaches until it's published.
  assert.equal(publishedOn(s, "2026-10-20"), null);
  assert.throws(() => build(s, { type: "startWeek" }), /already has a draft/);
});

test("assigning a coach builds or stretches their shift, and suggestions rank fits first", () => {
  let s = build(base(), { type: "startWeek" });
  const day = "2026-10-20";
  const picks = suggestFor(s, WEEK, day, "3");
  assert.ok(picks.length > 0);
  assert.ok(picks[0].available);
  // Riley isn't booked on evening open gym; adding Riley stretches the day.
  s = build(s, { type: "assign", day, blockId: "3", staffId: "riley" });
  const riley = draftShifts(s, WEEK).find(
    (x) => x.staffId === "riley" && x.day === day,
  );
  assert.equal(riley.end, "20:00");
  assert.ok(
    riley.assignments.some((a) => a.blockId === "3" && a.role === "attendant"),
  );
  assert.throws(
    () => build(s, { type: "assign", day, blockId: "3", staffId: "riley" }),
    /Already/,
  );
  // A shift can't be cut so it no longer covers its blocks.
  assert.throws(
    () =>
      build(s, {
        type: "shiftTimes",
        id: riley.id,
        start: "09:30",
        end: "18:00",
      }),
    /cover Evening open gym/,
  );
  s = build(s, { type: "unassign", id: riley.id, blockId: "3" });
  s = build(s, {
    type: "shiftTimes",
    id: riley.id,
    start: "09:30",
    end: "18:00",
  });
  assert.equal(draftHours(s, WEEK, "riley"), 42.5);
});

test("conflicts flag thin blocks, days off and hours over the cap; publish waits for them", () => {
  let s = build(base(), { type: "startWeek" });
  const day = "2026-10-20";
  const jordan = draftShifts(s, WEEK).find(
    (x) => x.staffId === "jordan" && x.day === day,
  );
  s = build(s, { type: "unassign", id: jordan.id, blockId: "0" });
  const list = weekConflicts(s, WEEK);
  assert.ok(
    list.some(
      (c) => c.day === day && /Ninja foundations: no head coach/.test(c.text),
    ),
  );
  // Sam works 9:30–6:30 five days: 45 h is over the 40 h cap.
  assert.ok(list.some((c) => /Sam: 45 h, over the 40 h cap/.test(c.text)));
  assert.throws(() => build(s, { type: "publish" }), /problems to fix first/);
  s = build(s, { type: "publish", force: true });
  assert.equal(weekStatus(s, WEEK), "published");
});

test("a published week drives who is on the floor and who works when", () => {
  let s = build(base(), { type: "startWeek" });
  const day = "2026-10-20";
  const priya = draftShifts(s, WEEK).find(
    (x) => x.staffId === "priya" && x.day === day,
  );
  s = build(s, { type: "removeShift", id: priya.id });
  s = build(s, { type: "assign", day, blockId: "0", staffId: "morgan" });
  s = build(s, { type: "publish", force: true });
  assert.equal(shiftOn(s, "priya", tue), null);
  assert.ok(crewOn(s, "0", tue).some((c) => c.staffId === "morgan"));
  assert.ok(!crewOn(s, "0", tue).some((c) => c.staffId === "priya"));
  assert.ok(myBlocks(s, "morgan", tue).some((b) => b.index === "0"));
  assert.equal(floaterOn(s, "0", tue), "sam");
  assert.equal(weekHours(s, "priya", WEEK), 34);
  // Weeks that aren't published still run on standing hours.
  assert.deepEqual(shiftOn(s, "priya", now), { start: "09:30", end: "18:00" });
  // Editing after publishing leaves the published copy alone until republished.
  const morgan = draftShifts(s, WEEK).find(
    (x) => x.staffId === "morgan" && x.day === day,
  );
  s = build(s, { type: "unassign", id: morgan.id, blockId: "0" });
  assert.equal(weekStatus(s, WEEK), "changed");
  assert.ok(crewOn(s, "0", tue).some((c) => c.staffId === "morgan"));
  s = build(s, { type: "discardChanges" });
  assert.equal(weekStatus(s, WEEK), "published");
  // One-day changes from Staffing still win over the published week.
  s = applyStaffing(
    s,
    {
      type: "request",
      actor: coach("morgan"),
      staffId: "morgan",
      kind: "timeoff",
      day,
    },
    now,
  );
  const req = s.staffing.requests.find((r) => r.kind === "timeoff");
  s = applyStaffing(
    s,
    { type: "decide", actor: alex, id: req.id, approve: true },
    now,
  );
  assert.equal(shiftOn(s, "morgan", tue), null);
  assert.ok(!crewOn(s, "0", tue).some((c) => c.staffId === "morgan"));
  assert.ok(sessions(tue).length);
});

test("copying last week and auto-filling thin blocks", () => {
  let s = applyShifts(
    base(),
    { type: "startWeek", actor: alex, week: "2026-10-12" },
    now,
  );
  s = applyShifts(
    s,
    { type: "publish", actor: alex, week: "2026-10-12", force: true },
    now,
  );
  s = build(s, { type: "startWeek", from: "lastWeek" });
  assert.equal(
    draftShifts(s, WEEK).length,
    draftShifts(s, "2026-10-12").length,
  );
  // Empty a block, then let auto-fill restaff it.
  const day = "2026-10-21";
  for (const x of draftShifts(s, WEEK).filter((y) => y.day === day))
    if (x.assignments.some((a) => a.blockId === "2"))
      s = build(s, { type: "unassign", id: x.id, blockId: "2" });
  assert.ok(
    weekConflicts(s, WEEK).some((c) => c.day === day && c.blockId === "2"),
  );
  s = build(s, { type: "autoFill" });
  assert.ok(
    !weekConflicts(s, WEEK).some(
      (c) => c.day === day && c.blockId === "2" && /coaches/.test(c.text),
    ),
  );
});
