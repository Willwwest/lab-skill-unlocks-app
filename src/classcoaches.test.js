import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub, sessions } from "./club.js";
import { applyFloor, emptyFloor } from "./floor.js";
import {
  applyGym,
  coachAt,
  deskIssues,
  fitRounds,
  handoffsFor,
  myBlocks,
  planFor,
  postOf,
  rotation,
  runCoaches,
  runOf,
  seedGym,
} from "./gym.js";
import {
  blockCheck,
  classCrew,
  commitments,
  groupLimit,
  seedStaffing,
} from "./staffing.js";
import { floorStatus } from "./layout.js";

// 9:45 am in Phoenix (UTC-7): just before the homeschool class.
const now = new Date("2026-10-12T16:45:00Z");
const later = (min) => new Date(now.getTime() + min * 60000);
const homeschool = sessions(now)[4];
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(now),
});
const coach = (id, name, head = false) => ({
  role: "Coach",
  name,
  staffId: id,
  head,
});
const jordan = coach("jordan", "Coach Jordan");
const sam = coach("sam", "Coach Sam");
const morgan = coach("morgan", "Coach Morgan");
const alex = coach("alex", "Coach Alex", true);
// Ages 9 to 11: one age band, so the age rule never adds groups.
const kids = ["zoe", "finn", "ruby", "maya", "mateo", "omar"];

const inClass = (s = base()) =>
  applyGym(
    s,
    { type: "checkIn", session: homeschool.id, childIds: kids, actor: jordan },
    now,
  );
const grouped = (patch, s = inClass()) =>
  applyGym(
    s,
    { type: "attendanceDone", session: homeschool.id, actor: jordan, ...patch },
    now,
  );
const started = (s, patch = {}) =>
  applyGym(
    s,
    {
      type: "startClass",
      session: homeschool.id,
      warmup: 0,
      actor: jordan,
      ...patch,
    },
    now,
  );

test("plans carry a warm-up and how coaches move; homeschool fits its hour", () => {
  const plan = planFor(base(), homeschool.index);
  assert.equal(plan.warmup, 5);
  assert.equal(plan.mode, "auto");
  assert.equal(plan.minutes, 12);
  assert.ok(plan.warmup + plan.stations.length * plan.minutes <= 60);
  const s = applyGym(base(), {
    type: "plan",
    index: homeschool.index,
    plan: { ...plan, warmup: 8, mode: "group" },
    actor: jordan,
  });
  assert.equal(planFor(s, homeschool.index).warmup, 8);
  assert.equal(planFor(s, homeschool.index).mode, "group");
  assert.throws(
    () =>
      applyGym(base(), {
        type: "plan",
        index: homeschool.index,
        plan: { ...plan, mode: "sideways" },
        actor: jordan,
      }),
    /how the coaches move/,
  );
});

test("one coach takes the whole class through every station together", () => {
  const s = started(grouped({ count: 1 }));
  const run = runOf(s, homeschool.id);
  assert.equal(run.groups.length, 1);
  assert.equal(run.mode, "group");
  assert.equal(run.stations.length, 4);
  assert.equal(run.groups[0].length, kids.length);
  assert.ok(run.leaders[0]);
  const r = rotation(run, later(13));
  assert.equal(r.idx, 1);
  assert.equal(r.stationOf(0), run.stations[1]);
  // Nobody is at the other stations.
  assert.equal(r.groupAt(run.stations[0]), -1);
  assert.equal(coachAt(run, run.stations[1], r), run.leaders[0]);
});

