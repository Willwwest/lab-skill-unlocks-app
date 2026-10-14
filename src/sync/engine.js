// Keeps the app's state in step with the database for every person and
// screen at a location.
//
//   boot()        signs back in (person or screen) and loads the state
//   attach()      lets the engine update React state and show errors
//   push(state)   writes what changed since the last push, in order
//
// Changes from anyone else arrive over realtime; the affected part of the
// state is re-read and merged in. Writes queue one after another, and a
// re-read waits for the queue to empty so it never undoes a local change
// that is still on its way. A refused write shows its error and re-reads
// that part, so the screen always ends up showing what the server holds.
import { supabase, defaultLocation } from "./client.js";
import { Ids, splitSession } from "./ids.js";
import { merge3 } from "./merge.js";
import { docDefaults } from "./docdefaults.js";
import {
  adapters,
  adapterForTable,
  docsOps,
  docKeys,
  setPath,
} from "./adapters.js";
import { people } from "../domain.js";
import { staff, families, kidInfo, coaches } from "../roster.js";
import { blockById, sessionFromId } from "../schedule.js";

export const remote = !!supabase;

const PAGE = 1000;
let me = null; // { org_id, location_id, staff_id, guardian_id, device_id }
let ids = new Ids();
let refs = {};
let base = null;
let latest = null;
let chain = Promise.resolve();
let pending = 0;
let setStateRef = null;
// Errors go to every listener (the notice shown on top of any screen).
const noticeListeners = new Set();
export function onNotice(fn) {
  noticeListeners.add(fn);
  return () => noticeListeners.delete(fn);
}
const notifyRef = (message) => noticeListeners.forEach((fn) => fn(message));
let channel = null;
const dirty = new Set();
let flushTimer = null;
const docRevs = new Map();
export const photoPaths = new Map();

/* ---------- Signing in ---------- */

async function ensureAuth() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

async function call(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw Error(error.message);
  return data;
}

// A person on this device: link the session to their roster entry.
export async function signInPerson(phone) {
  await ensureAuth();
  const who = await call("demo_sign_in", { p_phone: phone });
  me = {
    org_id: who.org_id,
    staff_id: who.kind === "staff" ? who.id : null,
    guardian_id: who.kind === "guardian" ? who.id : null,
    device_id: null,
    location_id: null,
  };
  me.location_id = await homeLocation(who);
  // The roster comes from the database, so the code step finds new people.
  await loadRefs();
  return who;
}

async function homeLocation(who) {
  const bySlug = await supabase
    .from("locations")
    .select("id, slug")
    .eq("slug", defaultLocation)
    .maybeSingle();
  if (who.kind === "staff") {
    const { data } = await supabase
      .from("staff_locations")
      .select("location_id")
      .eq("staff_id", who.id);
    const mine = (data ?? []).map((r) => r.location_id);
    if (bySlug.data && (who.owner || mine.includes(bySlug.data.id)))
      return bySlug.data.id;
    if (mine[0]) return mine[0];
  }
  if (who.kind === "guardian") {
    const { data } = await supabase
      .from("families")
      .select("home_location_id")
      .eq("id", who.family_id)
      .maybeSingle();
    if (data?.home_location_id) return data.home_location_id;
  }
  if (bySlug.data) return bySlug.data.id;
  throw Error("This account has no gym location yet.");
}

// A TV or the front-desk kiosk.
export async function signInScreen(kind) {
  await ensureAuth();
  const r = await call("device_sign_in", {
    p_location_slug: defaultLocation,
    p_kind: kind,
  });
  me = {
    org_id: r.org_id,
    location_id: r.location_id,
    device_id: r.device_id,
    staff_id: null,
    guardian_id: null,
  };
}

export async function signOutRemote() {
  stop();
  me = null;
  base = null;
  latest = null;
  dirty.clear();
  docRevs.clear();
  await supabase.auth.signOut().catch(() => {});
}

/* ---------- Reading ---------- */

