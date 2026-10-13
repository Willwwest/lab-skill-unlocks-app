import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub } from "./club.js";
import { emptyFloor } from "./floor.js";
import { applyGym, seedGym, withHistory, withoutHistory } from "./gym.js";
import {
  activity,
  coachWeek,
  dateRange,
  insights,
  kidVisits,
  median,
} from "./insights.js";

const now = new Date("2026-10-12T19:00:00Z");
const world = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(now, { history: true }),
});

test("the demo history is deterministic and stays out of the live records", () => {
  const a = world();
  const b = world();
  assert.deepEqual(
    a.gym.history.visits.slice(0, 5),
    b.gym.history.visits.slice(0, 5),
  );
  assert.equal(a.gym.checkins.length, 0);
  assert.ok(a.gym.history.visits.length > 500);
  assert.equal(seedGym(now).history, undefined);
});

test("compact saves reconstruct the same demo history and keep live changes", () => {
  const state = world();
  const before = insights(state, { days: 28, now });
  const oldBytes = JSON.stringify(state.gym).length;
  const compact = withoutHistory(state.gym);
  assert.equal(compact.history, undefined);
  assert.equal(compact.historyGeneratedAt, state.gym.history.generated);
  assert.ok(JSON.stringify(compact).length < oldBytes / 3);

  const restored = withHistory(JSON.parse(JSON.stringify(compact)));
  assert.deepEqual(restored.history, state.gym.history);
  assert.deepEqual(
    insights({ ...state, gym: restored }, { days: 28, now }),
    before,
  );

  // An existing save containing the full history also migrates without a reset.
  assert.deepEqual(withHistory(state.gym), state.gym);
  assert.equal(
    withHistory(withoutHistory(state.gym)).checkins,
    state.gym.checkins,
  );
});

test("live check-ins join the history", () => {
  let s = world();
  const before = activity(s).visits.length;
  s = applyGym(
    s,
    {
      type: "checkIn",
      session: "2026-10-12:2",
      childIds: ["ava"],
      actor: { role: "Coach", name: "Coach Priya", staffId: "priya" },
    },
    now,
  );
  assert.equal(activity(s).visits.length, before + 1);
});

test("KPIs compare a period with the one before it", () => {
  const d = insights(world(), { days: 14, now });
  assert.equal(d.dates.length, 14);
  assert.equal(d.daily.length, 14);
  assert.ok(d.kpis.checkins.value > 0 && d.kpis.checkins.prev > 0);
  // The demo waits shrink over the eight weeks.
  assert.ok(d.kpis.wait.value < d.kpis.wait.prev);
  assert.equal(d.heat.rows.length, 6);
});

test("new kids who stop coming are flagged; kids in their first week are not", () => {
  const d = insights(world(), { days: 14, now });
  const by = Object.fromEntries(d.newKids.map((k) => [k.id, k]));
  assert.equal(by.hana.atRisk, true);
  assert.equal(by.june.atRisk, true);
  assert.equal(by.eli.atRisk, false);
  assert.equal(by.kai.atRisk, false);
  assert.ok(
    d.newKids.findIndex((k) => !k.atRisk) >
      d.newKids.findIndex((k) => k.atRisk),
  );
});

test("a coach's week counts their unlocks and ranks them", () => {
  const w = coachWeek(world(), "Coach Priya", now);
  assert.equal(w.unlocks.length, 7);
  assert.ok(w.rank >= 1 && w.rank <= 7);
});

test("helpers", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(dateRange(3, now).at(-1), "2026-10-12");
  assert.equal(kidVisits(world(), "sofia", 42, now).length, 42);
});
