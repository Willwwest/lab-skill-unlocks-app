// How each part of the app's state maps to database rows.
//
// Every adapter has:
//   fetch(q)            the rows it needs (q.org / q.here read with RLS)
//   load(rows, ctx)     those rows as the app's state shape
//   ops(base, next, ctx) the writes that turn `base` into `next`
//
// ops compare row projections, not app objects, so cosmetic differences
// in the app's shapes (a missing optional field) never cause a write.
// Writes that hold a rule go through database functions (op t: "rpc").
import { gymDayKey } from "../gym-time.js";
import { iso, splitSession } from "./ids.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = (list) => new Map((list ?? []).map((x) => [x.id, x]));
const sortAt = (a, b) => String(a.at).localeCompare(String(b.at));
const compact = (o) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null),
  );

// Changed, added and removed records between two lists keyed by `key`.
function diff(base, next, key = (x) => x.id, project = (x) => x) {
  const b = new Map((base ?? []).map((x) => [key(x), x]));
  const n = new Map((next ?? []).map((x) => [key(x), x]));
  const added = [];
  const changed = [];
  const removed = [];
  for (const [k, x] of n) {
    if (!b.has(k)) added.push(x);
    else if (!same(project(b.get(k)), project(x))) changed.push([b.get(k), x]);
  }
  for (const [k, x] of b) if (!n.has(k)) removed.push(x);
  return { added, changed, removed };
}
const entries = (o) => Object.entries(o ?? {});
const asList = (o, f) => entries(o).map(([k, v]) => f(k, v));

const insert = (table, row) => ({ t: "insert", table, row });
const upsert = (table, row, onConflict, ignore = false) => ({
  t: "upsert",
  table,
  row,
  onConflict,
  ignore,
});
const update = (table, row, match, isNull) => ({
  t: "update",
  table,
  row,
  match,
  isNull,
});
const remove = (table, match) => ({ t: "delete", table, match });
const rpc = (fn, args) => ({ t: "rpc", fn, args });

/* ---------- Skills: awards, practice, bonuses, goals, shirts ---------- */

