import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seed } from "./domain.js";
import { emptyClub, sessions } from "./club.js";
import { emptyFloor } from "./floor.js";
import { myBlocks, seedGym } from "./gym.js";
import {
  actualMix,
  applyStaffing,
  blockCheck,
  breakClashes,
  breakProblem,
  breakSlots,
  coachStatusAt,
  coverCandidates,
  crewOn,
  dayCheck,
  dayGrid,
  floaterOn,
  modalities,
  neededCoaches,
  portfolioProblem,
  seedStaffing,
  staffingOf,
  validStaffing,
  levelOf,
  withLevel,
} from "./staffing.js";

// 9:45 am in Phoenix (UTC-7).
const now = new Date("2026-10-12T16:45:00Z");
const at = (hhmm) => new Date(`2026-10-12T${hhmm}:00-07:00`);
const today = sessions(now);
const foundations = today[0];
const progressions = today[1];
const evening = today[3];
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(now),
  staffing: seedStaffing(now),
});
const coach = (staffId, head = false) => ({
  role: "Coach",
  name: `Coach ${staffId}`,
  staffId,
  head,
});
const alex = coach("alex", true);
const charlie = { ...coach("charlie", true), owner: true };
const run = (s, action, when = now) => applyStaffing(s, action, when);

test("seed is valid and old saves fall back to it", () => {
  assert.ok(validStaffing(seedStaffing(now)));
  assert.ok(validStaffing(staffingOf({})));
  assert.equal(validStaffing({ version: 2 }), false);
});

test("status follows the day: off, class, open gym, floating, break", () => {
  const s = base();
  assert.equal(coachStatusAt(s, "morgan", at("10:00")).status, "off");
  assert.equal(coachStatusAt(s, "jordan", at("10:30")).status, "class");
  assert.equal(coachStatusAt(s, "priya", at("13:00")).status, "open");
  assert.equal(coachStatusAt(s, "riley", at("11:30")).status, "break");
  // Sam floats Foundations, including the 10 minutes before it starts.
  assert.equal(coachStatusAt(s, "sam", at("15:25")).status, "floater");
  assert.equal(coachStatusAt(s, "jordan", at("14:00")).status, "free");
});

test("only one coach can be on break at a time", () => {
  const s = base();
  assert.match(
    breakProblem(s, "priya", "11:30", "12:00", at("09:45")),
    /Coach Riley is on break 11:15–11:45/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "addBreak",
        actor: coach("priya"),
        staffId: "priya",
        start: "11:30",
        end: "12:00",
      }),
    /One coach on break at a time/,
  );
  const ok = run(s, {
    type: "addBreak",
    actor: coach("priya"),
    staffId: "priya",
    start: "11:45",
    end: "12:00",
  });
  assert.equal(breakClashes(ok, now).length, 0);
  assert.ok(dayGrid(ok, now).rows.length >= 7);
});

test("a break can't land on a coach's own block or outside the shift", () => {
  const s = base();
  assert.match(
    breakProblem(s, "jordan", "10:15", "10:45", now),
    /working Homeschool ninja then/,
  );
  assert.match(
    breakProblem(s, "morgan", "12:00", "12:30", now),
    /outside Coach Morgan's shift/,
  );
  assert.match(breakProblem(s, "sam", "15:25", "15:40", now), /floating for/);
  assert.throws(
    () =>
      run(s, {
        type: "addBreak",
        actor: coach("priya"),
        staffId: "sam",
        start: "14:00",
        end: "14:30",
      }),
    /only change your own/,
  );
});

test("break slots skip other breaks and booked blocks", () => {
  // Priya's only gap before close is 11:00–12:00, and Riley is on break
  // 11:15–11:45, so a 30-minute break doesn't fit but 15 minutes does,
  // on either side of Riley.
  assert.deepEqual(breakSlots(base(), "priya", at("11:00"), 30), []);
  const slots = breakSlots(base(), "priya", at("11:00"), 15);
  assert.deepEqual(slots.slice(0, 2), [
    { start: "11:00", end: "11:15" },
    { start: "11:45", end: "12:00" },
  ]);
  for (const b of slots)
    assert.equal(breakProblem(base(), "priya", b.start, b.end, now), null);
});

