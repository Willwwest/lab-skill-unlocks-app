// Time choices for pickers: every quarter hour from 8 am to 9 pm.
import { clock } from "./club.js";

const hhmm = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const timeOptions = (from = 8 * 60, to = 21 * 60, step = 15) => {
  const out = [];
  for (let m = from; m <= to; m += step)
    out.push({ value: hhmm(m), label: clock(hhmm(m)) });
  return out;
};
export const TIMES = timeOptions();

// "1h", "1h 30m", "45m".
export const hoursText = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};
