import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub } from "./club.js";
import { emptyFloor } from "./floor.js";
import { seedGym } from "./gym.js";
import { seedSchedule } from "./schedule.js";
import { floorStatus, openHours } from "./layout.js";
import { applyFloorUse, defaultUse, useFor } from "./flooruse.js";
import { earnNow, nextOpening, openAgain, todaySchedule } from "./tvs.js";
import { demoDayFrom, demoRange } from "./demoday.js";

// Phoenix is UTC-7. Sunday, October 18, 2026 is closed (a holiday).
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00-07:00`);
const SUN = "2026-10-18";
const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(at("2026-10-12", "09:00")),
  schedule: {
    ...seedSchedule(),
    exceptions: [{ id: "x1", day: SUN, kind: "closed", note: "Holiday" }],
  },
});
const owner = {
  role: "Coach",
  name: "Charlie Mitchell",
  staffId: "charlie",
  head: true,
  owner: true,
};

test("on a closed day the board is dark all day and says when it reopens", () => {
  const s = base();
  assert.deepEqual(openHours(at(SUN, "12:00"), s), {
    start: null,
    end: null,
    open: false,
    closedToday: true,
  });
  const status = floorStatus(s, at(SUN, "12:00"));
  assert.equal(status.hours.closedToday, true);
  assert.ok(status.zones.every((z) => z.status === "closed"));
  assert.deepEqual(todaySchedule(s, at(SUN, "12:00")), []);
  assert.deepEqual(earnNow(s, at(SUN, "12:00")), []);
  const next = nextOpening(s, at(SUN, "12:00"));
  assert.deepEqual(next, {
    day: "2026-10-19",
    weekday: "tomorrow",
    start: "10:00",
  });
  assert.equal(openAgain(next), "Open again tomorrow at 10:00.");
});

test("an open day takes its hours from the schedule", () => {
  const h = openHours(at("2026-10-19", "12:00"), base());
  assert.equal(h.closedToday, false);
  assert.equal(h.open, true);
  assert.deepEqual([h.start, h.end], [600, 1200]);
});

test("floor use can be marked on a day the class doesn't run", () => {
  const s = applyFloorUse(
    base(),
    {
      type: "save",
      index: "4",
      use: { ...defaultUse(), close: ["cafe"] },
      actor: owner,
    },
    at(SUN, "12:00"),
  );
  assert.deepEqual(useFor(s, "4").close, ["cafe"]);
});

test("the demo day skips a closed day and spans that day's hours", () => {
  assert.equal(demoDayFrom(base(), at(SUN, "12:00")), "2026-10-19");
  assert.equal(demoDayFrom(base(), at("2026-10-19", "08:00")), "2026-10-19");
  assert.deepEqual(demoRange(base(), "2026-10-19"), {
    start: 585,
    end: 1230,
  });
});
