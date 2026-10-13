// Numbers for the insights dashboard and the coach's week. Combines live
// records with the demo history (state.gym.history) so both read the same.
import { catalog, people } from "./domain.js";
import { dayKey, sessions, clock } from "./club.js";
import { staff } from "./roster.js";
import { gymOf } from "./gym.js";
import { gymLocalIso } from "./gym-time.js";

const DAY = 86400000;
const noon = (date) => Date.parse(gymLocalIso(date));
const dateOf = (iso) => dayKey(iso);
export const ON_TIME_MINUTES = 5;

// Every visit, unlock, class run and bonus pick, history first.
export function activity(state) {
  const g = gymOf(state);
  const h = g.history ?? { visits: [], runs: [], unlocks: [], bonuses: [] };
  const live = {
    visits: g.checkins.map((c) => ({
      childId: c.childId,
      session: c.session,
      kind: c.kind,
      at: c.at,
      deskAt: c.deskAt,
      by: c.by,
    })),
    unlocks: state.awards
      .filter((a) => !a.revoked && !a.id.startsWith("seed-"))
      .map((a) => ({
        childId: a.childId,
        skillId: a.skillId,
        category: catalog.find((s) => s.id === a.skillId)?.category,
        coach: a.coach,
        at: a.at,
      })),
    runs: Object.values(g.runs)
      .filter((r) => r.attendanceDoneAt)
      .map((r) => ({
        session: r.session,
        lead: r.lead,
        attendanceDoneAt: r.attendanceDoneAt,
        kids: (r.groups ?? []).flat().length,
      })),
    bonuses: (state.club?.events ?? [])
      .filter((e) => e.kind === "bonus" && e.status === "approved")
      .map((e) => ({
        childId: e.childId,
        coach: e.coach,
        session: e.session,
        at: e.at,
      })),
  };
  return {
    visits: [...h.visits, ...live.visits],
    unlocks: [...h.unlocks, ...live.unlocks],
    runs: [...h.runs, ...live.runs],
    bonuses: [...h.bonuses, ...live.bonuses],
    demo: !!g.history,
  };
}

// Minutes after the block's start time that attendance was done.
export function lateness(run) {
  const date = run.session.slice(0, 10);
  const block = sessions(`${date}T12:00:00Z`).find((s) => s.id === run.session);
  if (!block) return null;
  return (
    (Date.parse(run.attendanceDoneAt) -
      Date.parse(gymLocalIso(date, block.start))) /
    60000
  );
}

export const median = (xs) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// The `days` dates ending yesterday-inclusive of today, oldest first.
export function dateRange(days, now = new Date()) {
  const end = noon(dayKey(now));
  return Array.from({ length: days }, (_, i) =>
    dayKey(new Date(end - (days - 1 - i) * DAY)),
  );
}

function window(a, dates) {
  const set = new Set(dates);
  return {
    visits: a.visits.filter((v) => set.has(dateOf(v.at))),
    unlocks: a.unlocks.filter((u) => set.has(dateOf(u.at))),
    runs: a.runs.filter((r) => set.has(r.session.slice(0, 10))),
    bonuses: a.bonuses.filter((b) => set.has(dateOf(b.at))),
  };
}
const waits = (visits) =>
  visits
    .filter((v) => v.deskAt)
    .map((v) => (Date.parse(v.at) - Date.parse(v.deskAt)) / 60000);
