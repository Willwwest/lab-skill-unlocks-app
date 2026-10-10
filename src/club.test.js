import test from "node:test";
import assert from "node:assert/strict";
import { seed, earnedIds } from "./domain.js";
import {
  applyClub,
  clubStats,
  crowns,
  emptyClub,
  sessions,
  dayKey,
  validClub,
  stationFromInput,
  seasonKey,
  sessionName,
} from "./club.js";
const now = new Date("2026-10-09T22:00:00Z");
const session = sessions(now)[0].id;
const base = () => ({ ...seed(), club: emptyClub() });
const action = { role: "Coach", coach: "Coach Sam", childId: "leo", session };
const record = (s, kind, extra = {}, at = now) =>
  applyClub(s, { ...action, type: "record", kind, ...extra }, at);
test("a scan requests participation; only trainer approval grants points", () => {
  let s = record(base(), "class", { role: "Athlete" });
  assert.equal(clubStats(s, "leo").total, 0);
  assert.throws(
    () =>
      applyClub(
        s,
        {
          ...action,
          role: "Athlete",
          type: "approve",
          id: s.club.events[0].id,
        },
        now,
      ),
    /trainer/,
  );
  s = applyClub(
    s,
    { ...action, type: "approve", id: s.club.events[0].id },
    now,
  );
  assert.equal(clubStats(s, "leo").classes, 1);
  assert.equal(clubStats(s, "leo").total, 5);
});
test("class and station duplicates cannot be farmed even while pending", () => {
  let s = record(base(), "class");
  s = record(s, "visit", { station: "grip", role: "Athlete" });
  assert.throws(() => record(s, "class"), /Already/);
  assert.throws(
    () => record(s, "visit", { station: "grip", role: "Athlete" }),
    /Already/,
  );
});
test("station approval and coach direct awards require confirmed class attendance", () => {
  let s = record(base(), "visit", { station: "grip", role: "Athlete" });
  assert.throws(
    () =>
      applyClub(
        s,
        { ...action, type: "approve", id: s.club.events[0].id },
        now,
      ),
    /attendance/,
  );
  assert.throws(
    () => record(base(), "visit", { station: "wall" }),
    /attendance/,
  );
  assert.throws(
    () => record(base(), "complete", { station: "wall", note: "Wall A catch" }),
    /attendance/,
  );
});
test("completion is trainer-only and requires a concrete task description", () => {
  let s = record(base(), "class");
  assert.throws(
    () =>
      record(s, "complete", {
        station: "wall",
        role: "Athlete",
        note: "Finished",
      }),
    /trainer/,
  );
  assert.throws(() => record(s, "complete", { station: "wall" }), /Describe/);
  s = record(s, "complete", { station: "wall", note: "Wall A top catch" });
  assert.equal(clubStats(s, "leo").total, 10);
  assert.deepEqual(earnedIds(s, "leo"), []);
});
test("recognition is limited to three specific awards a day", () => {
  let s = record(base(), "class");
  for (const category of [
    "Kept trying",
    "Helped a teammate",
    "Brave first try",
  ])
    s = record(s, "praise", { category });
  assert.throws(
    () => record(s, "praise", { category: "Great listening" }),
    /Three/,
  );
  assert.equal(clubStats(s, "leo").total, 14);
});
test("100 confirmed attempts earns a milestone without any completed skills", () => {
  let s = base();
  for (let i = 0; i < 100; i++) {
    const date = new Date(now.getTime() - i * 86400000);
    const session = sessions(date)[0].id;
    s = record(s, "class", { session }, date);
    s = record(s, "visit", { session, station: "grip" }, date);
  }
  const result = clubStats(s, "leo");
  assert.equal(result.visits, 100);
  assert.equal(result.classes, 100);
  assert.equal(result.days, 100);
  assert.ok(result.badges.find((b) => b.id === "visits-100").earned);
  assert.equal(result.badges.find((b) => b.id === "visits-100").bonus, 100);
  assert.equal(result.skillPoints, 0);
  assert.equal(s.rewards.filter((r) => r.childId === "leo").length, 0);
});
test("multiple classes in one day earn separate stars but one loyalty day", () => {
  let s = record(base(), "class");
  s = record(s, "class", { session: sessions(now)[1].id });
  assert.equal(clubStats(s, "leo").classes, 2);
  assert.equal(clubStats(s, "leo").days, 1);
});
test("crowns count distinct completion days and only opted-in matching cohorts", () => {
  let s = record(base(), "class");
  s = record(s, "complete", { station: "wall", note: "Wall A catch" });
  const second = sessions(now)[1].id;
  s = record(s, "class", { session: second });
  s = record(s, "complete", {
    session: second,
    station: "wall",
    note: "Wall A catch",
  });
  assert.equal(crowns(s.club, "6–8 / Foundations", now)[1].winners.length, 0);
  s = applyClub(
    s,
    {
      ...action,
      type: "profile",
      group: "6–8 / Foundations",
      alias: "Little Fox",
      optIn: true,
    },
    now,
  );
  assert.equal(crowns(s.club, "6–8 / Foundations", now)[1].winners[0].count, 1);
  assert.equal(crowns(s.club, "9–12 / Foundations", now)[1].winners.length, 0);
  assert.equal(
    crowns(s.club, "6–8 / Foundations", new Date("2026-10-19T22:00:00Z"))[1]
      .winners.length,
    0,
  );
});
test("tied completion-day scores share the crown", () => {
  let s = base();
  for (const childId of ["leo", "theo"]) {
    s = record(s, "class", { childId });
    s = record(s, "complete", {
      childId,
      station: "wall",
      note: "Wall A catch",
    });
    s = applyClub(
      s,
      {
        ...action,
        childId,
        type: "profile",
        group: "6–8 / Foundations",
        alias: childId,
        optIn: true,
      },
      now,
    );
  }
  assert.equal(crowns(s.club, "6–8 / Foundations", now)[1].winners.length, 2);
});
test("reward reservation prevents overspending and cancellation restores balance", () => {
  let s = base();
  const initial = clubStats(s, "theo").balance;
  s = applyClub(
    s,
    {
      ...action,
      childId: "theo",
      role: "Parent",
      type: "redeem",
      prizeId: "sticker",
    },
    now,
  );
  assert.equal(clubStats(s, "theo").balance, initial - 100);
  assert.equal(clubStats(s, "theo").total, initial);
  assert.throws(
    () =>
      applyClub(
        s,
        {
          ...action,
          childId: "theo",
          role: "Parent",
          type: "redeem",
          prizeId: "sticker",
        },
        now,
      ),
    /Keep earning/,
  );
  s = applyClub(
    s,
    { ...action, childId: "theo", type: "cancel", id: s.club.claims[0].id },
    now,
  );
  assert.equal(clubStats(s, "theo").balance, initial);
});
test("attendance correction retracts dependent stars and leaves an audit trail", () => {
  let s = record(base(), "class");
  s = record(s, "visit", { station: "grip" });
  s = record(s, "praise", { category: "Kept trying" });
  s = applyClub(
    s,
    {
      ...action,
      type: "revoke",
      id: s.club.events[0].id,
      reason: "Wrong athlete selected",
    },
    now,
  );
  assert.equal(clubStats(s, "leo").total, 0);
  assert.equal(clubStats(s, "leo").visits, 0);
  assert.equal(clubStats(s, "leo").classes, 0);
  assert.ok(s.club.events.every((e) => e.status === "revoked" && e.reason));
});
test("invalid and stale station input cannot produce an award", () => {
  assert.equal(stationFromInput("LAB-GRIP"), "grip");
  assert.equal(stationFromInput("https://gym.test/?station=wall"), "wall");
  assert.equal(stationFromInput("javascript:alert(1)"), null);
  assert.equal(stationFromInput("LAB-FAKE"), null);
  assert.throws(
    () => record(base(), "class", { session: "2020-01-01:0" }),
    /today/,
  );
});
test("Phoenix dates and weekly season reset work across UTC midnight", () => {
  assert.equal(dayKey("2026-10-10T02:00:00Z"), "2026-10-09");
  assert.equal(seasonKey("2026-10-12T02:00:00Z"), "2026-10-05");
  assert.equal(seasonKey("2026-10-12T08:00:00Z"), "2026-10-12");
});
test("persistence accepts valid events and rejects malformed ones", () => {
  const s = record(base(), "class");
  assert.ok(validClub(JSON.parse(JSON.stringify(s.club))));
  assert.equal(validClub({ ...s.club, events: [{}] }), false);
});
test("stored session ids resolve to their class name", () => {
  assert.equal(sessionName(sessions(now)[1].id), "Ninja progressions");
  assert.equal(sessionName("2026-10-10:9"), "Class");
});
test("trainer names and correction reasons are trimmed to their limits", () => {
  let s = record(base(), "class", { coach: `  ${"J".repeat(60)}  ` });
  assert.equal(s.club.events[0].coach.length, 40);
  s = applyClub(
    s,
    {
      ...action,
      type: "revoke",
      id: s.club.events[0].id,
      reason: ` ${"x".repeat(300)} `,
    },
    now,
  );
  assert.equal(s.club.events[0].reason.length, 200);
  assert.throws(
    () =>
      applyClub(
        record(base(), "class"),
        { ...action, type: "revoke", id: "x", reason: "   " },
        now,
      ),
    /not found|reason/,
  );
});
