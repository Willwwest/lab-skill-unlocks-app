import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub, sessionName, sessions } from "./club.js";
import { emptyFloor } from "./floor.js";
import { seedGym } from "./gym.js";
import { addDays, dayAt, weekKeyOf, weekdayOf } from "./gym-time.js";
import {
  applySchedule,
  blocksOn,
  hoursOn,
  isClosed,
  portfolioBuckets,
  scheduleOf,
  seedSchedule,
  sessionFromId,
  sessionsOn,
} from "./schedule.js";
import {
  applyStaffing,
  modalitiesOf,
  portfolioOf,
  portfolioProblem,
  seedStaffing,
  staffingOf,
} from "./staffing.js";

// Monday 2026-10-12, 9:45 am in Phoenix.
const now = new Date("2026-10-12T16:45:00Z");
const MON = "2026-10-12";
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(now),
  staffing: seedStaffing(now),
  schedule: seedSchedule(),
});
const coach = (id, extra = {}) => ({
  role: "Coach",
  name: `Coach ${id[0].toUpperCase()}${id.slice(1)}`,
  staffId: id,
  head: false,
  ...extra,
});
const alex = coach("alex", { head: true });
const charlie = coach("charlie", { head: true, owner: true });
const sch = (s, action) => applySchedule(s, { actor: alex, ...action }, now);

test("gym days know their weekday and week", () => {
  assert.equal(weekdayOf(MON), 1);
  assert.equal(weekdayOf("2026-10-18"), 7);
  assert.equal(weekKeyOf("2026-10-18"), MON);
  assert.equal(addDays(MON, 7), "2026-10-19");
  assert.equal(new Date(dayAt(MON)).toISOString(), "2026-10-12T19:00:00.000Z");
});

test("the seed runs the original five blocks every day, with string ids", () => {
  const list = sessions(now);
  assert.deepEqual(
    list.map((b) => b.index),
    ["0", "1", "2", "3", "4"],
  );
  assert.equal(list[1].id, `${MON}:1`);
  assert.equal(list[1].programId, "ninja-progressions");
  // Stored ids from before keep resolving.
  assert.equal(sessionName(`${MON}:4`), "Homeschool ninja");
  assert.equal(sessionFromId(null, "2026-09-01:2").name, "Open gym rotation");
});

test("the owner sets which weekdays a block runs", () => {
  let s = base();
  assert.throws(
    () => sch(s, { type: "blockDays", blockId: "4", weekdays: [1, 3, 5] }),
    /owner/,
  );
  s = applySchedule(
    s,
    { type: "blockDays", actor: charlie, blockId: "4", weekdays: [5, 1, 3] },
    now,
  );
  assert.deepEqual(scheduleOf(s).blocks[4].weekdays, [1, 3, 5]);
  const tue = blocksOn(s, "2026-10-13").map((b) => b.id);
  assert.ok(!tue.includes("4"));
  assert.ok(blocksOn(s, MON).some((b) => b.id === "4"));
  // A past session of a block that no longer runs that day still has a name.
  assert.equal(sessionName("2026-10-13:4", s), "Homeschool ninja");
  // The day's sessions follow the template when the state is passed in.
  assert.ok(
    !sessions(new Date(dayAt("2026-10-13")), s).some((b) => b.index === "4"),
  );
});