export const skills = {
  name: "skills",
  keys: ["awards", "practice", "bonusAwards", "rewards", "audit", "goals"],
  async fetch(q) {
    return {
      awards: await q.org("skill_awards", "*", "awarded_at"),
      practice: await q.org("skill_practice", "*", "at"),
      bonuses: await q.org("bonus_awards", "*", "at"),
      goals: await q.org("athlete_goals", "*", "at"),
      rewards: await q.org("tier_rewards", "*", "earned_at"),
    };
  },
  load(rows, { ids }) {
    const kid = (id) => ids.app("athlete", id);
    const skill = (id) => ids.app("skill", id);
    // Seeded awards keep the prototype's ids ("seed-theo-S01").
    for (const a of rows.awards)
      if (a.legacy_id) ids.add("award", a.legacy_id, a.id);
    const awards = rows.awards.map((a) =>
      compact({
        id: a.legacy_id ?? a.id,
        childId: kid(a.athlete_id),
        skillId: skill(a.skill_id),
        coach: ids.staffName(a.awarded_by) ?? "Coach",
        value: a.value === null ? "Demonstrated" : Number(a.value),
        setup: a.setup,
        version: a.skill_version,
        at: iso(a.awarded_at),
        note: a.note ?? "",
        secondDate: a.second_date ?? undefined,
        project: a.project ?? undefined,
        revoked: !!a.revoked_at,
        reason: a.revoke_reason ?? undefined,
      }),
    );
    const goals = {};
    for (const g of rows.goals)
      (goals[kid(g.athlete_id)] ??= []).push(skill(g.skill_id));
    // The activity log the app shows, rebuilt from the award ledger.
    const audit = rows.awards
      .flatMap((a) => [
        {
          at: iso(a.awarded_at),
          action: "Verified achievement",
          childId: kid(a.athlete_id),
          skillId: skill(a.skill_id),
          by: ids.staffName(a.awarded_by) ?? "Coach",
        },
        ...(a.revoked_at
          ? [
              {
                at: iso(a.revoked_at),
                action: `Corrected award: ${a.revoke_reason}`,
                childId: kid(a.athlete_id),
                skillId: skill(a.skill_id),
                by: ids.staffName(a.revoked_by) ?? "Manager",
              },
            ]
          : []),
      ])
      .sort(sortAt);
    return {
      version: 1,
      awards,
      practice: rows.practice.map((p) => ({
        id: p.id,
        childId: kid(p.athlete_id),
        skillId: skill(p.skill_id),
        at: iso(p.at),
      })),
      bonusAwards: rows.bonuses.map((b) => ({
        type: "bonus",
        childId: kid(b.athlete_id),
        bonusId: ids.app("bonus", b.bonus_id),
        at: iso(b.at),
      })),
      rewards: rows.rewards.map((r) => {
        const tier = Number(ids.app("tier", r.tier_id));
        const childId = kid(r.athlete_id);
        ids.add("reward", `${childId}-${tier}`, r.id);
        return {
          id: `${childId}-${tier}`,
          childId,
          tier,
          status: r.status,
          size: r.size ?? "",
          earnedAt: iso(r.earned_at),
          review: r.needs_review,
        };
      }),
      audit,
      goals,
    };
  },
  async ops(base, next, { ids, me }) {
    const out = [];
    const a = diff(base.awards, next.awards);
    for (const w of a.added)
      out.push(
        rpc("award_skill", {
          p_athlete: ids.db("athlete", w.childId),
          p_skill: ids.db("skill", w.skillId),
          p_location: me.location_id,
          p_value: typeof w.value === "number" ? w.value : null,
          p_note: w.note || null,
          p_second_date: w.secondDate ?? null,
          p_project: w.project ?? null,
          p_id: ids.db("award", w.id),
          p_at: w.at,
        }),
      );
    for (const [was, now] of a.changed)
      if (!was.revoked && now.revoked)
        out.push(
          rpc("revoke_award", {
            p_award: ids.db("award", now.id),
            p_reason: now.reason ?? "Corrected",
          }),
        );

    for (const p of diff(base.practice, next.practice).added)
      out.push(
        insert("skill_practice", {
          id: p.id,
          org_id: me.org_id,
          location_id: me.location_id,
          athlete_id: ids.db("athlete", p.childId),
          skill_id: ids.db("skill", p.skillId),
          recorded_by: me.staff_id,
          at: p.at,
        }),
      );

    const bonusKey = (b) => `${b.childId}:${b.bonusId}`;
    for (const b of diff(base.bonusAwards, next.bonusAwards, bonusKey).added)
      out.push(
        upsert(
          "bonus_awards",
          {
            athlete_id: ids.db("athlete", b.childId),
            bonus_id: ids.db("bonus", b.bonusId),
            org_id: me.org_id,
            awarded_by: me.staff_id,
            at: b.at,
          },
          "athlete_id,bonus_id",
          true,
        ),
      );

    const goalRows = (goals) =>
      entries(goals).flatMap(([childId, list]) =>
        (list ?? []).map((skillId) => ({ childId, skillId })),
      );
    const goalKey = (g) => `${g.childId}:${g.skillId}`;
    const g = diff(goalRows(base.goals), goalRows(next.goals), goalKey);
    for (const x of g.removed)
      out.push(
        remove("athlete_goals", {
          athlete_id: ids.db("athlete", x.childId),
          skill_id: ids.db("skill", x.skillId),
        }),
      );
    for (const x of g.added)
      out.push(
        insert("athlete_goals", {
          athlete_id: ids.db("athlete", x.childId),
          skill_id: ids.db("skill", x.skillId),
          org_id: me.org_id,
        }),
      );

    // Shirts are created by the server when a tier completes; the app only
    // moves them through fulfillment.
    const r = diff(base.rewards, next.rewards, undefined, (x) => [
      x.status,
      x.size,
    ]);
    for (const [, now] of r.changed)
      if (ids.has("reward", now.id))
        out.push(
          rpc("update_reward", {
            p_reward: ids.db("reward", now.id),
            p_status: now.status,
            p_size: now.size || null,
          }),
        );
    return out;
  },
};

