import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "./domain.js";
import { emptyClub } from "./club.js";
import { emptyFloor } from "./floor.js";
import { seedGym } from "./gym.js";
import { seedStaffing } from "./staffing.js";
import {
  applyTime,
  clockStatus,
  entriesOf,
  openEntry,
  paidMinutes,
  timesheet,
} from "./timeclock.js";
import {
  applyPay,
  payrollCsv,
  payrollRows,
  periodOf,
  periodStatus,
  sickAccrued,
} from "./payroll.js";

const base = () => ({
  ...seed(),
  club: emptyClub(),
  floor: emptyFloor(),
  gym: seedGym(new Date("2026-10-12T16:45:00Z")),
  staffing: seedStaffing(new Date("2026-10-12T16:45:00Z")),
});
// Phoenix is UTC-7.
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00-07:00`);
const coach = (id, extra = {}) => ({
  role: "Coach",
  name: `Coach ${id[0].toUpperCase()}${id.slice(1)}`,
  staffId: id,
  head: false,
  ...extra,
});
const alex = coach("alex", { head: true });
const charlie = coach("charlie", { head: true, owner: true });
const t = (s, who, type, when, extra = {}) =>
  applyTime(s, { type, actor: coach(who), staffId: who, ...extra }, when);
const MON = "2026-10-12";

test("clocking in: not too early, late is noted, one open record at a time", () => {
  let s = base();
  assert.throws(() => t(s, "priya", "clockIn", at(MON, "09:00")), /9:30|09:30/);
  s = t(s, "priya", "clockIn", at(MON, "09:22"));
  assert.equal(clockStatus(s, "priya", at(MON, "09:40")).status, "in");
  assert.throws(() => t(s, "priya", "clockIn", at(MON, "09:30")), /already/);
  s = t(s, "riley", "clockIn", at(MON, "09:50"));
  assert.equal(openEntry(s, "riley").late, 20);
  // Jordan's shift started; he hasn't clocked in.
  assert.equal(clockStatus(s, "jordan", at(MON, "09:45")).status, "late");
  // Saturday: no shift, so clocking in is flagged as unscheduled.
  s = t(s, "sam", "clockIn", at("2026-10-17", "10:00"));
  assert.equal(openEntry(s, "sam").unscheduled, true);
  assert.throws(
    () =>
      applyTime(
        s,
        { type: "clockIn", actor: coach("sam"), staffId: "priya" },
        at(MON, "10:00"),
      ),
    /yourself/,
  );
});

test("breaks: short ones are paid, longer ones aren't", () => {
  let s = t(base(), "priya", "clockIn", at(MON, "09:30"));
  s = t(s, "priya", "breakStart", at(MON, "11:00"));
  s = t(s, "priya", "breakEnd", at(MON, "11:15"));
  s = t(s, "priya", "breakStart", at(MON, "13:00"));
  assert.equal(clockStatus(s, "priya", at(MON, "13:10")).status, "break");
  s = t(s, "priya", "breakEnd", at(MON, "13:30"));
  s = t(s, "priya", "clockOut", at(MON, "18:00"));
  // 8.5 h on the clock, minus the 30-minute break.
  assert.equal(paidMinutes(entriesOf(s, "priya")[0]), 480);
  const sheet = timesheet(s, "priya", MON, at(MON, "19:00"));
  assert.equal(sheet.scheduled, 5 * 510);
  assert.equal(sheet.worked, 480);
  // Tuesday through Friday haven't happened yet, so they aren't missed.
  assert.ok(!sheet.days[1].flags.includes("Missed shift"));
});

test("managers fix records with a reason, and the old times are kept", () => {
  let s = t(base(), "riley", "clockIn", at(MON, "09:31"));
  const id = openEntry(s, "riley").id;
  assert.throws(
    () =>
      applyTime(
        s,
        {
          type: "editEntry",
          actor: coach("sam"),
          id,
          in: "09:30",
          out: "18:00",
          reason: "x",
        },
        at(MON, "19:00"),
      ),
    /gym manager/,
  );
  assert.throws(
    () =>
      applyTime(
        s,
        {
          type: "editEntry",
          actor: alex,
          id,
          in: "09:30",
          out: "18:00",
          reason: " ",
        },
        at(MON, "19:00"),
      ),
    /Say why/,
  );
  s = applyTime(
    s,
    {
      type: "editEntry",
      actor: alex,
      id,
      in: "09:30",
      out: "18:00",
      reason: "Forgot to clock out",
    },
    at(MON, "19:00"),
  );
  const e = entriesOf(s, "riley")[0];
  assert.equal(e.edits.length, 1);
  assert.equal(e.edits[0].before.out, null);
  assert.equal(new Date(e.out).toISOString(), at(MON, "18:00").toISOString());
  assert.ok(
    timesheet(s, "riley", MON, at(MON, "19:00")).days[0].flags.includes(
      "Edited",
    ),
  );
  s = applyTime(
    s,
    { type: "approve", actor: alex, ids: [id] },
    at(MON, "19:00"),
  );
  assert.ok(entriesOf(s, "riley")[0].approvedAt);
  s = applyTime(
    s,
    {
      type: "addEntry",
      actor: alex,
      staffId: "dev",
      day: MON,
      in: "15:00",
      out: "20:15",
      reason: "Phone died",
    },
    at(MON, "21:00"),
  );
  assert.equal(entriesOf(s, "dev")[0].source, "manager");
});

test("overtime is over 40 hours in a workweek, and the CSV is ready for payroll", () => {
  let s = base();
  // Sam works 9 h a day, Monday to Friday: 45 h, so 5 h overtime.
  for (let i = 0; i < 5; i++) {
    const day = `2026-10-1${2 + i}`;
    s = t(s, "sam", "clockIn", at(day, "09:30"));
    s = t(s, "sam", "clockOut", at(day, "18:30"));
  }
  const period = periodOf(s, MON);
  assert.deepEqual(period, { start: "2026-10-05", end: "2026-10-18" });
  const sam = payrollRows(s, period.start, period.end).find(
    (r) => r.staffId === "sam",
  );
  assert.equal(sam.regular, 40);
  assert.equal(sam.overtime, 5);
  assert.equal(sam.unapproved, 5);
  assert.equal(sickAccrued(s, "sam", 2026), 1);
  assert.throws(
    () =>
      applyPay(s, {
        type: "person",
        actor: alex,
        staffId: "sam",
        payrollId: "E07",
        rate: 18,
      }),
    /owner/,
  );
  s = applyPay(s, {
    type: "person",
    actor: charlie,
    staffId: "sam",
    payrollId: "E07",
    rate: 18,
  });
  const csv = payrollCsv(s, period.start, period.end);
  assert.match(
    csv.split("\n")[0],
    /^payroll_id,first_name,last_name,period_start/,
  );
  assert.match(csv, /E07,Sam,,2026-10-05,2026-10-18,40\.00,5\.00,45\.00,5/);
  assert.equal(
    payrollRows(s, period.start, period.end).find((r) => r.staffId === "sam")
      .gross,
    40 * 18 + 5 * 27,
  );
  s = applyPay(
    s,
    {
      type: "exportPeriod",
      actor: charlie,
      start: period.start,
      end: period.end,
    },
    at("2026-10-19", "09:00"),
  );
  assert.equal(periodStatus(s, period.start), "exported");
});

test("the board and the staffing check flag coaches booked but not clocked in", async () => {
  const { boardNow, notClockedIn } = await import("./staffing.js");
  let s = base();
  // Before anyone uses the clock, nobody is flagged.
  assert.equal(notClockedIn(s, "jordan", at(MON, "10:00")), false);
  s = t(s, "priya", "clockIn", at(MON, "09:25"));
  assert.equal(notClockedIn(s, "jordan", at(MON, "10:00")), true);
  assert.equal(notClockedIn(s, "priya", at(MON, "10:00")), false);
  const board = boardNow(s, at(MON, "10:00"));
  assert.ok(board.find((b) => b.staff.id === "priya").clockIn);
  assert.equal(board.find((b) => b.staff.id === "jordan").notIn, true);
});

test("clocking in after the shift ended is unscheduled, not late", () => {
  const s = t(base(), "priya", "clockIn", at(MON, "20:00"));
  assert.equal(openEntry(s, "priya").late, undefined);
  assert.equal(openEntry(s, "priya").unscheduled, true);
});