// Reads every row a query returns, a page at a time.
async function all(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw Error(error.message);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

const q = {
  org: (table, cols = "*", order) =>
    all(() => {
      let x = supabase.from(table).select(cols);
      return order ? x.order(order) : x.order(firstKey(table));
    }),
  here: (table, cols = "*", order) =>
    all(() => {
      let x = supabase
        .from(table)
        .select(cols)
        .eq("location_id", me.location_id);
      return order ? x.order(order) : x.order(firstKey(table));
    }),
  hereOpen: (table, cols = "*") =>
    all(() =>
      supabase
        .from(table)
        .select(cols)
        .eq("location_id", me.location_id)
        .is("cleared_at", null)
        .order("created_at"),
    ),
};
// A stable order so paging never skips rows.
const firstKey = (table) =>
  ({
    club_profiles: "athlete_id",
    memberships: "id",
    class_session_runs: "session_id",
    block_floor_use: "block_id",
    athlete_goals: "at",
  })[table] ?? "id";

async function loadRefs() {
  const sel = (t, c, o = "id") =>
    all(() => supabase.from(t).select(c).order(o));
  const isStaff = !!me.staff_id;
  const [
    skills,
    tiers,
    bonuses,
    stations,
    prizes,
    shoutouts,
    groups,
    blocks,
    sessions,
    directory,
    fullStaff,
    staffLocs,
    fams,
    guardians,
    athletes,
    enrollments,
    photos,
  ] = await Promise.all([
    sel("skills", "id, code"),
    sel("tiers", "id, number"),
    sel("bonuses", "id, code"),
    sel("stations", "id, code"),
    sel("prizes", "id, code, cost"),
    sel("shoutouts", "id, label"),
    sel("competition_groups", "id, label"),
    all(() =>
      supabase
        .from("schedule_blocks")
        .select("id, app_key, legacy_index")
        .eq("location_id", me.location_id)
        .order("id"),
    ),
    all(() =>
      supabase
        .from("class_sessions")
        .select("id, day, block_id")
        .eq("location_id", me.location_id)
        .order("id"),
    ),
    sel("staff_directory", "id, legacy_id, name, initials, active"),
    isStaff ? sel("staff", "*") : [],
    isStaff ? sel("staff_locations", "*", "staff_id") : [],
    sel("families", "id, legacy_id, name, home_location_id"),
    sel("guardians", "id, family_id, name, phone, is_primary"),
    sel("athletes", "*"),
    sel("enrollments", "athlete_id, block_id", "athlete_id"),
    sel("photos", "id, path, thumb_path"),
  ]);
  refs = { prizes, staffLocs, fullStaff, directory, fams, guardians, athletes };
  refs.enrollments = enrollments;

  ids = new Ids();
  for (const s of skills) ids.add("skill", s.code, s.id);
  for (const t of tiers) ids.add("tier", t.number, t.id);
  for (const b of bonuses) ids.add("bonus", b.code, b.id);
  for (const s of stations) ids.add("station", s.code, s.id);
  for (const p of prizes) ids.add("prize", p.code, p.id);
  for (const s of shoutouts) ids.add("shoutout", s.label, s.id);
  for (const g of groups) ids.add("group", g.label, g.id);
  const blockKey = new Map();
  for (const b of blocks) {
    const key = b.app_key ?? String(b.legacy_index ?? b.id);
    blockKey.set(b.id, key);
    ids.add("block", key, b.id);
  }
  for (const s of sessions)
    ids.add("session", `${s.day}:${blockKey.get(s.block_id)}`, s.id);
  for (const s of directory) ids.addStaff(s.legacy_id ?? s.id, s.id, s.name);
  for (const f of fams) ids.add("family", f.legacy_id ?? f.id, f.id);
  for (const g of guardians) ids.add("guardian", g.phone ?? g.id, g.id);
  for (const a of athletes) ids.add("athlete", a.legacy_id ?? a.id, a.id);
  photoPaths.clear();
  for (const p of photos) photoPaths.set(p.id, p);
  hydrateRoster(blockKey);
}

/* ---------- The roster comes from the database ---------- */

// The app imports its roster as module arrays; refill them in place so
// every screen sees the database's people. Demo PINs stay on the device
// for the shared-iPad lock until those checks move to the server.
const palette = [
  "#C2E6DB",
  "#DCD3FC",
  "#FBE4B7",
  "#C9EEFA",
  "#FFD9D1",
  "#E2F5C4",
  "#D9E3FF",
];
const pins = {
  staff: new Map(staff.map((s) => [s.id, s.pin])),
  family: new Map(families.map((f) => [f.id, f.pin])),
};
const order = (list, original) => {
  const pos = new Map(original.map((x, i) => [x.id, i]));
  return list.sort(
    (a, b) =>
      (pos.get(a.id) ?? 1e6) - (pos.get(b.id) ?? 1e6) ||
      a.name.localeCompare(b.name),
  );
};
const ageOn = (birth, now = new Date()) => {
  if (!birth) return null;
  const [y, m, d] = birth.split("-").map(Number);
  const had =
    now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d);
  return now.getFullYear() - y - (had ? 0 : 1);
};

