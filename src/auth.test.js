import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_DAYS,
  demoCodes,
  findAccount,
  formatPhone,
  loadSession,
  normalizePhone,
  signOut,
} from "./auth.js";

const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const t0 = Date.parse("2026-10-12T17:00:00Z");
const fixed = () => 0.5; // code 550000

test("phone numbers normalize to +1 and format as typed", () => {
  assert.equal(normalizePhone("(602) 555-0101"), "+16025550101");
  assert.equal(normalizePhone("1 602 555 0101"), "+16025550101");
  assert.equal(normalizePhone("602-555-010"), null);
  assert.equal(normalizePhone("012 555 0101"), null);
  assert.equal(formatPhone("602"), "602");
  assert.equal(formatPhone("60255"), "(602) 55");
  assert.equal(formatPhone("6025550101999"), "(602) 555-0101");
});

test("a number maps to a guardian's family or a staff member", () => {
  assert.deepEqual(
    {
      kind: findAccount("+16025550101").kind,
      familyId: findAccount("+16025550101").familyId,
    },
    { kind: "guardian", familyId: "parker" },
  );
  assert.equal(findAccount("+16025550140").familyId, "parker"); // second guardian
  assert.equal(findAccount("+16025550153").head, true);
  assert.equal(findAccount("+16025550199"), null);
});

test("unknown numbers get no code", () => {
  assert.throws(
    () => demoCodes.send(memory(), "602 555 0199", t0),
    /front desk/,
  );
  assert.throws(() => demoCodes.send(memory(), "555", t0), /10-digit/);
});

test("the right code signs in for 90 days; the session survives a reload", () => {
  const s = memory();
  const { code } = demoCodes.send(s, "(602) 555-0101", t0, fixed);
  assert.equal(code, "550000");
  const session = demoCodes.verify(s, "(602) 555-0101", "550000", t0 + 30000);
  assert.equal(session.name, "Dana Parker");
  assert.equal(loadSession(s, t0 + 86400000)?.familyId, "parker");
  assert.equal(loadSession(s, t0 + (SESSION_DAYS + 1) * 86400000), null);
  // A used code cannot sign in again.
  assert.throws(
    () => demoCodes.verify(s, "(602) 555-0101", "550000", t0 + 40000),
    /Send a code/,
  );
  signOut(s);
  assert.equal(loadSession(s, t0), null);
});

test("wrong codes count down and then lock the number", () => {
  const s = memory();
  demoCodes.send(s, "6025550151", t0, fixed);
  for (let i = 4; i >= 1; i--)
    assert.throws(
      () => demoCodes.verify(s, "6025550151", "111111", t0),
      new RegExp(`${i} tr`),
    );
  assert.throws(
    () => demoCodes.verify(s, "6025550151", "111111", t0),
    /Too many tries/,
  );
  assert.throws(
    () => demoCodes.verify(s, "6025550151", "550000", t0 + 60000),
    /Too many tries/,
  );
  assert.throws(
    () => demoCodes.send(s, "6025550151", t0 + 60000),
    /Too many tries/,
  );
});

test("codes expire after 5 minutes and resends wait 30 seconds", () => {
  const s = memory();
  demoCodes.send(s, "6025550102", t0, fixed);
  assert.throws(
    () => demoCodes.send(s, "6025550102", t0 + 10000),
    /Wait 20 seconds/,
  );
  assert.throws(
    () => demoCodes.verify(s, "6025550102", "550000", t0 + 6 * 60000),
    /expired/,
  );
  assert.doesNotThrow(() =>
    demoCodes.send(s, "6025550102", t0 + 6 * 60000, fixed),
  );
});

test("Travis signs in as an owner, alongside Charlie and Ally", () => {
  for (const phone of ["+16025550157", "+16025550158", "+16025550159"])
    assert.equal(findAccount(phone).owner, true, phone);
  const travis = findAccount("+16025550159");
  assert.equal(travis.name, "Travis");
  assert.equal(travis.kind, "staff");
  // Coaches stay coaches.
  assert.equal(findAccount("+16025550151").owner, false);
});
