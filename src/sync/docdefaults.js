// What each shared document looks like before anyone has saved it: the
// app's own seed. A first save that races another one merges against this,
// so both people's changes survive.
import { staffingOf } from "../staffing.js";
import { scheduleOf } from "../schedule.js";
import { timeOf } from "../timeclock.js";
import { payOf } from "../payroll.js";
import { outboxOf } from "../outbox.js";
import { gymOf } from "../gym.js";

export const docDefaults = {
  staffing: (s) => staffingOf(s),
  schedule: (s) => scheduleOf(s),
  time: (s) => timeOf(s),
  pay: (s) => payOf(s),
  outbox: (s) => outboxOf(s),
  "gym.crew": (s) => gymOf(s).crew,
};