function hydrateRoster(blockKey) {
  const role = new Map(
    refs.staffLocs
      .filter((r) => r.location_id === me.location_id)
      .map((r) => [r.staff_id, r.role]),
  );
  const full = new Map(refs.fullStaff.map((s) => [s.id, s]));
  const nextStaff = refs.directory
    .filter((s) => s.active)
    .map((s) => {
      const f = full.get(s.id);
      const id = s.legacy_id ?? s.id;
      return {
        id,
        name: s.name,
        initials: s.initials,
        pin: pins.staff.get(id),
        head: role.get(s.id) === "manager",
        ...(f?.is_owner ? { owner: true } : {}),
        phone: f?.phone ?? undefined,
      };
    });
  replace(staff, order(nextStaff, staff));
  replace(
    coaches,
    staff.filter((s) => !s.owner),
  );

  const famApp = (id) => ids.app("family", id);
  const kidsOf = new Map();
  const classes = new Map();
  for (const e of refs.enrollments) {
    const k = blockKey.get(e.block_id);
    if (k !== undefined)
      (
        classes.get(e.athlete_id) ??
        classes.set(e.athlete_id, []).get(e.athlete_id)
      ).push(k);
  }
  const nextPeople = refs.athletes.map((a, i) => {
    const id = a.legacy_id ?? a.id;
    if (a.family_id)
      (
        kidsOf.get(a.family_id) ?? kidsOf.set(a.family_id, []).get(a.family_id)
      ).push(id);
    kidInfo[id] = {
      last: a.last_name,
      family: a.family_id ? famApp(a.family_id) : null,
      birthday: a.birthdate ? a.birthdate.slice(5) : "",
      classes: classes.get(a.id) ?? [],
      ...(a.care_note ? { care: a.care_note } : {}),
      photoDefault: true,
    };
    return {
      id,
      name: `${a.first_name} ${a.last_name}`.trim(),
      first: a.first_name,
      last: a.last_name,
      age: ageOn(a.birthdate),
      initials: a.initials,
      color: a.color ?? palette[i % palette.length],
      goal: a.goal_text ?? "",
    };
  });
  const keep = new Set(nextPeople.map((p) => p.id));
  for (const id of Object.keys(kidInfo)) if (!keep.has(id)) delete kidInfo[id];
  replace(people, order(nextPeople, people));

  const nextFamilies = refs.fams.map((f) => {
    const gs = refs.guardians
      .filter((g) => g.family_id === f.id)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    const id = f.legacy_id ?? f.id;
    return {
      id,
      name: f.name,
      guardian: gs[0]?.name ?? f.name,
      pin: pins.family.get(id),
      guardians: gs.map((g) => ({ name: g.name, phone: g.phone })),
      kids: kidsOf.get(f.id) ?? [],
    };
  });
  replace(families, order(nextFamilies, families));
}
const replace = (arr, items) => arr.splice(0, arr.length, ...items);

