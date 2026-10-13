import { catalog, earnedIds, people } from "./domain.js";
import {
  gymDayKey,
  gymMinutes as minutesOnGymClock,
  toMinutes,
} from "./gym-time.js";

export const stations = [
  {
    id: "grip",
    name: "Monkey bars & rings",
    code: "LAB-GRIP",
    icon: "◒",
    color: "#c2e6db",
  },
  {
    id: "wall",
    name: "Warped walls",
    code: "LAB-WALL",
    icon: "↗",
    color: "#c9eefa",
  },
  {
    id: "movement",
    name: "Balance & movement",
    code: "LAB-MOVE",
    icon: "〰",
    color: "#e2d9fc",
  },
  {
    id: "court",
    name: "Basketball court",
    code: "LAB-HOOPS",
    icon: "◎",
    color: "#ffe5b8",
  },
  {
    id: "course",
    name: "Ninja course",
    code: "LAB-COURSE",
    icon: "⚑",
    color: "#d9e3ff",
  },
];
export const shoutouts = [
  "Kept trying",
  "Helped a teammate",
  "Brave first try",
  "Great listening",
  "Personal breakthrough",
];
export const prizes = [
  { id: "sticker", name: "LAB sticker", cost: 100 },
  { id: "band", name: "Club wristband", cost: 250 },
  { id: "patch", name: "Effort patch", cost: 500 },
];
export const groups = [
  "6–8 / Foundations",
  "9–12 / Foundations",
  "6–8 / Developing",
  "9–12 / Developing",
];
export const dayKey = gymDayKey;
// The daily schedule. Classes earn a class star; open gym blocks are
// coach-staffed stations where kids checked in at the front earn stars.
// Index order is the stored id suffix, so append new blocks at the end.
const schedule = [
  {
    name: "Ninja foundations",
    kind: "class",
    start: "15:30",
    end: "16:30",
    ages: "6–8",
    lead: "Coach Jordan",
  },
  {
    name: "Ninja progressions",
    kind: "class",
    start: "16:45",
    end: "17:45",
    ages: "9–12",
    lead: "Coach Sam",
  },
  { name: "Open gym rotation", kind: "open", start: "12:00", end: "15:15" },
  { name: "Evening open gym", kind: "open", start: "18:00", end: "20:00" },
  {
    name: "Homeschool ninja",
    kind: "class",
    start: "10:00",
    end: "11:00",
    ages: "5–12",
    lead: "Coach Jordan",
  },
];
export const sessions = (at = new Date()) =>
  schedule.map((s, i) => ({ ...s, id: `${dayKey(at)}:${i}`, index: i }));
// Minutes since midnight on the gym's clock.
export const gymMinutes = minutesOnGymClock;
// "live", "upcoming" or "done" for a session at a moment.
export function sessionPhase(s, at = new Date()) {
  const now = gymMinutes(at);
  if (now < toMinutes(s.start)) return "upcoming";
  return now < toMinutes(s.end) ? "live" : "done";
}
// "3:30" from "15:30".
export const clock = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};
// Checked in at the front desk today and not checked out.
export const isHere = (state, childId, at = new Date()) =>
  (state.floor?.presence ?? []).some(
    (p) => p.childId === childId && !p.out && dayKey(p.in) === dayKey(at),
  );
// Class name for a stored session id ("2026-10-10:1").
export const sessionName = (id) =>
  sessions(`${id.slice(0, 10)}T12:00:00Z`).find((s) => s.id === id)?.name ??
  "Class";
