// Shared pieces for the coach center: action helpers that combine the
// club, skill and floor reducers, labels, and the kid tile.
import React from "react";
import { stations, dayKey, points } from "./club.js";
import { catalog } from "./domain.js";
import { arrival, eventsToday } from "./floor.js";
export { coachAct, ensurePresent, recordAt } from "./floor.js";
import { kidInfo } from "./roster.js";
import { Avatar } from "./photos.jsx";
import { gymClockTime } from "./gym-time.js";

export { points };
export const skillStars = (skill) => 10 + skill.tier * 10;

export const stationName = (id) =>
  stations.find((s) => s.id === id)?.name ?? "Station";

// Tap-to-fill task descriptions for "Completed". Sample wording; the
// head coach replaces these with the gym's approved setups.
export const completionPresets = {
  grip: [
    "Full monkey bar route",
    "Ring route start to finish",
    "Bar hang station, controlled exit",
  ],
  wall: ["Wall A top-out", "Wall B top-out", "Wall C top-out", "Wall B catch"],
  movement: [
    "Balance route start to finish",
    "Stepping-stone route",
    "Landing and roll sequence",
  ],
  court: [
    "Basket from the beginner marker",
    "Free-throw line make",
    "Passing target course",
  ],
  course: ["Full ninja course run", "Course front half", "Course back half"],
};

export function describeEvent(e) {
  if (e.kind === "class") return "Class check-in";
  if (e.kind === "open") return "Open gym check-in";
  if (e.kind === "bonus") return "Bonus pick";
  if (e.kind === "praise") return e.category;
  return `${e.kind === "visit" ? "Tried" : "Completed"} ${stationName(e.station)}`;
}

export const clockTime = gymClockTime;

export function starsToday(state, childId, at = new Date()) {
  const club = eventsToday(state, childId, at)
    .filter((e) => e.status === "approved")
    .reduce((n, e) => n + points[e.kind], 0);
  const skills = state.awards
    .filter(
      (a) => a.childId === childId && !a.revoked && dayKey(a.at) === dayKey(at),
    )
    .reduce(
      (n, a) => n + skillStars(catalog.find((s) => s.id === a.skillId)),
      0,
    );
  return club + skills;
}

export function KidTile({
  child,
  state,
  now,
  onOpen,
  selected,
  onSelect,
  children,
  badge,
}) {
  const here = arrival(state, child.id, now);
  const care = kidInfo[child.id]?.care;
  return (
    <div
      className={`kid-tile ${selected ? "is-selected" : ""} ${here ? "is-here" : ""}`.trim()}
    >
      <button
        className="kid-tile-main"
        onClick={() => (onSelect ? onSelect(child.id) : onOpen(child.id))}
        aria-pressed={onSelect ? !!selected : undefined}
      >
        <Avatar
          child={child}
          photoId={state.floor?.avatars?.[child.id]}
          size={52}
        />
        <span className="kid-tile-text">
          <b>
            {child.first}{" "}
            <span className="kid-last">{kidInfo[child.id]?.last}</span>
          </b>
          <small>
            {here ? `Here since ${clockTime(here.in)}` : "Not checked in"}
            {care ? " · Care note" : ""}
          </small>
          {badge}
        </span>
        {care && <span className="care-dot" aria-hidden="true" />}
      </button>
      {children && <div className="kid-tile-actions">{children}</div>}
    </div>
  );
}
