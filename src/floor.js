// Gym-floor records for the coach center: front-desk presence, photo
// moments, staff notes, profile photos, photo consent and station pauses.
// Stars and skills stay in club.js and domain.js; this module only gates
// and annotates them.
import {
  catalog,
  currentTier,
  earnedIds,
  isEligible,
  people,
  tiers,
} from "./domain.js";
import {
  applyClub,
  dayKey,
  isHere,
  sessions,
  sessionPhase,
  stations,
} from "./club.js";
import { families, kidInfo } from "./roster.js";

export const emptyFloor = () => ({
  presence: [],
  moments: [],
  notes: [],
  avatars: {},
  consent: {},
  outages: {},
});

export function validFloor(f) {
  const kid = (id) => people.some((p) => p.id === id);
  return (
    !!f &&
    ["presence", "moments", "notes"].every((k) => Array.isArray(f[k])) &&
    ["avatars", "consent", "outages"].every(
      (k) => f[k] && typeof f[k] === "object",
    ) &&
    f.presence.every(
      (p) => kid(p.childId) && Number.isFinite(Date.parse(p.in)),
    ) &&
    f.moments.every((m) => kid(m.childId) && typeof m.photoId === "string") &&
    f.notes.every((n) => kid(n.childId) && typeof n.text === "string") &&
    Object.keys(f.outages).every((id) => stations.some((s) => s.id === id))
  );
}

const floorOf = (state) => state.floor ?? emptyFloor();

// Photo consent: the family's choice, defaulting to the enrollment form.
export const photoConsent = (state, childId) =>
  floorOf(state).consent[childId] ?? kidInfo[childId]?.photoDefault ?? false;

export const hereNow = (state, at = new Date()) =>
  floorOf(state)
    .presence.filter((p) => !p.out && dayKey(p.in) === dayKey(at))
    .sort((a, b) => b.in.localeCompare(a.in));

export const arrival = (state, childId, at = new Date()) =>
  hereNow(state, at).find((p) => p.childId === childId) ?? null;

// The class a kid is enrolled in today that has not finished yet.
export function classToday(childId, at = new Date()) {
  const enrolled = kidInfo[childId]?.classes ?? [];
  return (
    sessions(at)
      .filter((s) => s.kind === "class" && enrolled.includes(s.index))
      .find((s) => sessionPhase(s, at) !== "done") ?? null
  );
}

export const rosterFor = (sessionIndex) =>
  people.filter((p) => kidInfo[p.id]?.classes.includes(sessionIndex));

// Which skill category each station assesses.
export const stationCategory = {
  grip: "Grip & traverse",
  wall: "Warped wall",
  movement: "Movement",
  court: "Basketball",
  course: "Course skills",
};
export const stationFor = (skill) =>
  Object.keys(stationCategory).find(
    (id) => stationCategory[id] === skill.category,
  );

// Skills a kid can be assessed on now, optionally at one station: their
// own goals first, then the rest of their current tier, then later tiers.
export function readySkills(state, childId, stationId) {
  const done = new Set(earnedIds(state, childId));
  const goals = state.goals?.[childId] ?? [];
  const tier = currentTier(state, childId);
  return catalog
    .filter(
      (s) =>
        !done.has(s.id) &&
        isEligible(state, childId, s) &&
        (!stationId || stationCategory[stationId] === s.category),
    )
    .sort(
      (a, b) =>
        Number(goals.includes(b.id)) - Number(goals.includes(a.id)) ||
        Number(b.tier === tier) - Number(a.tier === tier) ||
        a.tier - b.tier,
    );
}

// Remaining skills in the current shirt tier.
export function shirtGap(state, childId) {
  const tier = currentTier(state, childId);
  const done = new Set(earnedIds(state, childId));
  const left = catalog.filter((s) => s.tier === tier && !done.has(s.id));
  return { tier: tiers[tier - 1], left, complete: left.length === 0 };
}

