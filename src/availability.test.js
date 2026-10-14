import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub, sessions } from "./club.js";
import { emptyFloor } from "./floor.js";
import { seedGym } from "./gym.js";
import { dayAt } from "./gym-time.js";
import {
  availabilityOf,
  availableFor,
  hoursBand,
  weekHours,
} from "./availability.js";
import {
  applyStaffing,
  coverCandidates,
  seedStaffing,
  shiftOn,
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
});
const coach = (id, extra = {}) => ({
  role: "Coach",
  name: `Coach ${id[0].toUpperCase()}${id.slice(1)}`,
  staffId: id,
  head: false,
  ...extra,
});
const alex = coach("alex", { head: true });
const run = (s, action, at = now) => applyStaffing(s, action, at);

test("standing hours follow weekdays", () => {
  const s = base();
  assert.deepEqual(shiftOn(s, "priya", now), { start: "09:30", end: "18:00" });
  assert.equal(shiftOn(s, "priya", dayAt("2026-10-17")), null); // Saturday
  assert.ok(shiftOn(s, "morgan", dayAt("2026-10-17")));
  assert.equal(shiftOn(s, "morgan", dayAt("2026-10-18")), null); // Sunday
  // Priya works 8.5 h, Monday to Friday.
  assert.equal(weekHours(s, "priya", MON), 42.5);
});

test("a coach sets when they can work and the hours they want", () => {
  let s = base();
  assert.throws(
    () =>
      run(s, {
        type: "availability",
        actor: coach("sam"),
        staffId: "priya",
        weekly: [],
      }),
    /your own/i,
  );
  assert.throws(
    () =>
      run(s, {
        type: "availability",
        actor: coach("priya"),
        staffId: "priya",
        weekly: [],
        minHours: 30,
        maxHours: 20,
      }),
    /can't be more/,
  );
  s = run(s, {
    type: "availability",
    actor: coach("priya"),
    staffId: "priya",
    weekly: [
      { weekday: 1, start: "09:00", end: "18:00" },
      { weekday: 3, start: "12:00", end: "20:00" },
    ],
    minHours: 25,
    maxHours: 35,
  });
  assert.equal(availabilityOf(s, "priya").maxHours, 35);
  assert.equal(availableFor(s, "priya", MON, "10:00", "11:00").ok, true);
  assert.match(
    availableFor(s, "priya", "2026-10-13", "10:00", "11:00").reason,
    /Not available/,
  );
  assert.match(
    availableFor(s, "priya", "2026-10-14", "10:00", "11:00").reason,
    /Outside/,
  );
  // 42.5 booked hours is over her 35, and over the gym's 40-hour cap.
  assert.equal(hoursBand(s, "priya", MON).status, "cap");
  assert.equal(hoursBand(s, "jordan", MON).hours, 37.5);
  // Coaches with no range are just shown as such.
  assert.equal(hoursBand(s, "morgan", MON).status, "none");
});

test("days a coach can't work rule them out, and can be removed", () => {
  let s = run(base(), {
    type: "unavailable",
    actor: coach("riley"),
    staffId: "riley",
    from: "2026-10-14",
    to: "2026-10-15",
    note: "Exams",
  });
  assert.match(
    availableFor(s, "riley", "2026-10-15", "10:00", "11:00").reason,
    /Exams/,
  );
  assert.equal(
    availableFor(s, "riley", "2026-10-16", "10:00", "11:00").ok,
    true,
  );
  const id = availabilityOf(s, "riley").dated[0].id;
  s = run(s, {
    type: "removeUnavailable",
    actor: coach("riley"),
    staffId: "riley",
    id,
  });
  assert.equal(availabilityOf(s, "riley").dated.length, 0);
});

test("cover suggestions put coaches who can't work it or would go over last", () => {
  let s = base();
  const evening = sessions(now)[3];
  s = run(s, {
    type: "availability",
    actor: coach("riley"),
    staffId: "riley",
    weekly: [{ weekday: 1, start: "09:00", end: "18:00" }],
  });
  s = run(s, {
    type: "availability",
    actor: coach("priya"),
    staffId: "priya",
    weekly: [],
    maxHours: 40,
  });
  const list = coverCandidates(s, evening, now);
  const riley = list.find((c) => c.staff.id === "riley");
  const priya = list.find((c) => c.staff.id === "priya");
  assert.equal(riley.available, false);
  assert.equal(priya.overMax, true);
  assert.equal(list.at(-1).available, false);
  // The weekly cap is the owner's to set.
  s = run(s, {
    type: "rules",
    actor: coach("charlie", { head: true, owner: true }),
    rules: { maxWeekly: 30 },
  });
  assert.equal(hoursBand(s, "jordan", MON).status, "cap");
  assert.ok(alex);
});
