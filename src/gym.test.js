import test from "node:test";
import assert from "node:assert/strict";
import { people, seed } from "./domain.js";
import { clubStats, emptyClub, sessions } from "./club.js";
import { applyFloor, emptyFloor, readySkills } from "./floor.js";
const readySkillsFor = (s, id, st) =>
  readySkills(s, id, st).filter((k) => !k.special);
import {
  applyGym,
  autoGroups,
  bonusesBy,
  checkOff,
  coachStats,
  deskIssues,
  findKids,
  focusSkills,
  flagsFor,
  groupSummary,
  maxAgeSpread,
  myBlocks,
  nextSkill,
  parseMembers,
  pickStations,
  planFor,
  rotation,
  runOf,
  seedGym,
  stationOfCoach,
  tenure,
  validGym,
} from "./gym.js";

// 9:45 am in Phoenix (UTC-7): just before the homeschool class.
const now = new Date("2026-10-12T16:45:00Z");
const later = (min) => new Date(now.getTime() + min * 60000);
const today = sessions(now);
const homeschool = today[4];
const openGym = today[2];
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(now),
});
const jordan = {
  role: "Coach",
  name: "Coach Jordan",
  staffId: "jordan",
  head: false,
};
const sam = { role: "Coach", name: "Coach Sam", staffId: "sam", head: false };
const alex = { role: "Coach", name: "Coach Alex", staffId: "alex", head: true };
const kid = (id) => people.find((p) => p.id === id);
const k = (id, age, level) => ({ id, name: id, age, level });

test("groups split by age first and never put a 5-year-old with a 10-year-old", () => {
  const kids = [
    k("a5", 5, "beginner"),
    k("b6", 6, "advanced"),
    k("c10", 10, "beginner"),
    k("d10", 10, "advanced"),
    k("e9", 9, "intermediate"),
    k("f5", 5, "advanced"),
  ];
  const groups = autoGroups(kids, 2);
  const ages = groups.map((g) =>
    g.map((id) => kids.find((x) => x.id === id).age),
  );
  for (const a of ages)
    assert.ok(Math.max(...a) - Math.min(...a) <= maxAgeSpread(Math.min(...a)));
  assert.deepEqual(ages.map((a) => Math.min(...a)).sort(), [5, 9]);
});

test("within one age band, groups split by level", () => {
  const kids = [
    k("a", 9, "advanced"),
    k("b", 9, "beginner"),
    k("c", 10, "advanced"),
    k("d", 10, "beginner"),
  ];
  const groups = autoGroups(kids, 2);
  const lv = groups.map((g) =>
    g.map((id) => kids.find((x) => x.id === id).level),
  );
  assert.deepEqual(lv, [
    ["beginner", "beginner"],
    ["advanced", "advanced"],
  ]);
});

test("ages that can't fit the rule fall back to age order and get flagged", () => {
  const kids = [
    k("a", 5, "beginner"),
    k("b", 8, "beginner"),
    k("c", 12, "beginner"),
  ];
  const groups = autoGroups(kids, 1);
  assert.equal(groups[0].length, 3);
  const s = { ...base(), gym: { ...seedGym(now), levels: {} } };
  assert.equal(groupSummary(s, ["ava", "sofia"]).tooWide, true);
});

test("an open gym check-in flags a kid the front desk missed and gives points", () => {
  let s = base();
  assert.deepEqual(
    flagsFor(s, "omar", now).map((f) => f.id),
    ["pastDue", "desk"],
  );
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: openGym.id,
      childIds: ["omar", "lila"],
      actor: sam,
    },
    now,
  );
  const rows = s.gym.checkins;
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every((r) => r.deskAt === null && r.pastDue && r.by === "Coach Sam"),
  );
  assert.equal(clubStats(s, "omar").participationPoints, 5);
  assert.equal(deskIssues(s, now).length, 2);
  assert.throws(
    () =>
      applyGym(
        s,
        {
          type: "checkIn",
          session: openGym.id,
          childIds: ["omar"],
          actor: sam,
        },
        now,
      ),
    /Already/,
  );
});