const onTime = (runs) => {
  const l = runs.map(lateness).filter((x) => x !== null);
  return l.length
    ? (100 * l.filter((x) => x <= ON_TIME_MINUTES).length) / l.length
    : null;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function insights(state, { days = 30, now = new Date() } = {}) {
  const a = activity(state);
  const dates = dateRange(days, now);
  const prevDates = dateRange(days * 2, now).slice(0, days);
  const cur = window(a, dates);
  const prev = window(a, prevDates);
  const byDay = (list, key = (x) => dateOf(x.at)) => {
    const m = Object.fromEntries(dates.map((d) => [d, []]));
    for (const x of list) m[key(x)]?.push(x);
    return dates.map((d) => m[d]);
  };
  const visitDays = byDay(cur.visits);
  const unlockDays = byDay(cur.unlocks);
  const runDays = byDay(cur.runs, (r) => r.session.slice(0, 10));

  const daily = dates.map((date, i) => ({
    date,
    class: visitDays[i].filter((v) => v.kind === "class").length,
    open: visitDays[i].filter((v) => v.kind === "open").length,
  }));
  const waitByDay = dates.map((date, i) => ({
    date,
    value: median(waits(visitDays[i])),
  }));

  // Average check-ins per session, by weekday and block.
  const blocks = sessions(now)
    .slice()
    .sort((x, y) => x.start.localeCompare(y.start));
  const heat = weekdays.map((label, w) =>
    blocks.map((b) => {
      const runsOn = dates.filter(
        (d) => new Date(gymLocalIso(d)).getUTCDay() === w + 1,
      );
      const count = cur.visits.filter(
        (v) =>
          v.session.endsWith(`:${b.index}`) &&
          runsOn.includes(v.session.slice(0, 10)),
      ).length;
      const held = new Set(
        cur.visits
          .filter(
            (v) =>
              v.session.endsWith(`:${b.index}`) &&
              runsOn.includes(v.session.slice(0, 10)),
          )
          .map((v) => v.session),
      ).size;
      return held ? count / held : null;
    }),
  );

  const coaches = staff
    .map((s) => ({
      id: s.id,
      name: s.name,
      skills: cur.unlocks.filter((u) => u.coach === s.name).length,
      checkins: cur.visits.filter((v) => v.by === s.name).length,
      bonuses: cur.bonuses.filter((b) => b.coach === s.name).length,
    }))
    .sort((x, y) => y.skills - x.skills);

  const tally = {};
  for (const u of cur.unlocks) tally[u.skillId] = (tally[u.skillId] ?? 0) + 1;
  const topSkills = Object.entries(tally)
    .map(([skillId, count]) => ({
      skillId,
      title: catalog.find((s) => s.id === skillId)?.title ?? skillId,
      count,
    }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 6);

  const today = noon(dayKey(now));
  const members = gymOf(state).members;
  const newKids = people
    .map((p) => {
      const joined = members[p.id]?.joined;
      if (!joined) return null;
      const joinedDays = Math.round((today - noon(joined)) / DAY);
      if (joinedDays > 60) return null;
      const seen = [
        ...new Set(
          a.visits.filter((v) => v.childId === p.id).map((v) => dateOf(v.at)),
        ),
      ].map((d) => Math.round((noon(d) - noon(joined)) / DAY));
      const last = seen.length ? Math.max(...seen) : null;
      const lastAgo = last === null ? null : joinedDays - last;
      return {
        id: p.id,
        name: p.name,
        joinedDays,
        seen,
        visits: seen.length,
        lastAgo,
        atRisk: joinedDays >= 7 && (lastAgo === null || lastAgo >= 7),
      };
    })
    .filter(Boolean)
    .sort(
      (x, y) =>
        Number(y.atRisk) - Number(x.atRisk) || y.joinedDays - x.joinedDays,
    );

  const kpi = (curV, prevV, spark) => ({ value: curV, prev: prevV, spark });
  return {
    dates,
    demo: a.demo,
    kpis: {
      checkins: kpi(
        cur.visits.length,
        prev.visits.length,
        daily.map((d) => d.class + d.open),
      ),
      wait: kpi(
        median(waits(cur.visits)),
        median(waits(prev.visits)),
        waitByDay.map((d) => d.value),
      ),
      onTime: kpi(
        onTime(cur.runs),
        onTime(prev.runs),
        runDays.map((r) => onTime(r)),
      ),
      skills: kpi(
        cur.unlocks.length,
        prev.unlocks.length,
        unlockDays.map((u) => u.length),
      ),
    },
    daily,
    waitByDay,
    heat: {
      rows: weekdays,
      cols: blocks.map((b) => b.name),
      short: blocks.map(
        (b) => `${clock(b.start)} ${b.kind === "class" ? "class" : "open"}`,
      ),
      cells: heat,
    },
    coaches,
    topSkills,
    newKids,
  };
}

// One coach's last seven days: unlocks per day, check-ins, and where they
// rank on the team for unlocks.
export function coachWeek(state, name, now = new Date()) {
  const a = activity(state);
  const dates = dateRange(7, now);
  const w = window(a, dates);
  const per = dates.map(
    (d) =>
      w.unlocks.filter((u) => u.coach === name && dateOf(u.at) === d).length,
  );
  const totals = staff
    .map((s) => ({
      name: s.name,
      n: w.unlocks.filter((u) => u.coach === s.name).length,
    }))
    .sort((x, y) => y.n - x.n);
  return {
    dates,
    unlocks: per,
    total: per.reduce((x, y) => x + y, 0),
    checkins: w.visits.filter((v) => v.by === name).length,
    rank: totals.findIndex((t) => t.name === name) + 1,
    of: totals.length,
  };
}

// Which of the last `days` days a kid came in.
export function kidVisits(state, childId, days = 42, now = new Date()) {
  const seen = new Set(
    activity(state)
      .visits.filter((v) => v.childId === childId)
      .map((v) => dateOf(v.at)),
  );
  return dateRange(days, now).map((d) => ({ date: d, here: seen.has(d) }));
}
