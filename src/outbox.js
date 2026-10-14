// Notices for staff: schedule published, a request needs a decision, a
// cover is open, a request was decided. Reducers add them; the coach app
// shows them as an inbox. In the database this is the notifications
// table, and delivery by text or push happens there.
//   {id, kind, to: [staffId] | "managers", text, at, readBy: {staffId: at}}
import { staff } from "./roster.js";

const MAX = 200;

export const outboxOf = (state) =>
  Array.isArray(state?.outbox) ? state.outbox : [];

export function withNotices(state, notices, now = new Date()) {
  if (!notices.length) return state;
  const at = new Date(now).toISOString();
  const next = [
    ...outboxOf(state),
    ...notices.map((n) => ({
      id: crypto.randomUUID(),
      at,
      readBy: {},
      ...n,
    })),
  ];
  return { ...state, outbox: next.slice(-MAX) };
}

const isManager = (staffId) => !!staff.find((s) => s.id === staffId)?.head;

// Notices for one person, newest first. `manager` says whether they see
// notices sent to managers.
export function inbox(state, staffId, { manager = isManager(staffId) } = {}) {
  return outboxOf(state)
    .filter((n) =>
      n.to === "managers" ? manager : (n.to ?? []).includes(staffId),
    )
    .slice()
    .reverse();
}
export const unread = (state, staffId, opts) =>
  inbox(state, staffId, opts).filter((n) => !n.readBy?.[staffId]);

export function applyOutbox(state, action, now = new Date()) {
  const actor = action.actor ?? {};
  if (!actor.staffId) throw Error("Sign in first.");
  const at = new Date(now).toISOString();
  const ids = new Set(action.ids ?? []);
  return {
    ...state,
    outbox: outboxOf(state).map((n) =>
      ids.has(n.id)
        ? { ...n, readBy: { ...n.readBy, [actor.staffId]: at } }
        : n,
    ),
  };
}
