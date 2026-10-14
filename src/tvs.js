// What the gym's TV channels show, as plain data: today's schedule, the
// point-earning movements on equipment open right now, this week's crowns
// and coach shoutouts. The screens (DeskTV.jsx and friends) only lay it out.
//
// Public screens name kids only through the weekly-crown opt-in: a parent
// turns it on and picks the nickname. Anyone else counts toward nothing on
// a TV and is never named.
import { catalog, people } from "./domain.js";
import { dayKey, seasonKey, sessionPhase, sessions, stations } from "./club.js";
import { stationFor } from "./floor.js";
import { leadOf, staffName } from "./gym.js";
import { floorStatus } from "./layout.js";
import { gymMinutes, weekdayOf } from "./gym-time.js";
import { hoursOn, weekdayNames } from "./schedule.js";

// A station can span several zones (movement covers the balance beam and
// the vault blocks). Send each move to the zone whose equipment fits it.
const fits = {
  beam: /balance|beam/i,
  field: /vault|land|roll|jump|precision/i,
  track: /sprint|run the track/i,
};
function zoneFor(skill, zones) {
  const text = `${skill.title} ${skill.criteria}`;
  // Most specific first: a balance route that ends in a landing is a beam move.
  for (const [art, re] of Object.entries(fits)) {
    const z = re.test(text) && zones.find((x) => x.art === art);
    if (z) return z;
  }
  return zones[0];
}

// The next day the gym opens after `at`'s day, within two weeks:
// { day, weekday, start } with start as "10:00", or null.
export function nextOpening(state, at = new Date()) {
  const base = Date.parse(`${dayKey(at)}T12:00:00Z`);
  for (let i = 1; i <= 14; i++) {
    const day = new Date(base + i * 86400000).toISOString().slice(0, 10);
    const h = hoursOn(state, day);
    if (h)
      return {
        day,
        weekday: i === 1 ? "tomorrow" : weekdayNames[weekdayOf(day)],
        start: `${String(Math.floor(h.start / 60)).padStart(2, "0")}:${String(h.start % 60).padStart(2, "0")}`,
      };
  }
  return null;
}
// "Open again Monday at 10:00." for a closed screen.
export const openAgain = (o) =>
  o ? `Open again ${o.weekday} at ${clockOf(o.start)}.` : "Closed for now.";
const clockOf = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};

// Points for unlocking a skill; the same rule as clubStats in club.js.
export const skillPoints = (skill) => 10 + skill.tier * 10;

// The day's blocks in time order, with who leads each and where it stands.
export function todaySchedule(state, at = new Date()) {
  return sessions(at, state)
    .map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      start: b.start,
      end: b.end,
      ages: b.ages ?? null,
      lead:
        b.lead ??
        (leadOf(state, b.index, at)
          ? staffName(leadOf(state, b.index, at))
          : null),
      phase: sessionPhase(b, at),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/*
 * Movements a kid can earn points on right now: skills whose station has
 * at least one zone open for open gym (not held by a class, not paused).
 * Taken round-robin across the open stations so the strip shows a spread,
 * easiest tier first, and turned every 15 minutes so the board changes
 * through the day.
 */
export function earnNow(state, at = new Date(), count = 5) {
  const status = floorStatus(state, at);
  if (!status.hours.open) return [];
  const open = new Map();
  for (const z of status.zones)
    if (z.station && z.status === "open")
      open.set(z.station, [...(open.get(z.station) ?? []), z]);
  if (!open.size) return [];
  const turn = Math.floor(gymMinutes(at) / 15);
  const lists = [...open.keys()].map((station) => {
    const skills = catalog
      .filter((s) => !s.special && stationFor(s) === station)
      .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
    // Keep the easiest tier in front but rotate within the list.
    const shift = skills.length ? turn % skills.length : 0;
    return {
      station,
      zones: open.get(station),
      skills: [...skills.slice(shift), ...skills.slice(0, shift)],
    };
  });
  const out = [];
  for (let i = 0; out.length < count && i < 20; i++)
    for (const l of lists) {
      const skill = l.skills[i];
      if (!skill || out.length >= count) continue;
      const zone = zoneFor(skill, l.zones);
      out.push({
        skill,
        station: l.station,
        stationName: stations.find((s) => s.id === l.station)?.name ?? "",
        zone: { id: zone.id, name: zone.name, code: zone.code ?? null },
        points: skillPoints(skill),
        soon: zone.soon,
      });
    }
  return out;
}

const optedIn = (state, childId) => !!state.club?.profiles?.[childId]?.optIn;
const publicName = (state, childId) => {
  const p = people.find((x) => x.id === childId);
  return state.club.profiles[childId].alias || `${p?.first ?? "A"} ninja`;
};

// This week's crown holders at each station, across all age groups. Only
// kids whose families opted in can hold one (see crowns in club.js).
export function weeklyCrowns(state, at = new Date()) {
  const c = state.club;
  if (!c) return [];
  const week = seasonKey(at);
  return stations
    .map((s) => {
      const days = new Map();
      for (const e of c.events)
        if (
          e.kind === "complete" &&
          e.status === "approved" &&
          e.station === s.id &&
          seasonKey(e.at) === week &&
          optedIn(state, e.childId)
        ) {
          const set = days.get(e.childId) ?? new Set();
          set.add(dayKey(e.at));
          days.set(e.childId, set);
        }
      const scores = [...days].map(([id, d]) => ({
        id,
        name: publicName(state, id),
        group: c.profiles[id].group,
        days: d.size,
      }));
      const best = Math.max(0, ...scores.map((x) => x.days));
      return {
        station: s.id,
        stationName: s.name,
        days: best,
        holders: scores
          .filter((x) => best > 0 && x.days === best)
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .filter((x) => x.holders.length);
}

// The latest coach shoutouts this week, opted-in kids only.
export function weeklyShoutouts(state, at = new Date(), limit = 5) {
  const c = state.club;
  if (!c) return [];
  const week = seasonKey(at);
  return c.events
    .filter(
      (e) =>
        e.kind === "praise" &&
        e.status === "approved" &&
        seasonKey(e.at) === week &&
        optedIn(state, e.childId),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      name: publicName(state, e.childId),
      category: e.category,
      coach: e.coach ?? null,
      at: e.at,
    }));
}
