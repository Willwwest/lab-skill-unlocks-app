// Display formatting shared by the app. en-US only; the demo gym is in Phoenix.
import { calendarDayLabel, gymShortDay } from "./gym-time.js";
const numbers = [0, 1].map(
  (digits) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }),
);
const rules = [0, 1].map(
  (digits) => new Intl.PluralRules("en-US", { maximumFractionDigits: digits }),
);

// Thousands separators; `digits` is the most decimals to show (0 or 1).
export const num = (n, digits = 0) => numbers[digits].format(n);

// The word alone, for when the number renders separately.
export const word = (n, one, many, digits = 0) =>
  rules[digits].select(n) === "one" ? one : many;

// "1 try", "2 tries", "1,250 stars".
export const plural = (n, one, many, digits = 0) =>
  `${num(n, digits)} ${word(n, one, many, digits)}`;

// "Oct 10" for a timestamp, on the gym's calendar.
export const date = gymShortDay;

// "Oct 5" for a YYYY-MM-DD key that is already a gym-calendar day.
export const dayLabel = calendarDayLabel;