test("the desk-to-floor wait is measured from the front-desk check-in", () => {
  let s = applyFloor(
    base(),
    { type: "checkIn", childIds: ["theo"], by: "Front desk" },
    now,
  );
  s = applyGym(
    s,
    { type: "checkIn", session: openGym.id, childIds: ["theo"], actor: sam },
    later(6),
  );
  assert.equal(s.gym.checkins[0].deskAt, now.toISOString());
  const row = coachStats(s, new Date(now.getTime() - 86400000)).find(
    (r) => r.staff.id === "sam",
  );
  assert.equal(Math.round(row.deskWait), 6);
});

test("a class runs from attendance to groups, rotations and bonus picks", () => {
  let s = base();
  const roster = people
    .filter((p) =>
      [
        "june",
        "piper",
        "rhys",
        "aria",
        "owen",
        "max",
        "zoe",
        "sofia",
        "tess",
        "luca",
        "jude",
        "caleb",
      ].includes(p.id),
    )
    .map((p) => p.id);
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: homeschool.id,
      childIds: roster,
      actor: jordan,
    },
    now,
  );
  assert.equal(runOf(s, homeschool.id).lead, "Coach Jordan");
  s = applyGym(
    s,
    { type: "attendanceDone", session: homeschool.id, actor: jordan },
    later(2),
  );
  const run = runOf(s, homeschool.id);
  assert.equal(run.groups.length, 4);
  assert.deepEqual(run.stations, pickStations(planFor(s, 4), 4));
  assert.equal(run.groups.flat().length, roster.length);
  for (const g of run.groups) assert.equal(groupSummary(s, g).tooWide, false);
  assert.equal(stationOfCoach(run, "sam"), run.stations[0]);
  // Fewer groups on request.
  s = applyGym(
    s,
    { type: "regroup", session: homeschool.id, count: 3, actor: jordan },
    later(2),
  );
  assert.equal(runOf(s, homeschool.id).stations.length, 3);
  // Move one kid by hand.
  const moved = runOf(s, homeschool.id).groups[0][0];
  s = applyGym(
    s,
    {
      type: "moveKid",
      session: homeschool.id,
      childId: moved,
      to: 2,
      actor: jordan,
    },
    later(3),
  );
  assert.ok(runOf(s, homeschool.id).groups[2].includes(moved));
  s = applyGym(
    s,
    {
      type: "startClass",
      session: homeschool.id,
      minutes: 15,
      warmup: 0,
      actor: jordan,
    },
    later(4),
  );
  const r0 = rotation(runOf(s, homeschool.id), later(4));
  assert.equal(r0.idx, 0);
  assert.equal(r0.groupAt(runOf(s, homeschool.id).stations[1]), 1);
  // 14 minutes in: inside the last 90 seconds of a 15-minute rotation.
  assert.equal(rotation(runOf(s, homeschool.id), later(18)).warn, true);
  const r1 = rotation(runOf(s, homeschool.id), later(20));
  assert.equal(r1.idx, 1);
  assert.equal(r1.stationOf(0), runOf(s, homeschool.id).stations[1]);
  // Rotate early.
  s = applyGym(
    s,
    { type: "rotate", session: homeschool.id, actor: jordan },
    later(22),
  );
  assert.equal(rotation(runOf(s, homeschool.id), later(22)).idx, 2);
  s = applyGym(
    s,
    { type: "endClass", session: homeschool.id, actor: jordan },
    later(40),
  );
  assert.equal(rotation(runOf(s, homeschool.id), later(40)).done, true);
  // Three bonus picks per coach.
  s = applyGym(
    s,
    {
      type: "bonus",
      session: homeschool.id,
      childIds: roster.slice(0, 3),
      actor: jordan,
    },
    later(41),
  );
  assert.equal(bonusesBy(s, homeschool.id, "Coach Jordan").length, 3);
  assert.throws(
    () =>
      applyGym(
        s,
        {
          type: "bonus",
          session: homeschool.id,
          childIds: [roster[4]],
          actor: jordan,
        },
        later(41),
      ),
    /up to 3/,
  );
  s = applyGym(
    s,
    {
      type: "bonus",
      session: homeschool.id,
      childIds: [roster[0]],
      actor: sam,
    },
    later(41),
  );
  assert.equal(clubStats(s, roster[0]).participationPoints, 5 + 10 + 10);
});

