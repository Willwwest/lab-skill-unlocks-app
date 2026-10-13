// Date and clock formats used throughout the demo gym.
export const GYM_TIME_ZONE = "America/Phoenix";
export const GYM_UTC_OFFSET = "-07:00";

const formatters = {
  dayKey: new Intl.DateTimeFormat("en-CA", {
    timeZone: GYM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }),
  hoursMinutes: new Intl.DateTimeFormat("en-GB", {
    timeZone: GYM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }),
  hour: new Intl.DateTimeFormat("en-US", {
    timeZone: GYM_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }),
  time: new Intl.DateTimeFormat("en-US", {
    timeZone: GYM_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }),
  fullDay: new Intl.DateTimeFormat("en-US", {
    timeZone: GYM_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }),
  shortDay: new Intl.DateTimeFormat("en-US", {
    timeZone: GYM_TIME_ZONE,
    month: "short",
    day: "numeric",
  }),
  syncedAt: new Intl.DateTimeFormat("en-US", {
    timeZone: GYM_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }),
  calendarDay: new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }),
  calendarWeekday: new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }),
  calendarWeekdayNarrow: new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "narrow",
  }),
  calendarMonthYear: new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  }),
};

const calendarDate = (key) => new Date(`${key}T12:00:00Z`);
export const gymDayKey = (at = new Date()) =>
  formatters.dayKey.format(new Date(at));
export const gymMinutes = (at = new Date()) => {
  const [hours, minutes] = formatters.hoursMinutes
    .format(new Date(at))
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
};
export const gymHour = (at) => Number(formatters.hour.format(new Date(at)));
export const gymClockTime = (at) => formatters.time.format(new Date(at));
export const gymFullDay = (at) => formatters.fullDay.format(new Date(at));
export const gymShortDay = (at) => formatters.shortDay.format(new Date(at));
export const gymSyncedAt = (at) => formatters.syncedAt.format(new Date(at));
export const calendarDayLabel = (key) =>
  formatters.calendarDay.format(calendarDate(key));
export const calendarWeekday = (key) =>
  formatters.calendarWeekday.format(calendarDate(key));
export const calendarWeekdayNarrow = (key) =>
  formatters.calendarWeekdayNarrow.format(calendarDate(key));
export const calendarMonthYear = (key) =>
  formatters.calendarMonthYear.format(calendarDate(key));
export const toMinutes = (hhmm) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
};

// Calendar keys are gym days. Phoenix currently stays at UTC-7 year-round.
export const gymLocalIso = (day, time = "12:00") =>
  `${day}T${time}:00${GYM_UTC_OFFSET}`;
