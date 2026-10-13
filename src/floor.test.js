import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import {
  applyClub,
  clubStats,
  emptyClub,
  isHere,
  sessionPhase,
  sessions,
} from "./club.js";
import {
  applyFloor,
  classToday,
  emptyFloor,
  ensurePresent,
  hereNow,
  matchKid,
  photoConsent,
  readySkills,
  recordAt,
  validFloor,
} from "./floor.js";
import { families, parsePass, familyCode, kidCode, kidInfo } from "./roster.js";
import { people } from "./domain.js";

// 3:00 pm in Phoenix (UTC-7): before both classes, during afternoon open gym.
const now = new Date("2026-10-09T22:00:00Z");
const today = sessions(now);
const foundations = today[0];
const openGym = today[2];
const base = () => ({ ...seed(), club: emptyClub(), floor: emptyFloor() });
const coach = { role: "Coach", name: "Coach Sam", head: false };
const head = { role: "Coach", name: "Coach Alex", head: true };

test("the schedule marks blocks live, upcoming and done on the gym clock", () => {
  assert.equal(sessionPhase(openGym, now), "live");
  assert.equal(sessionPhase(foundations, now), "upcoming");
  assert.equal(sessionPhase(today[3], now), "upcoming");
  assert.equal(
    sessionPhase(foundations, new Date("2026-10-10T01:00:00Z")),
    "done",
  );
});

test("a family pass checks kids in and requests, not grants, class attendance", () => {
  const parker = families.find((f) => f.id === "parker");
  let s = applyFloor(
    base(),
    { type: "checkIn", familyId: "parker", childIds: parker.kids },
    now,
  );
  assert.ok(isHere(s, "theo", now));
  const att = s.club.events.filter(
    (e) => e.childId === "theo" && e.kind === "class",
  );
  assert.equal(att.length, 1);
  assert.equal(att[0].status, "pending");
  assert.equal(att[0].session, foundations.id);
  assert.equal(clubStats(s, "theo").classes, 0);
  // Scanning again does not duplicate presence or attendance.
  s = applyFloor(
    s,
    { type: "checkIn", familyId: "parker", childIds: ["theo"] },
    now,
  );
  assert.equal(hereNow(s, now).length, 1);
  assert.equal(s.club.events.length, 1);
});

test("open-gym-only kids check in without a class request", () => {
  assert.deepEqual(kidInfo.finn.classes, []);
  const s = applyFloor(base(), { type: "checkIn", childIds: ["finn"] }, now);
  assert.ok(isHere(s, "finn", now));
  assert.equal(s.club.events.length, 0);
  assert.equal(classToday("finn", now), null);
});

test("a pass cannot check in another family's kid", () => {
  assert.throws(
    () =>
      applyFloor(
        base(),
        { type: "checkIn", familyId: "parker", childIds: ["maya"] },
        now,
      ),
    /not on this family pass/,
  );
});

test("open gym stars need a front-desk check-in and never give a class star", () => {
  const visit = {
    type: "record",
    kind: "visit",
    role: "Coach",
    coach: "Coach Sam",
    childId: "finn",
    session: openGym.id,
    station: "wall",
  };
  assert.throws(() => applyClub(base(), visit, now), /front desk/);
  let s = applyFloor(base(), { type: "checkIn", childIds: ["finn"] }, now);
  s = applyClub(s, visit, now);
  assert.equal(clubStats(s, "finn").visits, 1);
  assert.equal(clubStats(s, "finn").days, 1);
  assert.throws(
    () => applyClub(s, { ...visit, kind: "class", station: undefined }, now),
    /no class star/,
  );
});

test("a coach recording at a station confirms presence in the same step", () => {
  // Class block: pending kiosk attendance is approved, then the try lands.
  let s = applyFloor(
    base(),
    { type: "checkIn", familyId: "parker", childIds: ["theo"] },
    now,
  );
  s = recordAt(
    s,
    coach,
    foundations,
    "theo",
    "visit",
    { station: "grip" },
    now,
  );
  const theo = clubStats(s, "theo");
  assert.equal(theo.classes, 1);
  assert.equal(theo.visits, 1);
  // A kid who skipped the kiosk gets checked in by the coach.
  s = recordAt(
    s,
    coach,
    openGym,
    "mia",
    "praise",
    { category: "Kept trying" },
    now,
  );
  assert.ok(isHere(s, "mia", now));
  assert.equal(
    hereNow(s, now).find((p) => p.childId === "mia").by,
    "Coach Sam",
  );
  // Already confirmed attendance is left alone.
  const again = ensurePresent(s, coach, "theo", foundations, now);
  assert.equal(again.club.events.length, s.club.events.length);
});

test("checking out removes a kid from the floor", () => {
  let s = applyFloor(
    base(),
    { type: "checkIn", childIds: ["zoe", "eli"] },
    now,
  );
  s = applyFloor(s, { type: "checkOut", childIds: ["zoe"] }, now);
  assert.deepEqual(
    hereNow(s, now).map((p) => p.childId),
    ["eli"],
  );
  assert.equal(isHere(s, "zoe", new Date("2026-10-10T22:00:00Z")), false);
});