/* ---------- Clubhouse: stars, claims, leaderboard profiles ---------- */

export const club = {
  name: "club",
  keys: ["club"],
  async fetch(q) {
    return {
      events: await q.here("club_events", "*", "at"),
      claims: await q.org("prize_claims", "*", "at"),
      profiles: await q.org("club_profiles", "*"),
    };
  },
  load(rows, { ids }) {
    const profiles = {};
    for (const p of rows.profiles)
      profiles[ids.app("athlete", p.athlete_id)] = {
        group: ids.app("group", p.group_id),
        optIn: p.opt_in,
        alias: p.alias ?? "",
      };
    return {
      club: {
        events: rows.events.map((e) =>
          compact({
            id: e.id,
            childId: ids.app("athlete", e.athlete_id),
            kind: e.kind,
            station: e.station_id ? ids.app("station", e.station_id) : null,
            session: ids.app("session", e.session_id),
            category: e.shoutout_id ? ids.app("shoutout", e.shoutout_id) : null,
            note: e.note ?? "",
            at: iso(e.at),
            status: e.status,
            coach: ids.staffName(e.coach_id ?? e.reviewed_by),
            reviewedAt: iso(e.reviewed_at) ?? undefined,
            reason: e.reason ?? undefined,
          }),
        ),
        claims: rows.claims.map((c) =>
          compact({
            id: c.id,
            childId: ids.app("athlete", c.athlete_id),
            prizeId: ids.app("prize", c.prize_id),
            at: iso(c.at),
            status: c.status,
            coach: ids.staffName(c.updated_by) ?? undefined,
            updatedAt: c.updated_by ? iso(c.updated_at) : undefined,
          }),
        ),
        profiles,
      },
    };
  },
  async ops(base, next, ctx) {
    const { ids, me } = ctx;
    const b = base.club ?? {};
    const n = next.club ?? {};
    const out = [];
    const ev = diff(b.events, n.events, undefined, (e) => [
      e.status,
      e.coach,
      e.reviewedAt,
      e.reason,
    ]);
    for (const e of ev.added)
      out.push(
        insert("club_events", {
          id: e.id,
          org_id: me.org_id,
          location_id: me.location_id,
          athlete_id: ids.db("athlete", e.childId),
          session_id: await ctx.sessionId(e.session),
          kind: e.kind,
          station_id: e.station ? ids.db("station", e.station) : null,
          shoutout_id: e.category ? ids.db("shoutout", e.category) : null,
          note: e.note || null,
          status: e.status,
          source:
            e.status === "pending"
              ? me.guardian_id
                ? "parent"
                : "athlete"
              : "coach",
          coach_id: e.coach ? ids.staffIdByName(e.coach) : null,
          created_by_guardian: me.guardian_id,
          at: e.at,
          reviewed_by: e.reviewedAt ? ids.staffIdByName(e.coach) : null,
          reviewed_at: e.reviewedAt ?? null,
          reason: e.reason ?? null,
        }),
      );
    for (const [, e] of ev.changed)
      out.push(
        update(
          "club_events",
          {
            status: e.status,
            reviewed_by: ids.staffIdByName(e.coach) ?? me.staff_id,
            reviewed_at: e.reviewedAt ?? null,
            reason: e.reason ?? null,
          },
          { id: e.id },
        ),
      );

    const cl = diff(b.claims, n.claims, undefined, (c) => [c.status]);
    for (const c of cl.added)
      out.push(
        insert("prize_claims", {
          id: c.id,
          org_id: me.org_id,
          location_id: me.location_id,
          athlete_id: ids.db("athlete", c.childId),
          prize_id: ids.db("prize", c.prizeId),
          cost: ctx.prizeCost(c.prizeId),
          status: c.status,
          at: c.at,
        }),
      );
    for (const [, c] of cl.changed)
      out.push(
        update(
          "prize_claims",
          {
            status: c.status,
            updated_by: ids.staffIdByName(c.coach) ?? me.staff_id,
            updated_at: c.updatedAt ?? new Date().toISOString(),
          },
          { id: c.id },
        ),
      );

    for (const [childId, p] of entries(n.profiles))
      if (!same(b.profiles?.[childId], p))
        out.push(
          upsert(
            "club_profiles",
            {
              athlete_id: ids.db("athlete", childId),
              org_id: me.org_id,
              group_id: ids.db("group", p.group),
              opt_in: !!p.optIn,
              alias: p.alias || null,
              updated_at: new Date().toISOString(),
            },
            "athlete_id",
          ),
        );
    return out;
  },
};