test("a late arrival joins a group that fits their age", () => {
  let s = base();
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: homeschool.id,
      childIds: ["june", "piper", "sofia", "tess"],
      actor: jordan,
    },
    now,
  );
  s = applyGym(
    s,
    { type: "attendanceDone", session: homeschool.id, count: 2, actor: jordan },
    now,
  );
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: homeschool.id,
      childIds: ["rhys"],
      actor: jordan,
    },
    later(5),
  );
  const g = runOf(s, homeschool.id).groups.find((x) => x.includes("rhys"));
  assert.ok(g.includes("june"));
});

test("undoing a check-in removes the points and the kid from the groups", () => {
  let s = base();
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: homeschool.id,
      childIds: ["june", "nina"],
      actor: jordan,
    },
    now,
  );
  s = applyGym(
    s,
    { type: "attendanceDone", session: homeschool.id, count: 2, actor: jordan },
    now,
  );
  s = applyGym(
    s,
    {
      type: "undoCheckIn",
      session: homeschool.id,
      childId: "nina",
      actor: jordan,
    },
    now,
  );
  assert.equal(runOf(s, homeschool.id).groups.flat().includes("nina"), false);
  assert.equal(clubStats(s, "nina").participationPoints, 0);
});

test("one tap checks off the next skill at a station", () => {
  let s = base();
  const skill = nextSkill(s, "leo", "grip");
  assert.ok(skill);
  s = checkOff(s, jordan, "leo", skill.id);
  assert.ok(
    s.awards.some(
      (a) =>
        a.childId === "leo" &&
        a.skillId === skill.id &&
        a.coach === "Coach Jordan",
    ),
  );
  assert.notEqual(nextSkill(s, "leo", "grip")?.id, skill.id);
});

test("tenure colors cover the first visit, week, 30 and 60 days", () => {
  const s = base();
  assert.equal(tenure(s, "isla", now).id, "first");
  assert.equal(tenure(s, "kai", now).id, "first");
  assert.equal(tenure(s, "hana", now).id, "month");
  assert.equal(tenure(s, "eli", now).id, "sixty");
  assert.equal(tenure(s, "sofia", now), null);
});

test("search matches a parent's phone number and returns every sibling", () => {
  const ids = findKids("555-0127")
    .map((p) => p.id)
    .sort();
  assert.deepEqual(ids, ["dani", "gabe"]);
  assert.deepEqual(
    findKids("hart")
      .map((p) => p.id)
      .sort(),
    ["rhys", "willa"],
  );
});

test("a coach's day lists only the blocks they work", () => {
  const mine = myBlocks(base(), "priya", now);
  assert.deepEqual(
    mine.map((b) => b.index),
    ["4", "2", "0", "1"],
  );
  assert.equal(mine[0].role, "station");
});

