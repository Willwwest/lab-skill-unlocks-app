// The pure parts of the database sync: merging shared documents and
// turning state changes into writes. scripts/sync-e2e.mjs covers the
// whole loop against a real database.
import test from "node:test";
import assert from "node:assert/strict";
import { merge3 } from "./merge.js";
import { Ids } from "./ids.js";
import { skills, floor, layout, docsOps } from "./adapters.js";
import { docDefaults } from "./docdefaults.js";
import { apply, seed } from "../domain.js";
import { applyStaffing } from "../staffing.js";
import { defaultLayout } from "../layout.js";
import { emptyFloor } from "../floor.js";

const me = {
  org_id: "o",
  location_id: "l",
  staff_id: "s",
  guardian_id: null,
  device_id: null,
};
const ids = new Ids();
for (const [kind, app] of [
  ["athlete", "theo"],
  ["skill", "S07"],
  ["skill", "S08"],
  ["skill", "S09"],
  ["skill", "S10"],
  ["station", "grip"],
])
  ids.add(kind, app, `${kind}-${app}`);
ids.addStaff("jordan", "staff-jordan", "Coach Jordan");
const ctx = {
  ids,
  me,
  sessionId: async (x) => `session-${x}`,
  blockId: async (x) => `block-${x}`,
};

test("merge keeps both people's changes to different records", () => {
  const base = {
    portfolios: { a: { x: 1 }, b: { x: 1 } },
    list: [{ id: 1, v: 1 }],
  };
  const local = {
    portfolios: { a: { x: 2 }, b: { x: 1 } },
    list: [
      { id: 1, v: 1 },
      { id: 2, v: 2 },
    ],
  };
  const remote = {
    portfolios: { a: { x: 1 }, b: { x: 3 } },
    list: [
      { id: 1, v: 5 },
      { id: 3, v: 3 },
    ],
  };
  assert.deepEqual(merge3(base, local, remote), {
    portfolios: { a: { x: 2 }, b: { x: 3 } },
    list: [
      { id: 1, v: 5 },
      { id: 3, v: 3 },
      { id: 2, v: 2 },
    ],
  });
});

test("merge: a record removed on one side stays removed", () => {
  const base = { list: [{ id: 1 }, { id: 2 }] };
  const local = { list: [{ id: 1 }] };
  const remote = { list: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  assert.deepEqual(merge3(base, local, remote).list, [{ id: 1 }, { id: 3 }]);
});

test("merge: the same field changed on both sides takes the local edit", () => {
  assert.deepEqual(merge3({ a: 1 }, { a: 2 }, { a: 3 }), { a: 2 });
});

test("a first save of a shared document merges against the app's seed", () => {
  const actor = (staffId) => ({ role: "Coach", name: staffId, staffId });
  const mine = applyStaffing(
    {},
    {
      type: "portfolio",
      staffId: "priya",
      portfolio: { class: 50, open: 30, floater: 20 },
      actor: actor("priya"),
    },
  );
  const theirs = applyStaffing(
    {},
    {
      type: "portfolio",
      staffId: "riley",
      portfolio: { class: 20, open: 60, floater: 20 },
      actor: actor("riley"),
    },
  );
  const [op] = docsOps({}, mine, docDefaults).filter(
    (o) => o.key === "staffing",
  );
  const merged = merge3(op.base, op.doc, theirs.staffing);
  assert.equal(merged.portfolios.priya.class, 50);
  assert.equal(merged.portfolios.riley.open, 60);
});

test("unchanged state writes nothing", async () => {
  const s = { ...seed(), floor: emptyFloor(), layout: defaultLayout() };
  for (const a of [skills, floor, layout])
    assert.deepEqual(await a.ops(s, s, ctx), []);
  assert.deepEqual(docsOps(s, s, docDefaults), []);
});

test("a new award goes through award_skill with the app's id", async () => {
  const s = seed();
  const next = apply(s, {
    type: "award",
    childId: "theo",
    skillId: "S07",
    coach: "Coach Jordan",
    value: "Demonstrated",
    confirmed: true,
  });
  const ops = await skills.ops(s, next, ctx);
  const award = next.awards.at(-1);
  assert.deepEqual(ops[0], {
    t: "rpc",
    fn: "award_skill",
    args: {
      p_athlete: "athlete-theo",
      p_skill: "skill-S07",
      p_location: "l",
      p_value: null,
      p_note: null,
      p_second_date: null,
      p_project: null,
      p_id: award.id,
      p_at: award.at,
    },
  });
});

test("goals become deletes and inserts", async () => {
  const s = seed();
  const next = apply(s, { type: "goal", childId: "theo", skillId: "S09" });
  const ops = await skills.ops(s, next, ctx);
  assert.deepEqual(ops, [
    {
      t: "delete",
      table: "athlete_goals",
      match: { athlete_id: "athlete-theo", skill_id: "skill-S09" },
    },
  ]);
});

test("photo consent goes through set_athlete_photo", async () => {
  const s = { floor: emptyFloor() };
  const next = { floor: { ...emptyFloor(), consent: { theo: false } } };
  assert.deepEqual(await floor.ops(s, next, ctx), [
    {
      t: "rpc",
      fn: "set_athlete_photo",
      args: { p_athlete: "athlete-theo", p_consent: false, p_avatar: null },
    },
  ]);
});

test("cosmetic differences in a zone write nothing", async () => {
  const l = defaultLayout();
  const next = {
    layout: {
      ...l,
      zones: l.zones.map((z) => ({ ...z, note: z.note ?? undefined })),
    },
  };
  assert.deepEqual(await layout.ops({ layout: l }, next, ctx), []);
});