/* ---------- Floor: front desk, photos, notes, consent, outages ---------- */

export const floor = {
  name: "floor",
  keys: ["floor"],
  async fetch(q) {
    return {
      presence: await q.here("desk_visits", "*", "checked_in_at"),
      moments: await q.org("moments", "*", "at"),
      notes: await q.org("staff_notes", "*", "at"),
      photoKids: await q.org("athletes", "id, photo_consent, avatar_photo_id"),
      outages: await q.hereOpen("station_outages", "*"),
    };
  },
  load(rows, { ids }) {
    const avatars = {};
    const consent = {};
    for (const k of rows.photoKids) {
      const id = ids.app("athlete", k.id);
      if (k.avatar_photo_id) avatars[id] = k.avatar_photo_id;
      if (k.photo_consent !== null) consent[id] = k.photo_consent;
    }
    const outages = {};
    for (const o of rows.outages)
      outages[ids.app("station", o.station_id)] = compact({
        reason: o.reason,
        by: ids.staffName(o.created_by) ?? undefined,
        at: iso(o.created_at),
      });
    return {
      floor: {
        presence: rows.presence.map((p) => ({
          id: p.id,
          childId: ids.app("athlete", p.athlete_id),
          familyId: p.family_id ? ids.app("family", p.family_id) : null,
          in: iso(p.checked_in_at),
          out: iso(p.checked_out_at),
          by: ids.staffName(p.checked_in_by) ?? "Front desk",
        })),
        moments: rows.moments.map((m) => ({
          id: m.id,
          childId: ids.app("athlete", m.athlete_id),
          photoId: m.photo_id,
          caption: m.caption ?? "",
          link: m.award_id
            ? { type: "award", id: ids.app("award", m.award_id) }
            : null,
          coach: ids.staffName(m.created_by) ?? "Coach",
          at: iso(m.at),
          hidden: m.hidden,
        })),
        notes: rows.notes.map((n) =>
          compact({
            id: n.id,
            childId: ids.app("athlete", n.athlete_id),
            text: n.text,
            followUp: n.follow_up,
            done: !!n.done_at,
            coach: ids.staffName(n.created_by) ?? "Coach",
            at: iso(n.at),
            doneBy: ids.staffName(n.done_by) ?? undefined,
            doneAt: iso(n.done_at) ?? undefined,
          }),
        ),
        avatars,
        consent,
        outages,
      },
    };
  },
  async ops(base, next, { ids, me }) {
    const b = base.floor ?? {};
    const n = next.floor ?? {};
    const out = [];
    const pr = diff(b.presence, n.presence, undefined, (p) => [p.out]);
    for (const p of pr.added)
      out.push(
        insert("desk_visits", {
          id: p.id,
          org_id: me.org_id,
          location_id: me.location_id,
          athlete_id: ids.db("athlete", p.childId),
          family_id: p.familyId ? ids.db("family", p.familyId) : null,
          day: gymDayKey(new Date(p.in)),
          checked_in_at: p.in,
          checked_out_at: p.out,
          checked_in_by: ids.staffIdByName(p.by),
          device_id: me.device_id,
        }),
      );
    for (const [, p] of pr.changed)
      out.push(update("desk_visits", { checked_out_at: p.out }, { id: p.id }));

    const mo = diff(b.moments, n.moments, undefined, (m) => [m.hidden]);
    for (const m of mo.added)
      out.push(
        insert("moments", {
          id: m.id,
          org_id: me.org_id,
          location_id: me.location_id,
          athlete_id: ids.db("athlete", m.childId),
          photo_id: m.photoId,
          caption: m.caption || null,
          award_id:
            m.link?.type === "award" ? ids.db("award", m.link.id) : null,
          created_by: me.staff_id,
          at: m.at,
          hidden: !!m.hidden,
        }),
      );
    for (const [, m] of mo.changed)
      out.push(update("moments", { hidden: !!m.hidden }, { id: m.id }));
    for (const m of mo.removed) out.push(remove("moments", { id: m.id }));

    const no = diff(b.notes, n.notes, undefined, (x) => [x.done]);
    for (const x of no.added)
      out.push(
        insert("staff_notes", {
          id: x.id,
          org_id: me.org_id,
          location_id: me.location_id,
          athlete_id: ids.db("athlete", x.childId),
          text: x.text,
          follow_up: !!x.followUp,
          created_by: ids.staffIdByName(x.coach) ?? me.staff_id,
          at: x.at,
        }),
      );
    for (const [, x] of no.changed)
      out.push(
        update(
          "staff_notes",
          {
            done_by: ids.staffIdByName(x.doneBy) ?? me.staff_id,
            done_at: x.doneAt ?? new Date().toISOString(),
          },
          { id: x.id },
        ),
      );

    const kids = new Set([
      ...Object.keys(b.consent ?? {}),
      ...Object.keys(n.consent ?? {}),
      ...Object.keys(b.avatars ?? {}),
      ...Object.keys(n.avatars ?? {}),
    ]);
    for (const k of kids)
      if (
        b.consent?.[k] !== n.consent?.[k] ||
        b.avatars?.[k] !== n.avatars?.[k]
      )
        out.push(
          rpc("set_athlete_photo", {
            p_athlete: ids.db("athlete", k),
            p_consent: n.consent?.[k] ?? null,
            p_avatar: n.avatars?.[k] ?? null,
          }),
        );

    const stations = new Set([
      ...Object.keys(b.outages ?? {}),
      ...Object.keys(n.outages ?? {}),
    ]);
    for (const s of stations) {
      const was = b.outages?.[s];
      const now = n.outages?.[s];
      if (same(was, now)) continue;
      if (was)
        out.push(
          update(
            "station_outages",
            { cleared_at: new Date().toISOString(), cleared_by: me.staff_id },
            { location_id: me.location_id, station_id: ids.db("station", s) },
            "cleared_at",
          ),
        );
      if (now)
        out.push(
          insert("station_outages", {
            org_id: me.org_id,
            location_id: me.location_id,
            station_id: ids.db("station", s),
            reason: now.reason,
            created_by: ids.staffIdByName(now.by) ?? me.staff_id,
            created_at: now.at,
          }),
        );
    }
    return out;
  },
};