test("portfolios need at least 10% in every modality and total 100", () => {
  assert.equal(portfolioProblem({ class: 60, open: 30, floater: 10 }), null);
  assert.match(
    portfolioProblem({ class: 85, open: 10, floater: 5 }),
    /Floater needs at least 10%/,
  );
  assert.match(
    portfolioProblem({ class: 50, open: 30, floater: 15 }),
    /add up to 95%/,
  );
  const s = run(base(), {
    type: "portfolio",
    actor: coach("sam"),
    staffId: "sam",
    portfolio: { class: 50, open: 25, floater: 25 },
  });
  assert.deepEqual(staffingOf(s).portfolios.sam, {
    class: 50,
    open: 25,
    floater: 25,
  });
  assert.equal(modalities.length, 3);
});

test("booked mix splits a coach's minutes by modality", () => {
  const mix = actualMix(base(), "priya", now);
  // Homeschool, Foundations, Progressions as station: 180 min. Open: 195.
  assert.equal(mix.minutes.class, 180);
  assert.equal(mix.minutes.open, 195);
  assert.equal(mix.total, 375);
});

test("staffing check flags the missing floater and ratios", () => {
  const s = base();
  const prog = blockCheck(s, progressions, now);
  assert.ok(prog.issues.some((i) => /No floater/.test(i.text)));
  const fnd = blockCheck(s, foundations, now);
  assert.ok(!fnd.issues.some((i) => /floater/i.test(i.text)));
  // The manager sets an expected headcount: 32 kids at 1:8 need 4.
  const big = run(s, {
    type: "rules",
    actor: alex,
    rules: { expected: { 1: 32 } },
  });
  const need = neededCoaches(big, progressions);
  assert.equal(need.ratio, 8);
  assert.equal(need.need, 4);
  // Progressions has 4 booked, so the ratio itself is met.
  assert.ok(
    !blockCheck(big, progressions, now).issues.some((i) =>
      /kids at/.test(i.text),
    ),
  );
  const huge = run(s, {
    type: "rules",
    actor: alex,
    rules: { expected: { 1: 40 } },
  });
  assert.ok(
    blockCheck(huge, progressions, now).issues.some((i) =>
      /40 kids at 1:8 need 5 coaches, 4 booked/.test(i.text),
    ),
  );
  assert.throws(
    () =>
      run(s, { type: "rules", actor: coach("sam"), rules: { expected: {} } }),
    /gym manager/,
  );
  assert.equal(dayCheck(s, now).length, today.length);
});

test("cover request: volunteer, approve, and the floor sees the new crew", () => {
  let s = base();
  // Dev asks for cover for evening open gym (seeded). Riley's shift ends
  // at 6, so Riley can't take it; nobody else is free either.
  const req = staffingOf(s).requests[0];
  assert.throws(
    () => run(s, { type: "volunteer", actor: coach("riley"), id: req.id }),
    /busy or off/,
  );
  s = run(s, {
    type: "shift",
    actor: charlie,
    staffId: "riley",
    start: "09:30",
    end: "20:15",
  });
  assert.ok(
    coverCandidates(s, evening, now).some((c) => c.staff.id === "riley"),
  );
  s = run(s, { type: "volunteer", actor: coach("riley"), id: req.id });
  assert.throws(
    () =>
      run(s, {
        type: "decide",
        actor: coach("sam"),
        id: req.id,
        approve: true,
      }),
    /gym manager/,
  );
  s = run(s, { type: "decide", actor: alex, id: req.id, approve: true });
  const crew = crewOn(s, evening.index, now).map((c) => c.staffId);
  assert.deepEqual(crew.sort(), ["morgan", "riley"]);
  // The coach floor's own lookup follows the change.
  assert.ok(myBlocks(s, "riley", now).some((b) => b.index === evening.index));
  assert.ok(!myBlocks(s, "dev", now).some((b) => b.index === evening.index));
  // The weekly crew is untouched.
  assert.deepEqual(s.gym.crew[evening.index] ?? null, null);
});

