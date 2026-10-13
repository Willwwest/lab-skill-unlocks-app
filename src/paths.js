// Prerequisite chains: everything a skill builds on, and what it opens.
import { catalog, earnedIds, isEligible } from "./domain.js";

const byId = Object.fromEntries(catalog.map((s) => [s.id, s]));

// Longest prerequisite chain below a skill; 0 for a starting skill.
const depthCache = {};
export function depth(id) {
  if (depthCache[id] === undefined) {
    const pre = byId[id].prerequisites;
    depthCache[id] = pre.length ? 1 + Math.max(...pre.map(depth)) : 0;
  }
  return depthCache[id];
}

// Every skill a skill depends on, directly or through another skill,
// grouped into levels: level 0 has no prerequisites of its own.
export function ancestry(id) {
  const seen = new Set();
  const stack = [...byId[id].prerequisites];
  while (stack.length) {
    const next = stack.pop();
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...byId[next].prerequisites);
  }
  const levels = [];
  for (const sid of seen) (levels[depth(sid)] ??= []).push(byId[sid]);
  return levels
    .filter(Boolean)
    .map((level) =>
      level.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id)),
    );
}

// Skills that list this one as a direct prerequisite.
export const opens = (id) =>
  catalog.filter((s) => s.prerequisites.includes(id));

// The earliest unearned prerequisite a kid can try now, or null.
export function firstStep(state, childId, id) {
  const done = new Set(earnedIds(state, childId));
  return (
    ancestry(id)
      .flat()
      .find((s) => !done.has(s.id) && isEligible(state, childId, s)) ?? null
  );
}
