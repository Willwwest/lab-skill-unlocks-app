import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub } from "./club.js";
import { applyFloor, emptyFloor, stationFor } from "./floor.js";
import { seedGym } from "./gym.js";
import { floorStatus } from "./layout.js";
import {
  earnNow,
  skillPoints,
  todaySchedule,
  weeklyCrowns,
  weeklyShoutouts,
} from "./tvs.js";

// Phoenix is UTC-7. Monday, October 12, 2026.
const at = (hhmm, day = "2026-10-12") => new Date(`${day}T${hhmm}:00-07:00`);
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(at("09:00")),
});
const alex = { role: "Coach", name: "Coach Alex", staffId: "alex", head: true };

test("the schedule lists the day in order with what's live", () => {
  const list = todaySchedule(base(), at("10:20"));
  assert.deepEqual(
    list.map((b) => b.start),
    [...list.map((b) => b.start)].sort(),
  );
  const live = list.filter((b) => b.phase === "live");
  assert.deepEqual(
    live.map((b) => b.name),
    ["Homeschool ninja"],
  );
  assert.equal(live[0].lead, "Coach Jordan");
  assert.ok(list.every((b) => ["live", "upcoming", "done"].includes(b.phase)));
});

test("during a class, only equipment the class isn't using earns points on the board", () => {
  // Homeschool ninja holds its marked zones (grip lanes, WW, vault blocks,
  // course lanes); the court, advanced rig, track wall and beam stay free.
  const held = new Set(
    floorStatus(base(), at("10:20"))
      .zones.filter((z) => z.status === "class")
      .map((z) => z.id),
  );
  const items = earnNow(base(), at("10:20"));
  assert.ok(items.length > 0);
  for (const i of items) {
    assert.ok(!held.has(i.zone.id), i.zone.name);
    assert.equal(stationFor(i.skill), i.station);
    assert.equal(i.points, skillPoints(i.skill));
  }
  assert.ok(items.some((i) => i.zone.id === "advanced"));
});

test("in open gym the strip spreads across all five stations", () => {
  const items = earnNow(base(), at("13:00"));
  assert.equal(items.length, 5);
  assert.equal(new Set(items.map((i) => i.station)).size, 5);
  assert.ok(items.every((i) => !i.skill.special));
  assert.ok(items.every((i) => i.zone.name));
});

test("nothing to earn when the gym is closed or a station is paused", () => {
  assert.deepEqual(earnNow(base(), at("08:00")), []);
  const paused = applyFloor(
    base(),
    { type: "outage", station: "court", reason: "Hoop repair", actor: alex },
    at("12:30"),
  );
  assert.ok(earnNow(paused, at("13:00")).every((i) => i.station !== "court"));
  // During the class the court stays out; the free parts of the rig don't.
  const during = earnNow(paused, at("10:20"));
  assert.ok(during.length > 0);
  assert.ok(during.every((i) => i.station !== "court"));
});

const withClub = (events) => {
  const s = base();
  s.club = {
    ...emptyClub(),
    profiles: {
      theo: { optIn: true, alias: "Turbo Theo", group: "6–8 / Foundations" },
      maya: { optIn: false, alias: "", group: "9–12 / Foundations" },
    },
    events,
  };
  return s;
};
const ev = (id, childId, kind, day, extra = {}) => ({
  id,
  childId,
  kind,
  status: "approved",
  at: at("13:00", day).toISOString(),
  session: `${day}:2`,
  ...extra,
});

test("crowns name only opted-in kids, counted in days this week", () => {
  const s = withClub([
    ev("a", "theo", "complete", "2026-10-12", { station: "court" }),
    ev("b", "theo", "complete", "2026-10-13", { station: "court" }),
    // Maya did more, but her family hasn't opted in.
    ev("c", "maya", "complete", "2026-10-12", { station: "court" }),
    ev("d", "maya", "complete", "2026-10-13", { station: "court" }),
    ev("e", "maya", "complete", "2026-10-14", { station: "court" }),
    // Last week doesn't count.
    ev("f", "theo", "complete", "2026-10-05", { station: "grip" }),
  ]);
  const crowns = weeklyCrowns(s, at("16:00", "2026-10-14"));
  assert.equal(crowns.length, 1);
  assert.equal(crowns[0].station, "court");
  assert.equal(crowns[0].days, 2);
  assert.deepEqual(
    crowns[0].holders.map((h) => h.name),
    ["Turbo Theo"],
  );
});

test("shoutouts show this week's opted-in kids, newest first", () => {
  const s = withClub([
    ev("p1", "theo", "praise", "2026-10-12", {
      category: "Kept trying",
      coach: "Coach Sam",
    }),
    ev("p2", "theo", "praise", "2026-10-13", {
      category: "Helped a teammate",
      coach: "Coach Jordan",
    }),
    ev("p3", "maya", "praise", "2026-10-13", {
      category: "Kept trying",
      coach: "Coach Sam",
    }),
    ev("p4", "theo", "praise", "2026-10-13", {
      category: "Brave first try",
      status: "rejected",
    }),
  ]);
  const list = weeklyShoutouts(s, at("16:00", "2026-10-14"));
  assert.deepEqual(
    list.map((x) => x.id),
    ["p2", "p1"],
  );
  assert.equal(list[0].name, "Turbo Theo");
  assert.equal(list[0].coach, "Coach Jordan");
});

test("a balance move points to the balance beam, not the vault blocks", () => {
  // Both are on the movement station.
  for (let h = 12; h < 15; h++)
    for (const m of [0, 15, 30, 45]) {
      const when = at(`${h}:${String(m).padStart(2, "0")}`);
      for (const i of earnNow(base(), when, 25))
        if (/balance/i.test(i.skill.title + i.skill.criteria))
          assert.equal(i.zone.name, "Balance beam", i.skill.title);
    }
});
