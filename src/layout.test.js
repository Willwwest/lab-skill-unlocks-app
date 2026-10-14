import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub, sessions } from "./club.js";
import { applyFloor, emptyFloor } from "./floor.js";
import { applyGym, seedGym } from "./gym.js";
import {
  BUILDING,
  NOTE_MAX,
  applyLayout,
  clampZone,
  defaultLayout,
  floorStatus,
  layoutOf,
  newZoneId,
  openHours,
  turnZone,
  validLayout,
  validZone,
} from "./layout.js";

// Phoenix is UTC-7: 16:45Z is 9:45 am, before the 10:00 homeschool class.
const at = (hhmm) => new Date(`2026-10-12T${hhmm}:00-07:00`);
const homeschool = sessions(at("09:45"))[4];
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(at("09:45")),
});
const alex = { role: "Coach", name: "Coach Alex", staffId: "alex", head: true };
const charlie = {
  role: "Coach",
  name: "Charlie Mitchell",
  staffId: "charlie",
  head: true,
  owner: true,
};
const jordan = {
  role: "Coach",
  name: "Coach Jordan",
  staffId: "jordan",
  head: false,
};
const zone = (s, id, when) =>
  floorStatus(s, when).zones.find((z) => z.id === id);

test("the default floor fits the building and no two zones overlap", () => {
  const l = defaultLayout();
  assert.ok(validLayout(l));
  for (const a of l.zones)
    for (const b of l.zones) {
      if (a === b) continue;
      const apart =
        a.x + a.w <= b.x ||
        b.x + b.w <= a.x ||
        a.y + a.d <= b.y ||
        b.y + b.d <= a.y;
      assert.ok(apart, `${a.id} overlaps ${b.id}`);
    }
  // Every station has somewhere to be on the floor.
  for (const id of ["grip", "wall", "movement", "court", "course"])
    assert.ok(
      l.zones.some((z) => z.station === id),
      id,
    );
});

test("a broken saved layout falls back to the default", () => {
  assert.deepEqual(layoutOf({}).zones, defaultLayout().zones);
  const bad = { version: 1, zones: [{ id: "x", name: "", art: "rig" }] };
  assert.deepEqual(layoutOf({ layout: bad }).zones, defaultLayout().zones);
});

test("before and after hours every zone reads closed", () => {
  const hours = openHours(at("09:45"));
  assert.equal(hours.open, false);
  for (const when of [at("09:45"), at("20:30")])
    assert.ok(
      floorStatus(base(), when).zones.every((z) => z.status === "closed"),
    );
});

test("a planned class holds its stations; the rest of the floor is open gym", () => {
  const s = base();
  // Homeschool ninja plans grip, wall, movement and course; not the court.
  const st = floorStatus(s, at("10:20"));
  assert.equal(zone(s, "rig-grip", at("10:20")).status, "class");
  assert.equal(
    zone(s, "red-walls", at("10:20")).class.name,
    "Homeschool ninja",
  );
  assert.equal(zone(s, "court", at("10:20")).status, "open");
  assert.equal(zone(s, "cafe", at("10:20")).status, "amenity");
  assert.equal(st.liveClasses.length, 1);
});

test("an upcoming class flags its zones, each for the part that uses it", () => {
  // Foundations warms up on the track at 3:30, then takes its stations at 3:35.
  const track = zone(base(), "track", at("15:10"));
  assert.deepEqual(track.soon, { name: "Ninja foundations", start: "15:30" });
  const grip = zone(base(), "rig-grip", at("15:10"));
  assert.equal(grip.status, "open");
  assert.deepEqual(grip.soon, { name: "Ninja foundations", start: "15:35" });
  // Foundations doesn't use the court or the advanced rig.
  assert.equal(zone(base(), "court", at("15:10")).soon, null);
  assert.equal(zone(base(), "advanced", at("15:10")).soon, null);
});

test("a running rotation shows which group is at each zone and when it moves", () => {
  let s = base();
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: homeschool.id,
      childIds: ["theo", "maya", "leo", "ava"],
      actor: jordan,
    },
    at("10:00"),
  );
  s = applyGym(
    s,
    { type: "attendanceDone", session: homeschool.id, count: 2, actor: jordan },
    at("10:01"),
  );
  s = applyGym(
    s,
    {
      type: "startClass",
      session: homeschool.id,
      minutes: 15,
      warmup: 0,
      actor: jordan,
    },
    at("10:02"),
  );
  const run = s.gym.runs[homeschool.id];
  const first = defaultLayout().zones.find(
    (z) => z.station === run.stations[0],
  );
  const z = zone(s, first.id, at("10:05"));
  assert.equal(z.status, "class");
  assert.equal(z.class.group, 1);
  assert.equal(z.class.kids, run.groups[0].length);
  assert.equal(z.class.rotateIn, 12 * 60000);
  // Stations the run dropped go back to open gym.
  const dropped = defaultLayout().zones.find(
    (x) => x.station && !run.stations.includes(x.station),
  );
  assert.equal(zone(s, dropped.id, at("10:05")).status, "open");
});