test("two coaches who travel keep their groups and never share a station", () => {
  const s = started(grouped({ count: 2, mode: "group" }));
  const run = runOf(s, homeschool.id);
  assert.equal(run.groups.length, 2);
  assert.equal(run.stations.length, 4);
  assert.deepEqual(run.coaches, {});
  const [a, b] = run.leaders;
  assert.ok(a && b && a !== b);
  for (let i = 0; i < 4; i++) {
    const r = rotation(run, later(i * 12 + 1));
    assert.equal(r.idx, i);
    assert.notEqual(r.stationOf(0), r.stationOf(1));
    // The coach at a station is whoever's group is there.
    assert.equal(coachAt(run, r.stationOf(0), r), a);
    assert.equal(coachAt(run, r.stationOf(1), r), b);
    assert.equal(run.stations.filter((st) => r.groupAt(st) === -1).length, 2);
  }
  const p = postOf(run, a, later(1));
  assert.equal(p.group, 0);
  assert.equal(p.station, run.stations[0]);
  assert.equal(p.next, run.stations[1]);
  // Station coaches can't be set in this mode; group coaches can.
  assert.throws(
    () =>
      applyGym(s, {
        type: "setCoach",
        session: homeschool.id,
        station: run.stations[0],
        staffId: "sam",
        actor: jordan,
      }),
    /travel/,
  );
  const swapped = applyGym(s, {
    type: "setLeader",
    session: homeschool.id,
    group: 0,
    staffId: b,
    actor: jordan,
  });
  assert.deepEqual(runOf(swapped, homeschool.id).leaders, [b, null]);
});

test("two coaches who stay hold two stations and the groups go round twice", () => {
  const s = started(grouped({ count: 2, mode: "station" }));
  const run = runOf(s, homeschool.id);
  assert.equal(run.stations.length, 2);
  assert.equal(run.rounds, fitRounds(60, 5, 2, 12));
  assert.equal(run.rounds, 2);
  const r0 = rotation(run, later(1));
  const r2 = rotation(run, later(25));
  assert.equal(r0.total, 4);
  assert.equal(r2.idx, 2);
  assert.equal(r2.round, 2);
  assert.equal(r0.stationOf(0), r2.stationOf(0));
  const st = run.stations[0];
  const there = run.coaches[st];
  assert.equal(coachAt(run, st, r0), there);
  assert.equal(coachAt(run, st, rotation(run, later(13))), there);
  assert.equal(postOf(run, there, later(13)).group, 1);
});

test("the warm-up runs first and a hold freezes the clock", () => {
  let s = started(grouped({ count: 2, mode: "station" }), { warmup: 5 });
  const run = () => runOf(s, homeschool.id);
  const w = rotation(run(), later(2));
  assert.equal(w.warmup, true);
  assert.equal(w.left, 3 * 60000);
  assert.equal(w.warn, false);
  assert.equal(rotation(run(), later(6)).warmup, false);
  // Any coach in the class can hold, the way anyone can give the stop signal.
  s = applyGym(
    s,
    { type: "hold", session: homeschool.id, actor: sam },
    later(8),
  );
  assert.equal(rotation(run(), later(20)).paused, true);
  assert.equal(rotation(run(), later(20)).left, 9 * 60000);
  assert.throws(
    () =>
      applyGym(
        s,
        { type: "hold", session: homeschool.id, actor: sam },
        later(9),
      ),
    /already on hold/,
  );
  s = applyGym(
    s,
    { type: "resume", session: homeschool.id, actor: jordan },
    later(20),
  );
  assert.equal(rotation(run(), later(21)).left, 8 * 60000);
  assert.throws(
    () =>
      applyGym(
        s,
        { type: "hold", session: homeschool.id, actor: morgan },
        later(22),
      ),
    /Only coaches in this class/,
  );
});