/* ---------- Loading the whole state ---------- */

const ctx = () => ({
  ids,
  me,
  prizeCost: (code) =>
    refs.prizes.find((p) => p.id === ids.db("prize", code))?.cost ?? 1,
  sessionId,
  blockId,
});

async function sessionId(appId) {
  const known = ids.db("session", appId);
  if (known) return known;
  const { day, block } = splitSession(appId);
  const b = sessionFromId(latest, appId) ?? blockById(latest, block);
  if (!b) throw Error(`Unknown class ${appId}.`);
  const id = await call("session_for", {
    p_location: me.location_id,
    p_day: day,
    p_block: block,
    p_name: b.name,
    p_kind: b.kind,
    p_start: b.start,
    p_end: b.end,
  });
  ids.add("session", appId, id);
  return id;
}

async function blockId(key) {
  const known = ids.db("block", key);
  if (known) return known;
  const b = blockById(latest, key);
  if (!b) throw Error(`Unknown class ${key}.`);
  const id = await call("block_for", {
    p_location: me.location_id,
    p_block: key,
    p_name: b.name,
    p_kind: b.kind,
    p_start: b.start,
    p_end: b.end,
  });
  ids.add("block", key, id);
  return id;
}

async function loadAdapter(a, state) {
  const rows = await a.fetch(q);
  const slice = a.load(rows, ctx());
  return a.merge ? a.merge(state, slice) : { ...state, ...slice };
}

async function loadDocs(state) {
  const rows = await all(() =>
    supabase
      .from("location_state_docs")
      .select("key, doc, rev")
      .eq("location_id", me.location_id)
      .order("key"),
  );
  let next = state;
  for (const r of rows) {
    docRevs.set(r.key, r.rev);
    next = setPath(next, r.key, r.doc);
  }
  return next;
}

// The state this location's database holds, over the app's own defaults
// for anything not stored yet.
export async function load(defaults) {
  await loadRefs();
  let state = defaults;
  for (const a of adapters) state = await loadAdapter(a, state);
  state = await loadDocs(state);
  base = state;
  latest = state;
  return state;
}

/* ---------- Writing ---------- */

export function attach({ setState }) {
  setStateRef = setState;
  subscribe();
}

export function push(state) {
  latest = state;
  if (!me || !base || state === base) return;
  const prev = base;
  base = state;
  pending += 1;
  chain = chain
    .then(() => write(prev, state))
    .catch((e) => notifyRef(e.message ?? String(e), true))
    .finally(() => {
      pending -= 1;
      if (!pending) scheduleFlush();
    });
}

async function write(prev, next) {
  const c = ctx();
  for (const a of adapters) {
    let ops;
    try {
      ops = await a.ops(prev, next, c);
    } catch (e) {
      fail(a.name, e);
      continue;
    }
    for (const op of ops) {
      try {
        await run(op);
      } catch (e) {
        fail(a.name, e);
        break;
      }
    }
  }
  for (const op of docsOps(prev, next, docDefaults)) {
    try {
      await saveDoc(op);
    } catch (e) {
      fail("docs", e);
    }
  }
}

function fail(name, e) {
  notifyRef(e.message ?? String(e), true);
  dirty.add(name);
}

async function run(op) {
  const t = () => supabase.from(op.table);
  let res;
  if (op.t === "rpc") res = await supabase.rpc(op.fn, op.args);
  else if (op.t === "insert") res = await t().insert(op.row);
  else if (op.t === "upsert")
    res = await t().upsert(op.row, {
      onConflict: op.onConflict,
      ignoreDuplicates: op.ignore,
    });
  else if (op.t === "update") {
    let x = t().update(op.row).match(op.match);
    if (op.isNull) x = x.is(op.isNull, null);
    res = await x;
  } else if (op.t === "delete") res = await t().delete().match(op.match);
  if (res?.error) throw Error(res.error.message);
}

