import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub } from "./club.js";
import { emptyFloor } from "./floor.js";
import { seedGym } from "./gym.js";
import { applyStaffing, seedStaffing } from "./staffing.js";
import { applyShifts } from "./shifts.js";
import { applyOutbox, inbox, unread } from "./outbox.js";

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

test("requests, covers and decisions reach the right people", () => {
  let s = applyStaffing(
    base(),
    {
      type: "request",
      actor: coach("dev"),
      staffId: "dev",
      kind: "cover",
      day: "2026-10-13",
      index: "3",
    },
    now,
  );
  // Alex manages (the request) and coaches (the open cover).
  assert.deepEqual(
    unread(s, "alex", { manager: true })
      .map((n) => n.kind)
      .sort(),
    ["cover.needed", "request.created"],
  );
  assert.match(inbox(s, "priya")[0].text, /Cover needed/);
  assert.equal(inbox(s, "dev").length, 0);
  const req = s.staffing.requests.find((r) => r.day === "2026-10-13");
  s = applyStaffing(
    s,
    { type: "volunteer", actor: coach("riley"), id: req.id },
    now,
  );
  s = applyStaffing(
    s,
    { type: "decide", actor: alex, id: req.id, approve: true },
    now,
  );
  assert.match(inbox(s, "dev")[0].text, /^Approved/);
  assert.match(inbox(s, "riley")[0].text, /covering for Coach Dev/);
  const ids = unread(s, "dev").map((n) => n.id);
  s = applyOutbox(s, { actor: coach("dev"), ids }, now);
  assert.equal(unread(s, "dev").length, 0);
});

test("publishing a week tells everyone on it", () => {
  let s = applyShifts(
    base(),
    { type: "startWeek", actor: alex, week: "2026-10-19" },
    now,
  );
  s = applyShifts(
    s,
    { type: "publish", actor: alex, week: "2026-10-19", force: true },
    now,
  );
  assert.match(
    inbox(s, "priya")[0].text,
    /schedule for the week of Oct 19 is out/,
  );
});
