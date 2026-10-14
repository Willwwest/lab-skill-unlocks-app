// Maps between the app's ids and the database's uuids.
//
// The app names people, skills, stations and blocks with readable ids
// ("theo", "jordan", "S07", "grip", "0"); the database keeps those in
// legacy_id / code / app_key next to a uuid. Records the app creates
// (awards, check-ins, events) already use uuids, so those pass through.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x) => typeof x === "string" && UUID.test(x);

export class Ids {
  constructor() {
    this.toDb = new Map();
    this.toApp = new Map();
    this.staffByName = new Map();
    this.staffNames = new Map();
  }
  add(kind, appId, dbId) {
    if (appId === null || appId === undefined || !dbId) return;
    this.toDb.set(`${kind}:${appId}`, dbId);
    this.toApp.set(`${kind}:${dbId}`, String(appId));
  }
  // The uuid for an app id. Records the app made are already uuids.
  db(kind, appId) {
    if (appId === null || appId === undefined) return null;
    return this.toDb.get(`${kind}:${appId}`) ?? (isUuid(appId) ? appId : null);
  }
  app(kind, dbId) {
    if (!dbId) return null;
    return this.toApp.get(`${kind}:${dbId}`) ?? dbId;
  }
  has(kind, appId) {
    return this.toDb.has(`${kind}:${appId}`);
  }
  addStaff(appId, dbId, name) {
    this.add("staff", appId, dbId);
    if (name) {
      this.staffByName.set(name, dbId);
      this.staffNames.set(dbId, name);
    }
  }
  // Records store a coach's display name ("Coach Jordan").
  staffIdByName(name) {
    return (name && this.staffByName.get(name)) ?? null;
  }
  staffName(dbId) {
    return (dbId && this.staffNames.get(dbId)) ?? null;
  }
}

// "2026-10-12:1" -> { day: "2026-10-12", block: "1" }
export const splitSession = (id) => ({
  day: String(id).slice(0, 10),
  block: String(id).slice(11),
});

// Timestamps compare as the app writes them (toISOString).
export const iso = (x) => (x ? new Date(x).toISOString() : null);