test("a paused station shows paused with the reason", () => {
  const s = applyFloor(
    base(),
    { type: "outage", station: "court", reason: "Hoop repair", actor: alex },
    at("12:30"),
  );
  const z = zone(s, "court", at("12:30"));
  assert.equal(z.status, "paused");
  assert.equal(z.reason, "Hoop repair");
});

test("only the owners save the floor plan, and it must stay valid", () => {
  const zones = defaultLayout().zones;
  assert.throws(
    () => applyLayout(base(), { type: "save", zones, actor: jordan }),
    /Only the owners/,
  );
  // A gym manager can't either.
  assert.throws(
    () => applyLayout(base(), { type: "save", zones, actor: alex }),
    /Only the owners/,
  );
  const moved = zones.map((z) => (z.id === "court" ? { ...z, x: 10 } : z));
  const s = applyLayout(
    base(),
    { type: "save", zones: moved, actor: charlie },
    at("12:00"),
  );
  assert.equal(layoutOf(s).zones.find((z) => z.id === "court").x, 10);
  assert.equal(s.layout.by, "Charlie Mitchell");
  const outside = zones.map((z) =>
    z.id === "court" ? { ...z, x: BUILDING.w - 2 } : z,
  );
  assert.throws(
    () => applyLayout(base(), { type: "save", zones: outside, actor: charlie }),
    /Basketball court/,
  );
  assert.throws(
    () => applyLayout(base(), { type: "save", zones: [], actor: charlie }),
    /at least one/,
  );
  assert.deepEqual(
    layoutOf(applyLayout(s, { type: "reset", actor: charlie })).zones,
    zones,
  );
});

test("zones snap to the grid and stay on the footprint", () => {
  const z = clampZone({ x: -5.4, y: BUILDING.d - 1.8, w: 2, d: 30.6 });
  assert.deepEqual(
    { x: z.x, y: z.y, w: z.w, d: z.d },
    { x: 0, y: BUILDING.d - 31, w: 4, d: 31 },
  );
  assert.equal(newZoneId(defaultLayout().zones, "Court"), "court-2");
  assert.equal(newZoneId([], "Ninja Rig #2"), "ninja-rig-2");
});

test("turning a zone swaps its footprint about the center and turns its model", () => {
  // The café sits mid-floor, so a turn has room to keep its center.
  const cafe = defaultLayout().zones.find((z) => z.id === "cafe");
  const once = turnZone(cafe);
  assert.equal(once.rotation, 90);
  assert.deepEqual([once.w, once.d], [cafe.d, cafe.w]);
  // Centers stay put to within the 1-foot grid.
  assert.ok(Math.abs(once.x + once.w / 2 - (cafe.x + cafe.w / 2)) <= 0.5);
  assert.ok(Math.abs(once.y + once.d / 2 - (cafe.y + cafe.d / 2)) <= 1);
  let z = cafe;
  for (let i = 0; i < 4; i++) z = turnZone(z);
  assert.equal(z.rotation, 0);
  assert.deepEqual([z.w, z.d], [cafe.w, cafe.d]);
  // A turn near a wall is pulled back inside the building.
  assert.ok(validZone(turnZone({ ...cafe, x: 0, y: 0, w: 60, d: 10 })));
});

test("rotations are quarter turns and TV notes stay short", () => {
  const z = defaultLayout().zones.find((x) => x.id === "bike-games");
  assert.equal(z.art, "fitgames");
  assert.match(z.note, /speeds up/);
  assert.ok(validZone({ ...z, rotation: 270 }));
  assert.equal(validZone({ ...z, rotation: 45 }), false);
  assert.equal(validZone({ ...z, note: "x".repeat(NOTE_MAX + 1) }), false);
  const s = applyLayout(
    base(),
    {
      type: "save",
      zones: defaultLayout().zones.map((x) =>
        x.id === "court" ? { ...x, note: "   ", rotation: undefined } : x,
      ),
      actor: charlie,
    },
    at("12:00"),
  );
  const court = layoutOf(s).zones.find((x) => x.id === "court");
  assert.equal(court.rotation, 0);
  assert.equal(court.note, undefined);
});

test("any owner can save the floor plan, Travis included", () => {
  const travis = {
    role: "Coach",
    name: "Travis",
    staffId: "travis",
    head: true,
    owner: true,
  };
  const s = applyLayout(
    base(),
    { type: "save", zones: defaultLayout().zones, actor: travis },
    at("12:00"),
  );
  assert.equal(s.layout.by, "Travis");
});