test("only the head coach pauses a station, and a pause blocks station stars", () => {
  assert.throws(
    () =>
      applyFloor(
        base(),
        { type: "outage", station: "grip", reason: "Loose rung", actor: coach },
        now,
      ),
    /head coach/,
  );
  let s = applyFloor(
    base(),
    { type: "outage", station: "grip", reason: "Loose rung", actor: head },
    now,
  );
  s = applyFloor(s, { type: "checkIn", childIds: ["finn"] }, now);
  assert.throws(
    () =>
      recordAt(s, coach, openGym, "finn", "visit", { station: "grip" }, now),
    /paused: Loose rung/,
  );
  s = applyFloor(
    s,
    { type: "outage", station: "grip", reason: null, actor: head },
    now,
  );
  assert.equal(
    clubStats(
      recordAt(s, coach, openGym, "finn", "visit", { station: "grip" }, now),
      "finn",
    ).visits,
    1,
  );
});

test("photos need family consent; parents control consent and removal", () => {
  assert.equal(photoConsent(base(), "omar"), false);
  assert.throws(
    () =>
      applyFloor(
        base(),
        { type: "moment", childId: "omar", photoId: "p1", actor: coach },
        now,
      ),
    /photo consent/,
  );
  assert.throws(
    () =>
      applyFloor(
        base(),
        { type: "consent", childId: "omar", value: true, actor: coach },
        now,
      ),
    /parent or the head coach/,
  );
  let s = applyFloor(
    base(),
    {
      type: "consent",
      childId: "omar",
      value: true,
      actor: { role: "Parent" },
    },
    now,
  );
  s = applyFloor(
    s,
    {
      type: "moment",
      childId: "omar",
      photoId: "p1",
      caption: "Omar at the wall",
      actor: coach,
    },
    now,
  );
  s = applyFloor(
    s,
    { type: "avatar", childId: "omar", photoId: "p2", actor: coach },
    now,
  );
  assert.equal(s.floor.moments[0].coach, "Coach Sam");
  s = applyFloor(
    s,
    {
      type: "hideMoment",
      id: s.floor.moments[0].id,
      actor: { role: "Parent" },
    },
    now,
  );
  assert.equal(s.floor.moments[0].hidden, true);
  assert.throws(
    () =>
      applyFloor(
        s,
        {
          type: "deleteMoment",
          id: s.floor.moments[0].id,
          actor: { role: "Coach", name: "Coach Priya" },
        },
        now,
      ),
    /removes photos/,
  );
  // Withdrawing consent removes the profile photo.
  s = applyFloor(
    s,
    {
      type: "consent",
      childId: "omar",
      value: false,
      actor: { role: "Parent" },
    },
    now,
  );
  assert.equal(s.floor.avatars.omar, undefined);
  s = applyFloor(
    s,
    {
      type: "deleteMoment",
      id: s.floor.moments[0].id,
      actor: { role: "Parent" },
    },
    now,
  );
  assert.equal(s.floor.moments.length, 0);
  assert.ok(validFloor(s.floor));
});

test("coach notes and follow-ups", () => {
  let s = applyFloor(
    base(),
    {
      type: "note",
      childId: "theo",
      text: "One clean attempt from First Roll",
      followUp: true,
      actor: coach,
    },
    now,
  );
  assert.throws(
    () =>
      applyFloor(
        s,
        { type: "note", childId: "theo", text: " ", actor: coach },
        now,
      ),
    /Write the note/,
  );
  s = applyFloor(
    s,
    {
      type: "resolveNote",
      id: s.floor.notes[0].id,
      actor: { ...coach, name: "Coach Jordan" },
    },
    now,
  );
  assert.equal(s.floor.notes[0].done, true);
  assert.equal(s.floor.notes[0].doneBy, "Coach Jordan");
});

test("passes resolve by QR code or family PIN", () => {
  const fam = families[3];
  assert.deepEqual(parsePass(familyCode(fam.id)), { familyId: fam.id });
  assert.deepEqual(parsePass(kidCode("leo")), { childId: "leo" });
  assert.deepEqual(parsePass(fam.pin), { familyId: fam.id });
  assert.equal(parsePass("LABFAM:nobody"), null);
  assert.equal(parsePass("https://example.com"), null);
  assert.equal(new Set(families.map((f) => f.pin)).size, families.length);
  // Every kid belongs to exactly one family.
  assert.equal(families.flatMap((f) => f.kids).length, people.length);
});

test("search matches first, last and guardian names", () => {
  const theo = people.find((p) => p.id === "theo");
  assert.ok(matchKid(theo, "par"));
  assert.ok(matchKid(theo, "dana"));
  assert.ok(matchKid(theo, "Theo"));
  assert.equal(matchKid(theo, "maya"), false);
});

test("ready skills list a kid's goals first and respect the station", () => {
  const s = base();
  const ready = readySkills(s, "theo");
  assert.equal(ready[0].id, s.goals.theo[0]);
  assert.ok(
    readySkills(s, "theo", "court").every((x) => x.category === "Basketball"),
  );
});

test("prerequisite paths list every ancestor in order and the first step to try", async () => {
  const { ancestry, opens, firstStep } = await import("./paths.js");
  const { plain } = await import("./skillcopy.js");
  const { catalog } = await import("./domain.js");
  assert.deepEqual(
    ancestry("X03").map((l) => l.map((s) => s.id)),
    [["S02"], ["M02"], ["A03"], ["X02"]],
  );
  // Two starting skills share a level; M09 needs S07, so it comes after.
  assert.deepEqual(
    ancestry("A11").map((l) => l.map((s) => s.id)),
    [["S06", "S07"], ["M09"]],
  );
  assert.deepEqual(
    opens("S02").map((s) => s.id),
    ["M02", "M05", "A07"],
  );
  const s = base();
  assert.equal(firstStep(s, "theo", "X03").id, "M02");
  assert.equal(firstStep(s, "theo", "S01"), null);
  assert.ok(
    catalog.every((x) => plain[x.id]),
    "every skill has a plain description",
  );
});
