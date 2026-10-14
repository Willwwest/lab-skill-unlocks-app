// Eight weeks of synthetic gym history so the insights have something to show
// before real data arrives. Kept apart from live records (state.gym.history)
// and deterministic, so the same demo always draws the same charts.
import { catalog, people } from "./domain.js";
import { dayKey } from "./club.js";
import { gymLocalIso } from "./gym-time.js";
import { kidInfo } from "./roster.js";

const DAYS = 56;
// Mirrors club.js `schedule`: [index, kind, start, weekdays (0 = Sunday)].
const blocks = [
  [4, "class", "10:00", [1, 3, 5]],
  [2, "open", "12:00", [1, 2, 3, 4, 5, 6]],
  [0, "class", "15:30", [1, 2, 3, 4, 5]],
  [1, "class", "16:45", [1, 2, 3, 4, 5]],
  [3, "open", "18:00", [1, 2, 3, 4, 5, 6]],
];
const crews = {
  0: { head: "Coach Jordan", floor: ["Coach Priya", "Coach Riley"] },
  1: { head: "Coach Sam", floor: ["Coach Morgan", "Coach Priya", "Coach Dev"] },
  2: { head: null, floor: ["Coach Priya", "Coach Riley"] },
  3: { head: null, floor: ["Coach Morgan", "Coach Dev"] },
  4: {
    head: "Coach Jordan",
    floor: ["Coach Sam", "Coach Priya", "Coach Riley"],
  },
};
const stationCats = [
  "Grip & traverse",
  "Warped wall",
  "Movement",
  "Basketball",
  "Course skills",
];

// Small seeded random generator (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// New kids who stop coming, for the at-risk list: last visit this many days ago.
const lapses = { rhys: 9, hana: 9, gabe: 17, june: 8 };

export function seedHistory(members, now = new Date()) {
  const r = rng(20261012);
  const visits = [];
  const runs = [];
  const unlocks = [];
  const bonuses = [];
  const today = Date.parse(gymLocalIso(dayKey(now)));
  for (let ago = DAYS; ago >= 1; ago--) {
    const date = dayKey(new Date(today - ago * 86400000));
    const weekday = new Date(gymLocalIso(date)).getUTCDay();
    // Front-desk waits and late attendance improve over the six weeks.
    const progress = (DAYS - ago) / DAYS;
    for (const [index, kind, start, days] of blocks) {
      if (!days.includes(weekday)) continue;
      const session = `${date}:${index}`;
      const startAt = Date.parse(gymLocalIso(date, start));
      const crew = crews[index];
      const coaches = [crew.head, ...crew.floor].filter(Boolean);
      const attendees = [];
      people.forEach((p, i) => {
        const joined = members[p.id]?.joined;
        if (!joined || date <= joined) return;
        if (lapses[p.id] && ago < lapses[p.id]) return;
        const enrolled =
          kind === "class" && kidInfo[p.id]?.classes.includes(String(index));
        if (kind === "class" && !enrolled) return;
        const keen = 0.4 + ((i * 37) % 45) / 100;
        const chance = kind === "class" ? keen : keen * 0.32;
        if (r() < chance) attendees.push(p.id);
      });
      attendees.forEach((childId, n) => {
        const at = startAt + (kind === "class" ? n * 0.4 : r() * 150) * 60000;
        const wait = Math.max(1, (15 - 9 * progress) * (0.5 + r()));
        const by =
          kind === "class"
            ? crew.head
            : crew.floor[Math.floor(r() * crew.floor.length)];
        visits.push({
          childId,
          session,
          kind,
          at: new Date(at).toISOString(),
          deskAt: new Date(at - wait * 60000).toISOString(),
          by,
        });
        if (r() < (kind === "class" ? 0.28 : 0.18)) {
          const cat = stationCats[Math.floor(r() * stationCats.length)];
          const pool = catalog.filter((s) => s.category === cat);
          const skill = pool[Math.floor(r() * pool.length)];
          unlocks.push({
            childId,
            skillId: skill.id,
            category: cat,
            coach: coaches[Math.floor(r() * coaches.length)],
            at: new Date(at + 20 * 60000).toISOString(),
          });
        }
      });
      if (kind === "class" && attendees.length) {
        const late = Math.max(-1, (11 - 8 * progress) * (0.3 + r() * 1.2));
        runs.push({
          session,
          lead: crew.head,
          attendanceDoneAt: new Date(startAt + late * 60000).toISOString(),
          kids: attendees.length,
        });
        for (const coach of coaches)
          for (let k = 0; k < 3 && k < attendees.length; k++)
            bonuses.push({
              childId: attendees[Math.floor(r() * attendees.length)],
              coach,
              session,
              at: new Date(startAt + 58 * 60000).toISOString(),
            });
      }
    }
  }
  return {
    generated: new Date(now).toISOString(),
    days: DAYS,
    visits,
    runs,
    unlocks,
    bonuses,
  };
}