test("managers cancel, retime or close a single day", () => {
  let s = base();
  assert.throws(
    () =>
      applySchedule(
        s,
        { type: "exception", actor: coach("sam"), day: MON, kind: "closed" },
        now,
      ),
    /gym manager/,
  );
  s = sch(s, { type: "exception", day: MON, blockId: "0", kind: "cancelled" });
  s = sch(s, {
    type: "exception",
    day: MON,
    blockId: "1",
    kind: "retimed",
    start: "17:00",
    end: "18:00",
  });
  const mon = sessionsOn(s, now);
  assert.ok(!mon.some((b) => b.index === "0"));
  const prog = mon.find((b) => b.index === "1");
  assert.equal(prog.start, "17:00");
  assert.equal(prog.retimed, true);
  // A second change for the same block that day replaces the first.
  s = sch(s, { type: "exception", day: MON, blockId: "1", kind: "cancelled" });
  assert.equal(
    scheduleOf(s).exceptions.filter((e) => e.blockId === "1").length,
    1,
  );
  s = sch(s, {
    type: "exception",
    day: "2026-10-14",
    kind: "closed",
    note: "Staff day",
  });
  assert.equal(isClosed(s, "2026-10-14"), true);
  assert.deepEqual(blocksOn(s, "2026-10-14"), []);
  assert.equal(hoursOn(s, "2026-10-14"), null);
  const id = scheduleOf(s).exceptions.find((e) => e.kind === "closed").id;
  s = sch(s, { type: "clearException", id });
  assert.equal(isClosed(s, "2026-10-14"), false);
});

test("opening hours run from the first block to the last", () => {
  assert.deepEqual(hoursOn(base(), MON), { start: 600, end: 1200 });
});

test("managers decide which programs count toward a coach's time split", () => {
  let s = base();
  assert.deepEqual(
    portfolioBuckets(s).map((b) => b.id),
    ["class", "open", "floater"],
  );
  // Golf is coming soon: coaches can ask for it, but it isn't in the split.
  s = applyStaffing(
    s,
    {
      type: "interest",
      actor: coach("priya"),
      staffId: "priya",
      bucket: "golf",
      on: true,
    },
    now,
  );
  assert.deepEqual(staffingOf(s).interest.priya, ["golf"]);
  assert.throws(
    () =>
      applyStaffing(
        s,
        {
          type: "interest",
          actor: coach("priya"),
          staffId: "priya",
          bucket: "class",
          on: true,
        },
        now,
      ),
    /coming soon/,
  );
  assert.throws(
    () => sch(s, { type: "bucket", id: "class", status: "coming" }),
    /every coach's day/,
  );
  // Golf starts: it joins the split at 0% until the coach rebalances.
  s = sch(s, { type: "bucket", id: "golf", status: "active" });
  assert.deepEqual(
    modalitiesOf(s).map((b) => b.id),
    ["class", "open", "floater", "golf"],
  );
  assert.equal(portfolioOf(s, "priya").golf, 0);
  assert.match(
    portfolioProblem(portfolioOf(s, "priya"), 10, modalitiesOf(s)),
    /Golf simulator needs at least 10%/,
  );
  s = applyStaffing(
    s,
    {
      type: "portfolio",
      actor: coach("priya"),
      staffId: "priya",
      portfolio: { class: 40, open: 30, floater: 15, golf: 15 },
    },
    now,
  );
  assert.equal(portfolioOf(s, "priya").golf, 15);
  // A new program starts as coming soon.
  s = sch(s, { type: "bucket", label: "Parkour", status: "coming" });
  assert.equal(scheduleOf(s).buckets.at(-1).id, "parkour");
  assert.throws(
    () => sch(s, { type: "bucket", label: "Parkour", status: "coming" }),
    /already/,
  );
});

test("a coach can ask for a change on a day ahead", () => {
  let s = base();
  const fri = "2026-10-16";
  s = applyStaffing(
    s,
    {
      type: "request",
      actor: coach("dev"),
      staffId: "dev",
      kind: "cover",
      day: fri,
      index: "3",
    },
    now,
  );
  const r = staffingOf(s).requests.find((x) => x.day === fri);
  assert.equal(r.index, "3");
  assert.throws(
    () =>
      applyStaffing(
        s,
        {
          type: "request",
          actor: coach("dev"),
          staffId: "dev",
          kind: "timeoff",
          day: "2026-10-01",
        },
        now,
      ),
    /today or a day ahead/,
  );
});