test("day off empties the coach's blocks and the check asks for cover", () => {
  let s = run(base(), {
    type: "request",
    actor: coach("morgan"),
    staffId: "morgan",
    kind: "timeoff",
  });
  const req = staffingOf(s).requests.find((r) => r.kind === "timeoff");
  s = run(s, { type: "decide", actor: alex, id: req.id, approve: true });
  assert.equal(coachStatusAt(s, "morgan", at("17:00")).status, "off");
  const ev = blockCheck(s, evening, now);
  assert.ok(ev.issues.some((i) => /Coach Morgan is off/.test(i.text)));
  assert.throws(
    () =>
      run(s, {
        type: "request",
        actor: coach("morgan"),
        staffId: "morgan",
        kind: "cover",
        index: evening.index,
      }),
    /not on Evening open gym/,
  );
});

test("hours change and floater assignment apply to the day", () => {
  let s = run(base(), {
    type: "request",
    actor: coach("sam"),
    staffId: "sam",
    kind: "hours",
    start: "14:00",
    end: "18:30",
  });
  const req = staffingOf(s).requests.find((r) => r.kind === "hours");
  s = run(s, { type: "decide", actor: alex, id: req.id, approve: true });
  assert.equal(coachStatusAt(s, "sam", at("13:30")).status, "off");
  s = run(s, {
    type: "floater",
    actor: alex,
    index: progressions.index,
    staffId: "alex",
    today: true,
  });
  assert.equal(floaterOn(s, progressions.index, now), "alex");
  assert.throws(
    () =>
      run(s, {
        type: "floater",
        actor: alex,
        index: progressions.index,
        staffId: "sam",
      }),
    /already in that class's crew/,
  );
});

test("staffing files use design tokens only", () => {
  for (const f of ["./staffing.css", "./Staffing.jsx"]) {
    const text = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.equal(/#[0-9a-f]{3,8}\b/i.test(text), false, f);
  }
});

test("classes with kids 6 and under use the younger ratio", () => {
  const s = base();
  const hs = neededCoaches(s, today[4]);
  assert.equal(hs.young, true);
  assert.equal(hs.ratio, 5);
  assert.equal(neededCoaches(s, progressions).young, false);
});

test("owner level: rules, standing hours and who manages", () => {
  let s = base();
  assert.throws(
    () => run(s, { type: "rules", actor: alex, rules: { classRatio: 6 } }),
    /Only the owner/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "shift",
        actor: alex,
        staffId: "sam",
        start: "10:00",
        end: "18:00",
      }),
    /Only the owner/,
  );
  s = run(s, { type: "rules", actor: charlie, rules: { maxOnBreak: 2 } });
  // With two allowed, Priya can break alongside Riley.
  assert.equal(breakProblem(s, "priya", "11:15", "11:30", now), null);
  assert.throws(
    () => run(s, { type: "rules", actor: charlie, rules: { minShare: 40 } }),
    /0 to 33%/,
  );
  assert.equal(levelOf(s, "sam"), "coach");
  assert.equal(levelOf(s, "alex"), "manager");
  assert.equal(levelOf(s, "charlie"), "owner");
  assert.equal(levelOf(s, "ally"), "owner");
  s = run(s, {
    type: "role",
    actor: charlie,
    staffId: "sam",
    level: "manager",
  });
  assert.equal(withLevel(s, { id: "sam" }).head, true);
  assert.throws(
    () =>
      run(s, { type: "role", actor: alex, staffId: "riley", level: "manager" }),
    /Only the owner/,
  );
  // The owner never shows up as a coach on the board.
  assert.ok(!dayGrid(s, now).rows.some((r) => r.staff.owner));
});
