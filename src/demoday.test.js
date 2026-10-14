import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub } from "./club.js";
import { emptyFloor } from "./floor.js";
import { seedGym } from "./gym.js";
import { toMinutes } from "./gym-time.js";
import { floorStatus } from "./layout.js";
import { earnNow, weeklyCrowns, weeklyShoutouts } from "./tvs.js";
import {
  DEMO_END,
  DEMO_START,
  demoCaption,
  demoMoment,
  demoState,
} from "./demoday.js";

const DAY = "2026-10-12";
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(demoMoment(DAY, DEMO_START)),
});
const at = (t) => {
  const m = toMinutes(t);
  const s = demoState(base(), DAY, m);
  return {
    s,
    status: floorStatus(s, demoMoment(DAY, m)),
    when: demoMoment(DAY, m),
  };
};
const zone = (status, id) => status.zones.find((z) => z.id === id);

test("the demo clock lands on the gym's own times", () => {
  assert.equal(
    demoMoment(DAY, toMinutes("10:00")).toISOString(),
    "2026-10-12T17:00:00.000Z",
  );
  assert.ok(DEMO_START < toMinutes("10:00") && DEMO_END > toMinutes("20:00"));
});

test("before opening everything is closed and the caption says so", () => {
  const { status } = at("09:50");
  assert.ok(status.zones.every((z) => z.status === "closed"));
  assert.match(demoCaption(status), /^Closed/);
});

test("the morning class runs for real: gold zones, groups and a rotation clock", () => {
  const { s, status } = at("10:30");
  const held = status.zones.filter((z) => z.status === "class");
  assert.ok(held.length > 0);
  assert.ok(held.every((z) => z.class.name === "Homeschool ninja"));
  assert.ok(held.some((z) => z.class.group && z.class.rotateIn > 0));
  assert.equal(zone(status, "court").status, "open");
  assert.equal(Object.keys(s.gym.runs).length, 1);
  assert.match(demoCaption(status), /Homeschool ninja is running/);
});

test("open gym frees the floor, and crowns and shoutouts build up", () => {
  const { s, status, when } = at("13:40");
  assert.ok(
    status.zones.filter((z) => z.station).every((z) => z.status === "open"),
  );
  assert.equal(earnNow(s, when).length, 5);
  assert.ok(weeklyCrowns(s, when).length >= 3);
  assert.equal(weeklyShoutouts(s, when)[0].name, "Maya the Mighty");
  assert.match(demoCaption(status), /^Open gym/);
});

test("the court pause shows red and drops out of the points strip", () => {
  const { s, status, when } = at("14:10");
  assert.equal(zone(status, "court").status, "paused");
  assert.ok(earnNow(s, when).every((i) => i.station !== "court"));
  assert.match(demoCaption(status), /paused/);
  assert.equal(zone(at("14:50").status, "court").status, "open");
});

test("half an hour before a class its zones get the gold edge", () => {
  const { status } = at("15:10");
  const soon = status.zones.filter((z) => z.soon?.name === "Ninja foundations");
  assert.ok(soon.length > 0);
  // Still free (open gym, or the track as shared space) until the class takes them.
  assert.ok(soon.every((z) => z.status !== "class"));
  assert.match(demoCaption(status), /starts soon/);
});

test("evening classes run, then the gym closes; the base state is never touched", () => {
  const b = base();
  const before = JSON.stringify(b);
  demoState(b, DAY, toMinutes("17:00"));
  assert.equal(JSON.stringify(b), before);
  const { status } = at("17:00");
  assert.ok(status.zones.some((z) => z.class?.name === "Ninja progressions"));
  assert.ok(at("20:15").status.zones.every((z) => z.status === "closed"));
});