test("a coach added at check-in is in the class like the crew", () => {
  let s = inClass();
  assert.throws(
    () =>
      applyGym(
        s,
        {
          type: "addHelper",
          session: homeschool.id,
          staffId: "morgan",
          actor: sam,
        },
        now,
      ),
    /running this class/,
  );
  assert.throws(
    () =>
      applyGym(
        s,
        {
          type: "addHelper",
          session: homeschool.id,
          staffId: "sam",
          actor: jordan,
        },
        now,
      ),
    /already in this class/,
  );
  s = applyGym(
    s,
    {
      type: "addHelper",
      session: homeschool.id,
      staffId: "morgan",
      actor: jordan,
    },
    now,
  );
  s = { ...s, staffing: seedStaffing(now) };
  assert.deepEqual(runOf(s, homeschool.id).helpers, ["morgan"]);
  // Morgan's day and the staffing board both show the class.
  const mine = myBlocks(s, "morgan", now).find((b) => b.id === homeschool.id);
  assert.equal(mine.role, "helper");
  assert.ok(
    classCrew(s, homeschool, now).some(
      (c) => c.staffId === "morgan" && c.role === "helper",
    ),
  );
  assert.ok(
    commitments(s, "morgan", now).some((c) => c.block.id === homeschool.id),
  );
  assert.ok(
    blockCheck(s, homeschool, now).crew.some((c) => c.staffId === "morgan"),
  );
  // The groups default to one per coach, helper included.
  s = grouped({ mode: "station" }, s);
  const run = runOf(s, homeschool.id);
  assert.equal(run.groups.length, 5);
  assert.ok(Object.values(run.coaches).includes("morgan"));
  assert.ok(runCoaches(run).includes("morgan"));
  // The helper can pass notes and hold the clock.
  s = started(s);
  s = applyGym(
    s,
    {
      type: "handoff",
      session: homeschool.id,
      childId: "zoe",
      text: "  Sore wrist, keep off rings  ",
      actor: morgan,
    },
    later(3),
  );
  assert.equal(
    handoffsFor(runOf(s, homeschool.id), "zoe")[0].text,
    "Sore wrist, keep off rings",
  );
  assert.throws(
    () =>
      applyGym(s, {
        type: "handoff",
        session: homeschool.id,
        childId: "theo",
        text: "Hi",
        actor: morgan,
      }),
    /kid in this class/,
  );
  applyGym(
    s,
    { type: "hold", session: homeschool.id, actor: morgan },
    later(4),
  );
  // Taking the helper off frees their station.
  s = applyGym(s, {
    type: "removeHelper",
    session: homeschool.id,
    staffId: "morgan",
    actor: jordan,
  });
  assert.ok(!Object.values(runOf(s, homeschool.id).coaches).includes("morgan"));
});

test("a paused station is left out of the class", () => {
  let s = applyFloor(
    inClass(),
    { type: "outage", station: "wall", reason: "Pad torn", actor: alex },
    now,
  );
  s = grouped({ count: 2, mode: "group" }, s);
  const run = runOf(s, homeschool.id);
  assert.ok(!run.stations.includes("wall"));
  assert.equal(run.stations.length, 4);
});

test("one coach can take a class while the ratio holds", () => {
  const s = { ...base(), staffing: seedStaffing(now) };
  assert.equal(s.staffing.rules.classMin, 1);
  assert.deepEqual(groupLimit(s, ["nina", "tess"]), {
    limit: 8,
    young: false,
    over: false,
  });
  // June is 5, so the little-ones ratio applies.
  assert.equal(groupLimit(s, ["june", "nina"]).limit, 5);
  assert.equal(
    groupLimit(s, ["june", "piper", "nina", "tess", "max", "willa"]).over,
    true,
  );
});

test("the floor board shows the coach traveling with each group", () => {
  const s = started(grouped({ count: 2, mode: "group" }));
  const run = runOf(s, homeschool.id);
  // 10:05, inside the class block: the second rotation.
  const r = rotation(run, later(20));
  const st = r.stationOf(0);
  // The zone the class holds for that station (its marked floor use).
  const status = floorStatus(s, later(20)).zones.find(
    (z) => z.station === st && z.status === "class",
  );
  assert.equal(status.class.group, 1);
  assert.equal(status.class.coach, staffNameOf(run.leaders[0]));
});

function staffNameOf(id) {
  return {
    jordan: "Coach Jordan",
    sam: "Coach Sam",
    priya: "Coach Priya",
    riley: "Coach Riley",
  }[id];
}

test("a kid added to class before the desk is flagged until the desk checks them in", () => {
  let s = applyFloor(base(), { type: "checkIn", childIds: ["zoe"] }, now);
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: homeschool.id,
      childIds: ["zoe", "finn"],
      actor: jordan,
    },
    later(1),
  );
  // Zoe came through the desk; Finn didn't, but still joins the class.
  assert.deepEqual(
    deskIssues(s, later(1)).map((c) => c.childId),
    ["finn"],
  );
  s = applyFloor(s, { type: "checkIn", childIds: ["finn"] }, later(6));
  assert.deepEqual(deskIssues(s, later(6)), []);
  const row = s.gym.checkins.find((c) => c.childId === "finn");
  assert.equal(row.deskLate, true);
});