/* ---------- Gym: memberships, levels, floor check-ins, plans, runs ---------- */

// The app's run object is kept whole in `extra` so nothing it adds later is
// lost; the columns beside it are for reports.
export const gym = {
  name: "gym",
  keys: ["gym"],
  async fetch(q) {
    return {
      members: await q.here("memberships", "*"),
      syncs: await q.here("membership_syncs", "*", "synced_at"),
      levels: await q.org("athletes", "id, level, level_by, level_at"),
      checkins: await q.here("session_checkins", "*", "at"),
      plans: await q.here("block_plans", "*", "week_start"),
      runs: await q.here("class_session_runs", "*"),
    };
  },
  load(rows, { ids }) {
    const members = {};
    for (const m of rows.members)
      members[ids.app("athlete", m.athlete_id)] = {
        status: m.status,
        pastDue: m.past_due,
        joined: m.joined_on,
      };
    const levels = {};
    for (const l of rows.levels)
      if (l.level)
        levels[ids.app("athlete", l.id)] = compact({
          level: l.level,
          by: ids.staffName(l.level_by) ?? undefined,
          at: iso(l.level_at),
        });
    const last = rows.syncs.at(-1);
    const plans = {};
    for (const p of rows.plans)
      plans[ids.app("block", p.block_id)] = compact({
        minutes: p.minutes,
        warmup: p.warmup,
        mode: p.mode,
        stations: p.stations,
        week: p.week_start,
        by: ids.staffName(p.updated_by) ?? undefined,
        at: iso(p.updated_at),
      });
    const runs = {};
    for (const r of rows.runs) {
      const session = ids.app("session", r.session_id);
      runs[session] = { ...r.extra, session };
    }
    return {
      gym: {
        version: 1,
        members,
        // Until the first import, keep the app's own placeholder.
        ...(last && {
          spark: compact({
            syncedAt: iso(last.synced_at),
            source: last.source,
            by: ids.staffName(last.synced_by) ?? undefined,
            matched: last.matched ?? undefined,
            unmatched: last.unmatched,
          }),
        }),
        levels,
        checkins: rows.checkins.map((c) =>
          compact({
            id: c.id,
            childId: ids.app("athlete", c.athlete_id),
            session: ids.app("session", c.session_id),
            kind: c.kind,
            by: ids.staffName(c.checked_in_by) ?? "Coach",
            at: iso(c.at),
            deskAt: iso(c.desk_at),
            deskLate: c.desk_late || undefined,
            pastDue: c.past_due,
            inactive: c.inactive,
          }),
        ),
        plans,
        runs,
      },
    };
  },
  // Keep what only lives on this device (the generated history, crews from
  // their shared document).
  merge(state, slice) {
    return { ...state, gym: { ...state.gym, ...slice.gym } };
  },
  async ops(base, next, ctx) {
    const { ids, me } = ctx;
    const b = base.gym ?? {};
    const n = next.gym ?? {};
    const out = [];
    for (const [childId, m] of entries(n.members))
      if (!same(b.members?.[childId], m))
        out.push(
          upsert(
            "memberships",
            {
              org_id: me.org_id,
              location_id: me.location_id,
              athlete_id: ids.db("athlete", childId),
              status: m.status ?? "active",
              past_due: !!m.pastDue,
              joined_on: m.joined ?? null,
              source: "app",
              updated_at: new Date().toISOString(),
            },
            "location_id,athlete_id",
          ),
        );
    if (b.spark && n.spark && !same(b.spark, n.spark) && n.spark.syncedAt)
      out.push(
        insert("membership_syncs", {
          org_id: me.org_id,
          location_id: me.location_id,
          source: n.spark.source ?? "import",
          synced_at: n.spark.syncedAt,
          synced_by: ids.staffIdByName(n.spark.by) ?? me.staff_id,
          matched: n.spark.matched ?? null,
          unmatched: n.spark.unmatched ?? [],
        }),
      );
    for (const [childId, l] of entries(n.levels))
      if (!same(b.levels?.[childId], l))
        out.push(
          update(
            "athletes",
            {
              level: l.level,
              level_by: ids.staffIdByName(l.by) ?? me.staff_id,
              level_at: l.at ?? new Date().toISOString(),
            },
            { id: ids.db("athlete", childId) },
          ),
        );

    const ci = diff(b.checkins, n.checkins, undefined, (c) => [
      c.deskAt,
      !!c.deskLate,
    ]);
    for (const c of ci.removed)
      out.push(remove("session_checkins", { id: c.id }));
    for (const c of ci.added)
      out.push(
        insert("session_checkins", {
          id: c.id,
          org_id: me.org_id,
          location_id: me.location_id,
          session_id: await ctx.sessionId(c.session),
          athlete_id: ids.db("athlete", c.childId),
          kind: c.kind,
          checked_in_by: ids.staffIdByName(c.by) ?? me.staff_id,
          at: c.at,
          desk_at: c.deskAt ?? null,
          desk_late: !!c.deskLate,
          past_due: !!c.pastDue,
          inactive: !!c.inactive,
        }),
      );
    for (const [, c] of ci.changed)
      out.push(
        update(
          "session_checkins",
          { desk_at: c.deskAt ?? null, desk_late: !!c.deskLate },
          { id: c.id },
        ),
      );

    for (const [block, p] of entries(n.plans))
      if (!same(b.plans?.[block], p) && p.week)
        out.push(
          upsert(
            "block_plans",
            {
              org_id: me.org_id,
              location_id: me.location_id,
              block_id: await ctx.blockId(block),
              week_start: p.week,
              minutes: p.minutes,
              warmup: p.warmup ?? 5,
              mode: p.mode ?? "auto",
              stations: p.stations ?? [],
              updated_by: ids.staffIdByName(p.by) ?? me.staff_id,
              updated_at: p.at ?? new Date().toISOString(),
            },
            "block_id,week_start",
          ),
        );

    for (const [session, run] of entries(n.runs)) {
      const was = b.runs?.[session];
      if (same(was, run)) continue;
      const sessionId = await ctx.sessionId(session);
      out.push(
        upsert(
          "class_session_runs",
          {
            session_id: sessionId,
            org_id: me.org_id,
            location_id: me.location_id,
            lead_staff_id: ids.staffIdByName(run.lead),
            attendance_at: run.attendanceAt ?? null,
            attendance_done_at: run.attendanceDoneAt ?? null,
            mode: run.mode === "group" ? "group" : "station",
            started_at: run.startedAt ?? null,
            paused_at: run.pausedAt ?? null,
            ended_at: run.endedAt ?? null,
            offset_ms: Math.round(run.offset ?? 0),
            extra: run,
            updated_at: new Date().toISOString(),
          },
          "session_id",
        ),
      );
      const known = new Set((was?.handoffs ?? []).map((h) => h.id));
      for (const h of run.handoffs ?? [])
        if (!known.has(h.id))
          out.push(
            insert("run_handoffs", {
              id: h.id,
              org_id: me.org_id,
              session_id: sessionId,
              athlete_id: ids.db("athlete", h.childId),
              text: h.text,
              created_by: ids.staffIdByName(h.by) ?? me.staff_id,
              at: h.at,
            }),
          );
    }
    return out;
  },
};