export const shirtsToHandOut = (state, childId) =>
  state.rewards.filter(
    (r) => r.childId === childId && r.status === "Ready" && !r.review,
  );

export const eventsToday = (state, childId, at = new Date()) =>
  (state.club?.events ?? []).filter(
    (e) =>
      e.childId === childId &&
      dayKey(e.at) === dayKey(at) &&
      !["rejected", "revoked"].includes(e.status),
  );

// Days until the next birthday, 0 on the day.
export function birthdayIn(childId, at = new Date()) {
  const md = kidInfo[childId]?.birthday;
  if (!md) return null;
  const today = new Date(`${dayKey(at)}T12:00:00Z`);
  const year = today.getUTCFullYear();
  let next = new Date(`${year}-${md}T12:00:00Z`);
  if (next < today) next = new Date(`${year + 1}-${md}T12:00:00Z`);
  return Math.round((next - today) / 86400000);
}

export const groupLabel = (child) =>
  child.age <= 8 ? "Ages 6–8" : "Ages 9–12";

// Matches first, last, full, guardian name or family PIN.
export function matchKid(child, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fam = families.find((f) => f.id === kidInfo[child.id]?.family);
  return [child.name, kidInfo[child.id]?.last, fam?.guardian, fam?.pin]
    .filter(Boolean)
    .some(
      (v) =>
        v
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w.startsWith(q)) || v.toLowerCase().startsWith(q),
    );
}

export function applyFloor(state, action, now = new Date()) {
  const f = structuredClone(floorOf(state));
  const at = new Date(now).toISOString();
  const { actor = {} } = action;
  const staff = () => {
    if (actor.role !== "Coach" || !actor.name)
      throw Error("Sign in as a coach first.");
  };
  const head = () => {
    if (actor.role !== "Coach" || !actor.head)
      throw Error("Only the head coach can change this.");
  };
  const guardianOrHead = () => {
    if (!(actor.role === "Parent" || (actor.role === "Coach" && actor.head)))
      throw Error("A parent or the head coach manages this.");
  };
  const kid = (id) => {
    if (!people.some((p) => p.id === id)) throw Error("Choose an athlete.");
  };
  let next = state;
  switch (action.type) {
    case "checkIn": {
      if (!action.childIds?.length) throw Error("Choose who is here today.");
      const family = families.find((x) => x.id === action.familyId);
      for (const childId of action.childIds) {
        kid(childId);
        if (family && !family.kids.includes(childId))
          throw Error("That athlete is not on this family pass.");
        if (
          f.presence.some(
            (p) =>
              p.childId === childId && !p.out && dayKey(p.in) === dayKey(now),
          )
        )
          continue;
        f.presence.push({
          id: crypto.randomUUID(),
          childId,
          familyId: family?.id ?? kidInfo[childId]?.family ?? null,
          in: at,
          out: null,
          by: action.by ?? "Front desk",
        });
        // Arriving for a class requests attendance; a coach still confirms it.
        const block = classToday(childId, now);
        if (block)
          try {
            next = applyClub(
              next,
              {
                type: "record",
                kind: "class",
                role: "Parent",
                childId,
                session: block.id,
              },
              now,
            );
          } catch {
            // Already requested or confirmed for this class.
          }
      }
      break;
    }
    case "checkOut": {
      for (const childId of action.childIds ?? []) {
        const row = f.presence.find(
          (p) =>
            p.childId === childId && !p.out && dayKey(p.in) === dayKey(now),
        );
        if (row) row.out = at;
      }
      break;
    }
    case "moment": {
      staff();
      kid(action.childId);
      if (!photoConsent(state, action.childId))
        throw Error("This family has not given photo consent.");
      if (typeof action.photoId !== "string")
        throw Error("Take a photo first.");
      f.moments.push({
        id: action.id ?? crypto.randomUUID(),
        childId: action.childId,
        photoId: action.photoId,
        caption: action.caption?.trim().slice(0, 140) ?? "",
        link: action.link ?? null,
        coach: actor.name,
        at,
        hidden: false,
      });
      break;
    }
    case "hideMoment":
    case "showMoment": {
      guardianOrHead();
      const m = f.moments.find((m) => m.id === action.id);
      if (!m) throw Error("Photo not found.");
      m.hidden = action.type === "hideMoment";
      break;
    }
    case "deleteMoment": {
      const m = f.moments.find((m) => m.id === action.id);
      if (!m) throw Error("Photo not found.");
      // The coach who took it can remove a mistake; families and the head
      // coach can always remove one.
      if (!(
        actor.role === "Parent" ||
        actor.head ||
        (actor.role === "Coach" && actor.name === m.coach)
      ))
        throw Error(
          "A parent, the head coach or the photographer removes photos.",
        );
      f.moments = f.moments.filter((x) => x.id !== m.id);
      break;
    }
    case "avatar": {
      staff();
      kid(action.childId);
      if (!photoConsent(state, action.childId))
        throw Error("This family has not given photo consent.");
      f.avatars[action.childId] = action.photoId;
      break;
    }
    case "consent": {
      guardianOrHead();
      kid(action.childId);
      f.consent[action.childId] = !!action.value;
      if (!action.value) delete f.avatars[action.childId];
      break;
    }
    case "note": {
      staff();
      kid(action.childId);
      const text = action.text?.trim().slice(0, 400);
      if (!text) throw Error("Write the note first.");
      f.notes.push({
        id: crypto.randomUUID(),
        childId: action.childId,
        text,
        followUp: !!action.followUp,
        done: false,
        coach: actor.name,
        at,
      });
      break;
    }
    case "resolveNote": {
      staff();
      const n = f.notes.find((n) => n.id === action.id);
      if (!n) throw Error("Note not found.");
      n.done = true;
      n.doneBy = actor.name;
      n.doneAt = at;
      break;
    }
    case "outage": {
      head();
      if (!stations.some((s) => s.id === action.station))
        throw Error("Choose a station.");
      if (action.reason === null) delete f.outages[action.station];
      else {
        const reason = action.reason?.trim().slice(0, 120);
        if (!reason) throw Error("Say why the station is paused.");
        f.outages[action.station] = { reason, by: actor.name, at };
      }
      break;
    }
    default:
      throw Error("Unknown floor action.");
  }
  return { ...next, floor: f };
}