export const emptyClub = () => ({ events: [], claims: [], profiles: {} });
export function validClub(c) {
  return (
    c &&
    Array.isArray(c.events) &&
    Array.isArray(c.claims) &&
    c.profiles &&
    typeof c.profiles === "object" &&
    Object.values(c.profiles).every(
      (p) =>
        p &&
        groups.includes(p.group) &&
        typeof p.alias === "string" &&
        typeof p.optIn === "boolean",
    ) &&
    c.events.every(
      (e) =>
        e &&
        typeof e.id === "string" &&
        people.some((p) => p.id === e.childId) &&
        ["class", "open", "visit", "complete", "praise", "bonus"].includes(
          e.kind,
        ) &&
        ["pending", "approved", "rejected", "revoked"].includes(e.status) &&
        Number.isFinite(Date.parse(e.at)) &&
        typeof e.session === "string" &&
        (!["visit", "complete"].includes(e.kind) ||
          stations.some((s) => s.id === e.station)) &&
        (e.kind !== "praise" || shoutouts.includes(e.category)),
    ) &&
    c.claims.every(
      (r) =>
        r &&
        typeof r.id === "string" &&
        people.some((p) => p.id === r.childId) &&
        prizes.some((p) => p.id === r.prizeId) &&
        ["Requested", "Collected", "Cancelled"].includes(r.status),
    ) &&
    new Set(c.events.map((e) => e.id)).size === c.events.length &&
    new Set(c.claims.map((r) => r.id)).size === c.claims.length
  );
}
// Classes need confirmed attendance; open gym needs a front-desk check-in
// or a coach's open-gym check-in.
const attended = (state, c, id, block, now) =>
  block.kind === "open"
    ? isHere(state, id, now) ||
      approved(c, id).some((e) => e.kind === "open" && e.session === block.id)
    : approved(c, id).some((e) => e.kind === "class" && e.session === block.id);
const approved = (c, id) =>
  c.events.filter((e) => e.childId === id && e.status === "approved");