/* ---------- Floor plan and per-class floor use ---------- */

const zoneRow = (z, i) => ({
  slug: z.id,
  name: z.name,
  art: z.art,
  station: z.station ?? null,
  x: z.x,
  y: z.y,
  w: z.w,
  d: z.d,
  rotation: z.rotation ?? 0,
  photo_key: z.photo ?? null,
  note: z.note ?? null,
  code: z.code ?? null,
  position: i,
});

export const layout = {
  name: "layout",
  keys: ["layout"],
  async fetch(q) {
    return { zones: await q.here("zones", "*", "position") };
  },
  load(rows, { ids }) {
    if (!rows.zones.length) return {};
    const latest = [...rows.zones]
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
      .at(-1);
    return {
      layout: {
        version: 1,
        zones: rows.zones.map((z) =>
          compact({
            id: z.slug,
            name: z.name,
            art: z.art,
            station: z.station_id ? ids.app("station", z.station_id) : null,
            x: z.x,
            y: z.y,
            w: z.w,
            d: z.d,
            rotation: z.rotation,
            photo: z.photo_key ?? undefined,
            note: z.note ?? undefined,
            code: z.code ?? undefined,
          }),
        ),
        by: ids.staffName(latest.updated_by),
        at: latest.updated_by ? iso(latest.updated_at) : null,
      },
    };
  },
  async ops(base, next, { ids, me }) {
    const b = (base.layout?.zones ?? []).map(zoneRow);
    const n = (next.layout?.zones ?? []).map(zoneRow);
    const d = diff(b, n, (z) => z.slug);
    const out = d.removed.map((z) =>
      remove("zones", { location_id: me.location_id, slug: z.slug }),
    );
    for (const z of [...d.added, ...d.changed.map(([, x]) => x)]) {
      const { station, ...row } = z;
      out.push(
        upsert(
          "zones",
          {
            ...row,
            org_id: me.org_id,
            location_id: me.location_id,
            station_id: station ? ids.db("station", station) : null,
            updated_by: ids.staffIdByName(next.layout?.by) ?? me.staff_id,
            updated_at: next.layout?.at ?? new Date().toISOString(),
          },
          "location_id,slug",
        ),
      );
    }
    return out;
  },
};