// Saves a shared document; when someone else saved first, merges this
// change into theirs and tries again.
async function saveDoc(op) {
  let doc = op.doc;
  let from = op.base;
  for (let tries = 0; tries < 4; tries += 1) {
    const r = await call("save_state_doc", {
      p_location: me.location_id,
      p_key: op.key,
      p_doc: doc,
      p_base_rev: docRevs.get(op.key) ?? 0,
    });
    if (!r.conflict) {
      docRevs.set(op.key, r.rev);
      if (doc !== op.doc) applyDoc(op.key, doc);
      return;
    }
    docRevs.set(op.key, r.rev ?? 0);
    doc = merge3(from, doc, r.doc);
    from = r.doc;
  }
  throw Error("Someone else keeps changing this. Try again.");
}

function applyDoc(key, doc) {
  base = setPath(base, key, doc);
  setStateRef?.((s) => (latest = setPath(s, key, doc)));
}

/* ---------- Changes from everyone else ---------- */

// Activity at one gym only reaches that gym's screens. Deletes can't be
// filtered by column, so those come for every location.
const LOCAL = new Set([
  "club_events",
  "desk_visits",
  "session_checkins",
  "class_session_runs",
  "block_plans",
  "block_floor_use",
  "zones",
  "station_outages",
  "memberships",
  "membership_syncs",
  "location_state_docs",
  "class_sessions",
]);

function subscribe() {
  if (channel || !me) return;
  channel = supabase.channel(`lab:${me.location_id}`);
  const mark = (table) => () => {
    for (const name of adapterForTable[table]) dirty.add(name);
    scheduleFlush();
  };
  for (const table of Object.keys(adapterForTable)) {
    if (!LOCAL.has(table)) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        mark(table),
      );
      continue;
    }
    const filter = `location_id=eq.${me.location_id}`;
    for (const event of ["INSERT", "UPDATE"])
      channel.on(
        "postgres_changes",
        { event, schema: "public", table, filter },
        mark(table),
      );
    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table },
      mark(table),
    );
  }
  channel.subscribe();
}

function stop() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 250);
}

async function flush() {
  if (pending || !dirty.size || !base) return;
  const names = [...dirty];
  dirty.clear();
  try {
    const roster = names.some((n) =>
      ["roster", "sessions", "photos"].includes(n),
    );
    if (roster) await loadRefs();
    let next = base;
    for (const a of adapters)
      if (names.includes(a.name) || names.includes("roster"))
        next = await loadAdapter(a, next);
    if (names.includes("docs")) next = await loadDocs(next);
    if (pending) {
      // A local change started meanwhile; read again once it lands.
      names.forEach((n) => dirty.add(n));
      return;
    }
    // Only the top-level parts that came back different replace local ones.
    // A part this device changed while the read was in flight keeps the
    // local change: shared documents merge it with the server's copy; table
    // data keeps it (its write is queued) and is read again afterwards.
    const before = base;
    const keys = Object.keys(next).filter((k) => next[k] !== before[k]);
    if (!keys.length && !roster) return;
    const docs = new Set(docKeys(next));
    setStateRef?.((s) => {
      const out = { ...s };
      let server = base;
      for (const k of keys) {
        if (s[k] === before[k]) {
          out[k] = k === "gym" ? { ...s.gym, ...next.gym } : next[k];
          server = { ...server, [k]: out[k] };
        } else if (docs.has(k)) {
          out[k] = merge3(before[k], s[k], next[k]);
          server = { ...server, [k]: next[k] };
        } else {
          dirty.add(
            k === "gym"
              ? "gym"
              : (adapters.find((a) => a.keys.includes(k))?.name ?? "docs"),
          );
        }
      }
      base = server;
      if (dirty.size) scheduleFlush();
      return (latest = out);
    });
  } catch (e) {
    names.forEach((n) => dirty.add(n));
    notifyRef(`Couldn't refresh: ${e.message}`, true);
  }
}

export const status = () => ({ me, pending });
export const dbId = (kind, appId) => ids.db(kind, appId);