test("the Spark export updates membership by name and reports misses", () => {
  const { rows, unmatched } = parseMembers(
    "first,last,status,past_due,joined\nTheo,Parker,active,yes,2026-10-01\nNobody,Here,active,no,",
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(unmatched, ["Nobody Here"]);
  let s = applyGym(
    base(),
    { type: "import", text: "Theo,Parker,active,yes,2026-10-01", actor: alex },
    now,
  );
  assert.equal(s.gym.members.theo.pastDue, true);
  assert.equal(tenure(s, "theo", now).id, "month");
  assert.throws(
    () =>
      applyGym(
        base(),
        { type: "import", text: "Theo,Parker", actor: sam },
        now,
      ),
    /manager/,
  );
});

test("plans and crews keep their rules", () => {
  const s = base();
  assert.throws(
    () =>
      applyGym(
        s,
        {
          type: "plan",
          index: 4,
          plan: { minutes: 10, stations: [{ station: "grip" }] },
          actor: sam,
        },
        now,
      ),
    /head coach/,
  );
  const p = applyGym(
    s,
    {
      type: "plan",
      index: 4,
      plan: {
        minutes: 10,
        stations: [{ station: "court", focus: "Free throws" }],
      },
      actor: jordan,
    },
    now,
  );
  assert.equal(planFor(p, 4).stations[0].station, "court");
  assert.throws(
    () =>
      applyGym(
        s,
        {
          type: "crew",
          index: 4,
          crew: [{ staffId: "sam", role: "head" }],
          actor: jordan,
        },
        now,
      ),
    /manager/,
  );
  assert.throws(
    () =>
      applyGym(
        s,
        {
          type: "crew",
          index: 4,
          crew: [
            { staffId: "sam", role: "head" },
            { staffId: "dev", role: "head" },
          ],
          actor: alex,
        },
        now,
      ),
    /One head/,
  );
});

test("a saved gym record survives validation", () => {
  assert.equal(validGym(seedGym(now)), true);
  assert.equal(validGym({ version: 1 }), false);
  assert.equal(kid("june").age, 5);
});

test("the age rule adds groups instead of mixing a 5-year-old with older kids", () => {
  let s = base();
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: homeschool.id,
      childIds: ["june", "piper", "owen", "max", "nina", "tess"],
      actor: jordan,
    },
    now,
  );
  s = applyGym(
    s,
    { type: "attendanceDone", session: homeschool.id, count: 2, actor: jordan },
    now,
  );
  const run = runOf(s, homeschool.id);
  assert.equal(run.groups.length, 3);
  assert.equal(run.raised, 2);
  for (const g of run.groups) assert.equal(groupSummary(s, g).tooWide, false);
});

test("only the class's head coach, a coach who took over, or the manager runs the class", () => {
  let s = base();
  // A station coach marking a kid present doesn't become the lead.
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: homeschool.id,
      childIds: ["june", "nina"],
      actor: sam,
    },
    now,
  );
  assert.equal(runOf(s, homeschool.id).lead, "Coach Jordan");
  assert.throws(
    () =>
      applyGym(
        s,
        { type: "attendanceDone", session: homeschool.id, actor: sam },
        now,
      ),
    /Coach Jordan is running/,
  );
  s = applyGym(
    s,
    { type: "attendanceDone", session: homeschool.id, actor: alex },
    now,
  );
  assert.throws(
    () =>
      applyGym(
        s,
        { type: "startClass", session: homeschool.id, actor: sam },
        now,
      ),
    /running/,
  );
  s = applyGym(
    s,
    { type: "takeLead", session: homeschool.id, actor: sam },
    now,
  );
  s = applyGym(
    s,
    { type: "startClass", session: homeschool.id, actor: sam },
    now,
  );
  assert.ok(runOf(s, homeschool.id).startedAt);
});

test("skills the head coach picks for a station come first", () => {
  let s = base();
  const ready = nextSkill(s, "leo", "grip");
  const all = readySkillsFor(s, "leo", "grip");
  const other = all.find((k) => k.id !== ready.id);
  s = applyGym(
    s,
    {
      type: "plan",
      index: 4,
      plan: {
        minutes: 12,
        stations: [{ station: "grip", focus: "Hangs", skills: [other.id] }],
      },
      actor: jordan,
    },
    now,
  );
  assert.equal(
    nextSkill(s, "leo", "grip", focusSkills(planFor(s, 4), "grip")).id,
    other.id,
  );
});