export const floorUse = {
  name: "floorUse",
  keys: ["floorUse"],
  async fetch(q) {
    return { uses: await q.here("block_floor_use", "*") };
  },
  load(rows, { ids }) {
    const all = {};
    for (const u of rows.uses)
      all[ids.app("block", u.block_id)] = compact({
        warmup: u.warmup_zones,
        close: u.close_zones,
        stations: u.station_zones,
        by: ids.staffName(u.updated_by) ?? undefined,
        at: iso(u.updated_at),
      });
    return { floorUse: all };
  },
  async ops(base, next, ctx) {
    const { ids, me } = ctx;
    const b = base.floorUse ?? {};
    const n = next.floorUse ?? {};
    const out = [];
    for (const block of Object.keys(b))
      if (!(block in n))
        out.push(
          remove("block_floor_use", { block_id: await ctx.blockId(block) }),
        );
    for (const [block, u] of entries(n))
      if (!same(b[block], u))
        out.push(
          upsert(
            "block_floor_use",
            {
              block_id: await ctx.blockId(block),
              org_id: me.org_id,
              location_id: me.location_id,
              warmup_zones: u.warmup ?? [],
              close_zones: u.close ?? [],
              station_zones: u.stations ?? {},
              updated_by: ids.staffIdByName(u.by) ?? me.staff_id,
              updated_at: u.at ?? new Date().toISOString(),
            },
            "block_id",
          ),
        );
    return out;
  },
};