export const coachAct = (s, actor, action, now) =>
  applyClub(s, { role: "Coach", coach: actor.name, ...action }, now);

/*
 * A coach standing next to a kid is proof enough that the kid is here.
 * Before a station or recognition record, confirm class attendance (class
 * blocks) or a front-desk check-in (open gym) in the same step.
 */
export function ensurePresent(s, actor, childId, block, now = new Date()) {
  let next = s;
  if (block.kind === "class") {
    const mine = (next.club?.events ?? []).filter(
      (e) =>
        e.childId === childId && e.kind === "class" && e.session === block.id,
    );
    if (!mine.some((e) => e.status === "approved")) {
      const pending = mine.find((e) => e.status === "pending");
      next = pending
        ? coachAct(
            next,
            actor,
            { type: "approve", id: pending.id, childId },
            now,
          )
        : coachAct(
            next,
            actor,
            { type: "record", kind: "class", session: block.id, childId },
            now,
          );
    }
  }
  if (!isHere(next, childId, now))
    next = applyFloor(
      next,
      { type: "checkIn", childIds: [childId], by: actor.name, actor },
      now,
    );
  return next;
}

export function recordAt(
  s,
  actor,
  block,
  childId,
  kind,
  extra = {},
  now = new Date(),
) {
  const next = ensurePresent(s, actor, childId, block, now);
  return coachAct(
    next,
    actor,
    { type: "record", kind, childId, session: block.id, ...extra },
    now,
  );
}