// "open" is a coach checking a kid into open gym; "bonus" is one of the
// three end-of-class picks each coach gives.
export const points = {
  class: 5,
  open: 5,
  visit: 2,
  complete: 5,
  praise: 3,
  bonus: 10,
};
export const BONUS_PICKS = 3;
export function clubStats(state, id) {
  const c = state.club ?? emptyClub();
  const events = approved(c, id);
  const classes = events.filter((e) => e.kind === "class").length;
  const visits = events.filter((e) => e.kind === "visit").length;
  // Any coach-confirmed day counts, so open-gym-only kids reach these too.
  const days = new Set(events.map((e) => dayKey(e.at))).size;
  const skillPoints = earnedIds(state, id).reduce(
    (sum, key) => sum + 10 + catalog.find((s) => s.id === key).tier * 10,
    0,
  );
  const badges = [
    ...[1, 5, 10, 25, 50, 100].map((n) => ({
      id: `classes-${n}`,
      name: n === 1 ? "First class star" : `${n} class club`,
      count: classes,
      target: n,
      bonus: n === 1 ? 0 : n * 2,
      unit: "classes",
      unitOne: "class",
    })),
    ...[10, 25, 50, 100].map((n) => ({
      id: `visits-${n}`,
      name: n === 100 ? "100 tries. All heart." : `${n} station explorer`,
      count: visits,
      target: n,
      bonus: n,
      unit: "check-ins",
      unitOne: "check-in",
    })),
    ...[10, 25, 50, 100].map((n) => ({
      id: `days-${n}`,
      name: `${n} day regular`,
      count: days,
      target: n,
      bonus: n,
      unit: "gym days",
      unitOne: "gym day",
    })),
  ].map((b) => ({ ...b, earned: b.count >= b.target }));
  const participationPoints = events.reduce(
    (sum, e) => sum + points[e.kind],
    0,
  );
  const milestonePoints = badges
    .filter((b) => b.earned)
    .reduce((sum, b) => sum + b.bonus, 0);
  const total = skillPoints + participationPoints + milestonePoints;
  const spent = c.claims
    .filter((r) => r.childId === id && r.status !== "Cancelled")
    .reduce((sum, r) => sum + prizes.find((p) => p.id === r.prizeId).cost, 0);
  return {
    classes,
    visits,
    days,
    skillPoints,
    participationPoints,
    milestonePoints,
    total,
    balance: total - spent,
    badges,
    events,
  };
}
export function seasonKey(at = new Date()) {
  const d = new Date(`${dayKey(at)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function crowns(c, group, at = new Date()) {
  return stations.map((s) => {
    const scores = people
      .filter(
        (p) => c.profiles[p.id]?.optIn && c.profiles[p.id]?.group === group,
      )
      .map((p) => ({
        name: c.profiles[p.id].alias || `${p.first} ninja`,
        id: p.id,
        count: new Set(
          c.events
            .filter(
              (e) =>
                e.childId === p.id &&
                e.station === s.id &&
                e.kind === "complete" &&
                e.status === "approved" &&
                seasonKey(e.at) === seasonKey(at),
            )
            .map((e) => dayKey(e.at)),
        ).size,
      }))
      .filter((p) => p.count > 0)
      .sort((a, b) => b.count - a.count);
    return {
      ...s,
      scores,
      winners: scores.filter((p) => p.count === scores[0]?.count),
    };
  });
}
export function applyClub(state, action, now = new Date()) {
  const c = structuredClone(state.club ?? emptyClub());
  const { role, childId } = action;
  if (!["Athlete", "Parent", "Coach"].includes(role))
    throw Error("Choose a valid demo role.");
  if (!people.some((p) => p.id === childId)) throw Error("Choose an athlete.");
  const trainer = action.coach?.trim().slice(0, 40) ?? "";
  const coach = () => {
    if (role !== "Coach" || !trainer)
      throw Error("A trainer must confirm this action.");
  };
  const at = new Date(now).toISOString();
  if (action.type === "profile") {
    if (!["Coach", "Parent"].includes(role))
      throw Error("A parent or trainer manages competition preferences.");
    if (!groups.includes(action.group))
      throw Error("Choose an age and skill group.");
    if (action.optIn && !action.alias?.trim())
      throw Error("Choose a display nickname.");
    const assignedGroup =
      c.profiles[childId]?.group ??
      groups[people.find((p) => p.id === childId).age <= 8 ? 0 : 1];
    if (role !== "Coach" && action.group !== assignedGroup)
      throw Error("A trainer must change the competition group.");
    c.profiles[childId] = {
      group: action.group,
      optIn: !!action.optIn,
      alias: action.alias?.trim().slice(0, 24) || "",
    };
  } else if (action.type === "record") {
    const { kind, station, session, category } = action;
    if (!Object.hasOwn(points, kind))
      throw Error("Choose a valid recognition.");
    const block = sessions(now).find((s) => s.id === session);
    if (!block) throw Error("Choose a class from today.");
    if (kind === "class" && block.kind === "open")
      throw Error("Open gym has no class star. Check in at the front desk.");
    if (kind === "open" && block.kind !== "open")
      throw Error("Check kids into a class from the class roster.");
    if (["open", "bonus"].includes(kind)) coach();
    if (
      ["visit", "complete"].includes(kind) &&
      !stations.some((s) => s.id === station)
    )
      throw Error("Choose a valid gym station.");
    const outage = station && state.floor?.outages?.[station];
    if (["visit", "complete"].includes(kind) && outage)
      throw Error(`This station is paused: ${outage.reason}`);
    if (["complete", "praise"].includes(kind)) coach();
    if (kind === "praise" && !shoutouts.includes(category))
      throw Error("Choose a recognition badge.");
    const active = c.events.filter(
      (e) =>
        e.childId === childId && !["rejected", "revoked"].includes(e.status),
    );
    if (
      active.some(
        (e) =>
          e.session === session &&
          e.kind === kind &&
          (kind === "visit" || kind === "complete"
            ? e.station === station
            : kind === "praise"
              ? e.category === category
              : kind === "bonus"
                ? e.coach === trainer
                : true),
      )
    )
      throw Error("Already recorded for this class.");
    if (
      kind === "bonus" &&
      c.events.filter(
        (e) =>
          e.kind === "bonus" &&
          e.session === session &&
          e.coach === trainer &&
          !["rejected", "revoked"].includes(e.status),
      ).length >= BONUS_PICKS
    )
      throw Error(`Each coach gives ${BONUS_PICKS} bonus picks per class.`);
    if (
      kind === "praise" &&
      active.filter((e) => e.kind === "praise" && dayKey(e.at) === dayKey(now))
        .length >= 3
    )
      throw Error("Three recognition awards per day is the limit.");
    if (
      (["complete", "praise", "bonus"].includes(kind) ||
        (kind === "visit" && role === "Coach")) &&
      !attended(state, c, childId, block, now)
    )
      throw Error(
        block.kind === "open"
          ? "Check in at the front desk first."
          : "Confirm class attendance first.",
      );
    if (kind === "complete" && !action.note?.trim())
      throw Error("Describe the obstacle setup and completed task.");
    if (role === "Coach") coach();
    // Station scans cannot silently turn into verified completions.
    c.events.push({
      id: crypto.randomUUID(),
      childId,
      kind,
      station: station ?? null,
      session,
      category: category ?? null,
      note: action.note?.trim().slice(0, 500) || "",
      at,
      status: role === "Coach" ? "approved" : "pending",
      coach: role === "Coach" ? trainer : null,
    });
  } else if (["approve", "reject", "revoke"].includes(action.type)) {
    coach();
    const event = c.events.find(
      (e) => e.id === action.id && e.childId === childId,
    );
    if (!event) throw Error("Record not found.");
    if (action.type === "revoke") {
      const reason = action.reason?.trim().slice(0, 200);
      if (event.status !== "approved" || !reason)
        throw Error("A correction needs an approved record and a reason.");
      event.status = "revoked";
      event.reason = reason;
      if (event.kind === "class")
        c.events
          .filter(
            (e) =>
              e.childId === childId &&
              e.session === event.session &&
              e.status === "approved",
          )
          .forEach((e) => {
            e.status = "revoked";
            e.reason = "Class attendance corrected: " + reason;
          });
    } else {
      if (event.status !== "pending")
        throw Error("This request has already been reviewed.");
      if (
        action.type === "approve" &&
        event.kind === "visit" &&
        !attended(
          state,
          c,
          childId,
          sessions(`${event.session.slice(0, 10)}T12:00:00Z`).find(
            (s) => s.id === event.session,
          ) ?? { id: event.session, kind: "class" },
          now,
        )
      )
        throw Error("Confirm class attendance before station participation.");
      event.status = action.type === "approve" ? "approved" : "rejected";
    }
    event.coach = trainer;
    event.reviewedAt = at;
  } else if (action.type === "redeem") {
    if (!["Parent", "Coach"].includes(role))
      throw Error("A parent or trainer requests rewards.");
    const prize = prizes.find((p) => p.id === action.prizeId);
    if (!prize || clubStats(state, childId).balance < prize.cost)
      throw Error("Keep earning stars to unlock this reward.");
    c.claims.push({
      id: crypto.randomUUID(),
      childId,
      prizeId: prize.id,
      at,
      status: "Requested",
    });
  } else if (action.type === "fulfill" || action.type === "cancel") {
    coach();
    const r = c.claims.find((r) => r.id === action.id && r.childId === childId);
    if (!r || r.status !== "Requested") throw Error("Choose a pending reward.");
    if (action.type === "fulfill" && clubStats(state, childId).balance < 0)
      throw Error("Corrected points need review before collecting rewards.");
    r.status = action.type === "fulfill" ? "Collected" : "Cancelled";
    r.coach = trainer;
    r.updatedAt = at;
  } else throw Error("Unknown club action.");
  return { ...state, club: c };
}
export function stationFromInput(text) {
  const value = text.trim();
  const code = stations.find((s) => s.code === value.toUpperCase());
  if (code) return code.id;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return (
      stations.find((s) => s.id === url.searchParams.get("station"))?.id ?? null
    );
  } catch {
    return null;
  }
}