/* ---------- Shared documents for everything else ---------- */

// State without tables wired yet travels as one document per key. Paths
// with a dot reach into an object ("gym.crew").
export const DOC_KEYS_CLAIMED = new Set([
  "version",
  ...skills.keys,
  "club",
  "floor",
  "layout",
  "floorUse",
]);
export const NESTED_DOCS = ["gym.crew"];

export const getPath = (state, path) =>
  path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), state);
export function setPath(state, path, value) {
  const [head, ...rest] = path.split(".");
  if (!rest.length) {
    if (value === undefined) {
      const { [head]: _, ...others } = state;
      return others;
    }
    return { ...state, [head]: value };
  }
  return {
    ...state,
    [head]: setPath(state[head] ?? {}, rest.join("."), value),
  };
}

// Which documents a state carries: every top-level key nobody else claims,
// plus the nested ones.
export const docKeys = (state) => [
  ...Object.keys(state).filter((k) => !DOC_KEYS_CLAIMED.has(k) && k !== "gym"),
  ...NESTED_DOCS,
];

// `defaults` gives the app's seed for a document nobody has saved yet, so a
// first save merges against what the person actually started from.
export const docsOps = (base, next, defaults = {}) =>
  [...new Set([...docKeys(base), ...docKeys(next)])]
    .filter((k) => !same(getPath(base, k), getPath(next, k)))
    .filter((k) => getPath(next, k) !== undefined)
    .map((key) => ({
      t: "doc",
      key,
      doc: getPath(next, key),
      base: getPath(base, key) ?? defaults[key]?.(base),
    }));

export const adapters = [skills, gym, club, floor, layout, floorUse];
export const adapterForTable = {
  skill_awards: ["skills"],
  skill_practice: ["skills"],
  bonus_awards: ["skills"],
  athlete_goals: ["skills"],
  tier_rewards: ["skills"],
  club_events: ["club"],
  prize_claims: ["club"],
  club_profiles: ["club"],
  desk_visits: ["floor"],
  moments: ["floor"],
  staff_notes: ["floor"],
  station_outages: ["floor"],
  photos: ["photos"],
  athletes: ["floor", "gym", "roster"],
  memberships: ["gym"],
  membership_syncs: ["gym"],
  session_checkins: ["gym"],
  block_plans: ["gym"],
  class_session_runs: ["gym"],
  run_handoffs: ["gym"],
  zones: ["layout"],
  block_floor_use: ["floorUse"],
  // New sessions change how check-ins and stars name their class.
  class_sessions: ["sessions", "gym", "club"],
  location_state_docs: ["docs"],
};
