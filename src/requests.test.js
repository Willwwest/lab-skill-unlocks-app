import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub, sessions } from "./club.js";
import { emptyFloor } from "./floor.js";
import { crewOn, seedGym } from "./gym.js";
import { dayAt } from "./gym-time.js";
import {
  applyStaffing,
  seedStaffing,
  shiftOn,
  staffingOf,
} from "./staffing.js";
import { inbox } from "./outbox.js";

// Monday 2026-10-12, 9:45 am in Phoenix.
const now = new Date("2026-10-12T16:45:00Z");
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
const run = (s, action) => applyStaffing(s, action, now);
const req = (s, pred) => staffingOf(s).requests.find(pred);

test("time off covers a range of days once approved", () => {
  let s = run(base(), {
    type: "request",
    actor: coach("priya"),
    staffId: "priya",
    kind: "timeoff",
    day: "2026-10-14",
    to: "2026-10-16",
  });
  const r = req(s, (x) => x.kind === "timeoff");
  assert.equal(r.to, "2026-10-16");
  assert.throws(
    () =>
      run(s, {
        type: "request",
        actor: coach("priya"),
        staffId: "priya",
        kind: "timeoff",
        day: "2026-10-14",
        to: "2026-10-13",
      }),
    /can't be before/,
  );
  s = run(s, { type: "decide", actor: alex, id: r.id, approve: true });
  for (const d of ["2026-10-14", "2026-10-15", "2026-10-16"])
    assert.equal(shiftOn(s, "priya", dayAt(d)), null);
  assert.ok(shiftOn(s, "priya", dayAt("2026-10-17")) === null); // Saturday anyway
  assert.ok(shiftOn(s, "priya", dayAt("2026-10-19")));
});

test("out sick takes a coach off today and puts their blocks up for cover", () => {
  let s = run(base(), {
    type: "request",
    actor: coach("riley"),
    staffId: "riley",
    kind: "sick",
  });
  assert.equal(shiftOn(s, "riley", now), null);
  const covers = staffingOf(s).requests.filter(
    (x) => x.kind === "cover" && x.staffId === "riley",
  );
  assert.ok(covers.length > 0);
  assert.ok(
    inbox(s, "alex", { manager: true }).some((n) => /out sick/.test(n.text)),
  );
  assert.throws(
    () =>
      run(s, {
        type: "request",
        actor: coach("sam"),
        staffId: "sam",
        kind: "sick",
        day: "2026-10-13",
      }),
    /for today/,
  );
  // Morgan, who isn't working mornings, covers Riley's homeschool block.
  const hs = covers.find((x) => x.index === "4");
  s = run(s, { type: "volunteer", actor: coach("morgan"), id: hs.id });
  s = run(s, { type: "decide", actor: alex, id: hs.id, approve: true });
  const crew = crewOn(s, "4", now).map((c) => c.staffId);
  assert.ok(crew.includes("morgan"));
  assert.ok(!crew.includes("riley"));
});

test("asking a specific coach: only they can take it, and the manager approves", () => {
  let s = run(base(), {
    type: "request",
    actor: coach("dev"),
    staffId: "dev",
    kind: "cover",
    day: "2026-10-13",
    index: "3",
    askStaffId: "riley",
  });
  const r = req(s, (x) => x.askedStaffId === "riley");
  assert.ok(inbox(s, "riley").some((n) => /asked you to take/.test(n.text)));
  assert.ok(!inbox(s, "priya").some((n) => /Cover needed/.test(n.text)));
  assert.throws(
    () => run(s, { type: "volunteer", actor: coach("priya"), id: r.id }),
    /asked someone else/,
  );
  s = run(s, { type: "volunteer", actor: coach("riley"), id: r.id });
  s = run(s, { type: "decide", actor: alex, id: r.id, approve: true });
  const tue = new Date(dayAt("2026-10-13"));
  assert.ok(crewOn(s, "3", tue).some((c) => c.staffId === "riley"));
});

test("managers post open shifts and coaches claim them", () => {
  assert.throws(
    () =>
      run(base(), {
        type: "openShift",
        actor: coach("sam"),
        day: "2026-10-13",
        index: "2",
      }),
    /gym manager/,
  );
  let s = run(base(), {
    type: "openShift",
    actor: alex,
    day: "2026-10-13",
    index: "2",
    note: "Field trip group",
  });
  const r = req(s, (x) => x.kind === "open");
  assert.equal(r.staffId, null);
  assert.ok(inbox(s, "morgan").some((n) => /Open shift/.test(n.text)));
  s = run(s, { type: "volunteer", actor: coach("morgan"), id: r.id });
  s = run(s, { type: "decide", actor: alex, id: r.id, approve: true });
  const tue = new Date(dayAt("2026-10-13"));
  const crew = crewOn(s, "2", tue);
  assert.ok(crew.some((c) => c.staffId === "morgan" && c.role === "attendant"));
  // Morgan's day starts earlier to cover it.
  assert.equal(shiftOn(s, "morgan", tue).start, "12:00");
  assert.ok(inbox(s, "morgan").some((n) => /got the open shift/.test(n.text)));
  assert.ok(sessions(now).length);
});
