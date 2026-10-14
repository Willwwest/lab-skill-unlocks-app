import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub, sessions } from "./club.js";
import { emptyFloor } from "./floor.js";
import { applyGym, runOf, seedGym } from "./gym.js";
import { floorStatus } from "./layout.js";
import { applyFloorUse, defaultUse, useFor, validUse } from "./flooruse.js";

// Phoenix is UTC-7. Homeschool ninja runs 10:00–11:00: a 5-minute warm-up,
// four 12-minute stations from 10:05 to 10:53, then the close.
const at = (hhmm) => new Date(`2026-10-12T${hhmm}:00-07:00`);
const homeschool = sessions(at("09:00"))[4];
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(at("09:00")),
});
const coach = (staffId, name, extra = {}) => ({
  role: "Coach",
  name,
  staffId,
  head: false,
  ...extra,
});
const jordan = coach("jordan", "Coach Jordan"); // homeschool's head coach
const sam = coach("sam", "Coach Sam");
const charlie = coach("charlie", "Charlie Mitchell", {
  head: true,
  owner: true,
});
const held = (s, when) =>
  floorStatus(s, when)
    .zones.filter((z) => z.status === "class")
    .map((z) => z.id)
    .sort();
const zone = (s, when, id) =>
  floorStatus(s, when).zones.find((z) => z.id === id);

test("a class holds only the zones marked for each part, not every lane", () => {
  // Warm-up: the track only. The rig is still open, flagged for 10:05.
  assert.deepEqual(held(base(), at("10:02")), ["track"]);
  const grip = zone(base(), at("10:02"), "rig-grip");
  assert.equal(grip.status, "open");
  assert.deepEqual(grip.soon, { name: "Homeschool ninja", start: "10:05" });
  // Stations: one section of the rig per station, not the whole rig.
  assert.deepEqual(held(base(), at("10:20")), [
    "red-walls",
    "rig-course",
    "rig-grip",
    "vault",
  ]);
  assert.equal(zone(base(), at("10:20"), "advanced").status, "open");
  assert.equal(zone(base(), at("10:20"), "track-wall").status, "open");
  assert.equal(zone(base(), at("10:20"), "rig-grip").class.segment, "Stations");
  // Close: nothing marked by default, so the floor opens back up.
  assert.deepEqual(held(base(), at("10:56")), []);
});

test("head coaches and owners mark which zones each part uses", () => {
  const use = {
    ...defaultUse(),
    close: ["cafe"],
    stations: { ...defaultUse().stations, course: ["advanced"] },
  };
  assert.throws(
    () =>
      applyFloorUse(
        base(),
        { type: "save", index: 4, use, actor: sam },
        at("09:00"),
      ),
    /head coach/,
  );
  const s = applyFloorUse(
    base(),
    { type: "save", index: 4, use, actor: jordan },
    at("09:00"),
  );
  assert.equal(s.floorUse[4].by, "Coach Jordan");
  assert.deepEqual(useFor(s, 4).stations.course, ["advanced"]);
  // The course station now takes the advanced rig instead of the L4–L6 lanes.
  assert.equal(zone(s, at("10:20"), "advanced").status, "class");
  assert.equal(zone(s, at("10:20"), "rig-course").status, "open");
  // And the close takes the café.
  assert.equal(zone(s, at("10:56"), "cafe").status, "class");
  // An owner can put it back to the default.
  const back = applyFloorUse(
    s,
    { type: "reset", index: 4, actor: charlie },
    at("09:00"),
  );
  assert.deepEqual(useFor(back, 4), defaultUse());
});

test("a running class blocks only the stations its groups are at", () => {
  let s = base();
  const kids = ["theo", "leo", "ava", "eli"];
  s = applyGym(
    s,
    { type: "checkIn", session: homeschool.id, childIds: kids, actor: jordan },
    at("10:00"),
  );
  s = applyGym(
    s,
    { type: "attendanceDone", session: homeschool.id, count: 2, actor: jordan },
    at("10:00"),
  );
  s = applyGym(
    s,
    { type: "startClass", session: homeschool.id, actor: jordan },
    at("10:00"),
  );
  const run = runOf(s, homeschool.id);
  assert.equal(run.groups.length, 2);
  // Two groups on four stations: two stations' zones held, two free.
  const now = new Date(Date.parse(run.startedAt) + (run.warmup + 1) * 60000);
  const busy = held(s, now);
  const use = defaultUse().stations;
  const expected = [run.stations[0], run.stations[1]].flatMap((st) => use[st]);
  assert.deepEqual(busy, [...expected].sort());
  // A station the groups reach next round is flagged for when they arrive.
  const coming = use[run.stations[2]][0];
  assert.equal(zone(s, now, coming).status, "open");
  assert.equal(zone(s, now, coming).soon?.name, "Homeschool ninja");
});

test("a marked zone that isn't on the floor plan is ignored", () => {
  assert.ok(validUse(defaultUse()));
  assert.equal(
    validUse({ warmup: ["x"], close: [], stations: { nope: [] } }),
    false,
  );
  const s = applyFloorUse(
    base(),
    {
      type: "save",
      index: 4,
      use: { ...defaultUse(), warmup: ["track", "gone-zone"] },
      actor: jordan,
    },
    at("09:00"),
  );
  assert.deepEqual(held(s, at("10:02")), ["track"]);
  assert.throws(
    () =>
      applyFloorUse(base(), {
        type: "save",
        index: 2,
        use: defaultUse(),
        actor: charlie,
      }),
    /Choose a class/,
  );
});
