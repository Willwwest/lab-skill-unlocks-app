import raw from "./catalog.json" with { type: "json" };
import { plural } from "./format.js";
import { extraKids } from "./roster.js";

export const tiers = [
  {
    id: 1,
    name: "Spark",
    tag: "Find your spark.",
    count: 10,
    color: "#22BCED",
    word: "START SOMETHING GREAT",
  },
  {
    id: 2,
    name: "Momentum",
    tag: "Keep building.",
    count: 12,
    color: "#C2E6DB",
    word: "PROGRESS IN MOTION",
  },
  {
    id: 3,
    name: "Ascent",
    tag: "Rise to the challenge.",
    count: 15,
    color: "#BAA8FA",
    word: "REACH A LITTLE HIGHER",
  },
  {
    id: 4,
    name: "Apex",
    tag: "Make it your own.",
    count: 18,
    color: "#FFD174",
    word: "BUILT THROUGH PRACTICE",
  },
];
const grip = [
  "S01",
  "S02",
  "M01",
  "M02",
  "M05",
  "M07",
  "A01",
  "A02",
  "A03",
  "A06",
  "A07",
  "X01",
  "X02",
  "X03",
  "X06",
  "X07",
  "X08",
];
const wall = ["S03", "M03", "M04", "A04", "A05", "X04", "X05"];
const basketball = [
  "S08",
  "S09",
  "M10",
  "M11",
  "A12",
  "A13",
  "X13",
  "X14",
  "X15",
];
const movement = [
  "S04",
  "S05",
  "S06",
  "S07",
  "M06",
  "M08",
  "M09",
  "A08",
  "A09",
  "A10",
  "A11",
  "X09",
  "X10",
  "X11",
  "X12",
];
const numbers = {
  S01: [2, "rungs"],
  S02: [10, "seconds"],
  S08: [1, "basket"],
  S09: [10, "dribbles"],
  M01: [4, "rungs"],
  M02: [20, "seconds"],
  M05: [2, "transfers"],
  M10: [2, "consecutive baskets"],
  A01: [6, "rungs"],
  A02: [10, "rungs"],
  A03: [30, "seconds"],
  A06: [4, "transfers"],
  A12: [3, "consecutive baskets"],
  A13: [5, "passes"],
  X01: [12, "rungs"],
  X02: [45, "seconds"],
  X03: [60, "seconds"],
  X13: [3, "consecutive baskets"],
  X14: [5, "consecutive baskets"],
  X15: [3, "repetitions"],
};
// [one, many] for each result unit; `unit` keeps the form its target reads in.
const unitForms = {
  rungs: ["rung", "rungs"],
  seconds: ["second", "seconds"],
  basket: ["basket", "baskets"],
  dribbles: ["dribble", "dribbles"],
  transfers: ["transfer", "transfers"],
  "consecutive baskets": ["consecutive basket", "consecutive baskets"],
  passes: ["pass", "passes"],
  repetitions: ["repetition", "repetitions"],
};
const prereqs = {
  M01: ["S01"],
  M02: ["S02"],
  M03: ["S03"],
  M05: ["S02"],
  M09: ["S07"],
  A01: ["M01"],
  A02: ["A01"],
  A03: ["M02"],
  A04: ["M04"],
  A06: ["M05"],
  A07: ["S02"],
  A09: ["M08"],
  A11: ["S06", "S07", "M09"],
  A12: ["M10"],
  X01: ["A02"],
  X02: ["A03"],
  X03: ["X02"],
  X04: ["A05"],
  X05: ["M03"],
  X06: ["A06"],
  X07: ["A07"],
  X10: ["A09"],
  X11: ["A10"],
  X12: ["A11"],
  X13: ["A12"],
  X14: ["A12"],
  X15: ["M11"],
  M12: ["S10"],
  A14: ["M12"],
  X16: ["A14"],
  X17: ["X16"],
};
export const categories = [
  "All skills",
  "Grip & traverse",
  "Warped wall",
  "Movement",
  "Basketball",
  "Course skills",
];
export const catalog = raw.map((s) => {
  const category = grip.includes(s.id)
    ? "Grip & traverse"
    : wall.includes(s.id)
      ? "Warped wall"
      : basketball.includes(s.id)
        ? "Basketball"
        : movement.includes(s.id)
          ? "Movement"
          : "Course skills";
  let setup =
    category === "Warped wall"
      ? `Wall ${["S03", "M03", "X05"].includes(s.id) ? "A" : ["M04", "A04"].includes(s.id) ? "B" : "C"} · sample configuration`
      : category === "Basketball"
        ? ["A12", "X14"].includes(s.id)
          ? "Court BB-01 · free-throw line · sample hoop/ball"
          : s.id === "X13"
            ? "Court BB-01 · marked beyond-line spot · sample hoop/ball"
            : "Court BB-01 · beginner marker · sample hoop/ball"
        : category === "Grip & traverse"
          ? "Rig MB-01 · sample 12-rung route / grip station"
          : "Zone PK-01 · sample coach-selected route";
  return {
    ...s,
    category,
    target: numbers[s.id]?.[0] ?? null,
    unit: numbers[s.id]?.[1] ?? "completed demonstration",
    units: unitForms[numbers[s.id]?.[1]] ?? null,
    setup,
    prerequisites: prereqs[s.id] ?? [],
    version: 1,
    special: s.id === "X05" ? "repeat" : s.id === "X18" ? "project" : null,
  };
});
export const bonuses = [
  {
    id: "B01",
    title: "Meet the team",
    criteria: "Recognize the coaches you meet in your classes.",
  },
  {
    id: "B02",
    title: "Try something new",
    criteria: "Try a second class discipline with coach approval.",
  },
  {
    id: "B03",
    title: "Team player",
    criteria: "Complete a cooperative challenge with a partner.",
  },
];
export const people = [
  {
    id: "theo",
    name: "Theo Parker",
    first: "Theo",
    age: 8,
    initials: "TP",
    color: "#C2E6DB",
    goal: "The top of Wall A",
  },
  {
    id: "maya",
    name: "Maya Brooks",
    first: "Maya",
    age: 10,
    initials: "MB",
    color: "#DCD3FC",
    goal: "Three at the line",
  },
  {
    id: "leo",
    name: "Leo Rivera",
    first: "Leo",
    age: 6,
    initials: "LR",
    color: "#FBE4B7",
    goal: "My first crossing",
  },
  ...extraKids,
];
export const key = "lab-skill-unlocks-v1";
// "1 basket", "2 baskets", "12.5 seconds": at most one decimal, for seconds.
export function formatResult(skill, value) {
  if (!skill?.units || typeof value !== "number") return String(value);
  return plural(value, ...skill.units, skill.unit === "seconds" ? 1 : 0);
}
// Results above this are treated as entry mistakes.
export const resultCap = (skill) => skill.target * 10;
export function earnedIds(state, childId) {
  const candidates = state.awards.filter(
    (a) => a.childId === childId && !a.revoked,
  );
  const valid = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of candidates) {
      const skill = catalog.find((s) => s.id === a.skillId);
      if (
        skill &&
        !valid.has(a.skillId) &&
        skill.prerequisites.every((p) => valid.has(p))
      ) {
        valid.add(a.skillId);
        changed = true;
      }
    }
  }
  return [...valid];
}
export function tierProgress(state, childId, tier) {
  const ids = new Set(earnedIds(state, childId));
  const list = catalog.filter((s) => s.tier === tier);
  const count = list.filter((s) => ids.has(s.id)).length;
  const previous = catalog
    .filter((s) => s.tier < tier)
    .every((s) => ids.has(s.id));
  return {
    count,
    total: list.length,
    complete: count === list.length && previous,
  };
}
export function currentTier(state, childId) {
  return (
    tiers.find((t) => !tierProgress(state, childId, t.id).complete)?.id ?? 4
  );
}
export function isEligible(state, childId, skill) {
  const ids = new Set(earnedIds(state, childId));
  return skill.prerequisites.every((p) => ids.has(p));
}
function reconcile(state) {
  const rewards = [...state.rewards];
  for (const p of people)
    for (const t of tiers) {
      const idx = rewards.findIndex(
        (r) => r.childId === p.id && r.tier === t.id,
      );
      const complete = tierProgress(state, p.id, t.id).complete;
      if (complete && idx < 0)
        rewards.push({
          id: `${p.id}-${t.id}`,
          childId: p.id,
          tier: t.id,
          status: "Choose size",
          size: "",
          earnedAt: new Date().toISOString(),
          review: false,
        });
      else if (idx >= 0) rewards[idx] = { ...rewards[idx], review: !complete };
    }
  return { ...state, rewards };
}
export function seed() {
  const now = Date.now();
  const awards = [];
  const first = ["S01", "S02", "S03", "S04", "S05", "S06", "S08"];
  for (const child of people) {
    const list =
      child.id === "theo"
        ? catalog.filter((s) => first.includes(s.id))
        : child.id === "maya"
          ? catalog.filter((s) => s.tier <= 2)
          : seededSkills(child.id);
    list.forEach((s, i) =>
      awards.push({
        id: `seed-${child.id}-${s.id}`,
        childId: child.id,
        skillId: s.id,
        coach: "Coach Jordan",
        value: s.target ?? "Demonstrated",
        setup: s.setup,
        version: s.version,
        at: new Date(now - (list.length - i) * 86400000).toISOString(),
        note: "Synthetic sample assessment",
        revoked: false,
      }),
    );
  }
  return reconcile({
    version: 1,
    awards,
    practice: [],
    bonusAwards: [],
    rewards: [],
    audit: [],
    goals: {
      theo: ["S07", "S09", "S10"],
      maya: ["A01", "A03", "A12"],
      leo: ["S01", "S08", "S06"],
      ...Object.fromEntries(
        extraKids.map((k) => [k.id, seededGoals(k.id, awards)]),
      ),
    },
  });
}
// Varied synthetic progress for the extra roster, so the coach center has
// kids at different points. Deterministic by roster position.
function seededSkills(childId) {
  const i = extraKids.findIndex((k) => k.id === childId);
  if (i < 0) return [];
  const tier1 = catalog.filter((s) => s.tier === 1);
  const count = [
    3, 8, 5, 1, 6, 10, 2, 4, 10, 6, 9, 0, 7, 10, 4, 10, 5, 10, 0, 3, 10, 2, 6,
    0, 3, 4, 9, 10, 10, 5, 7, 10, 3, 8, 1,
  ][i];
  const list = tier1.slice(0, count);
  if (count < 10) return list;
  const done = new Set(list.map((s) => s.id));
  const tier2 = catalog.filter(
    (s) => s.tier === 2 && s.prerequisites.every((p) => done.has(p)),
  );
  return [...list, ...tier2.slice(0, (i * 5) % 9)];
}
function seededGoals(childId, awards) {
  const done = new Set(
    awards.filter((a) => a.childId === childId).map((a) => a.skillId),
  );
  return catalog
    .filter((s) => !done.has(s.id) && s.prerequisites.every((p) => done.has(p)))
    .slice(0, 2)
    .map((s) => s.id);
}
export function validateState(value) {
  if (
    !value ||
    value.version !== 1 ||
    !["awards", "practice", "bonusAwards", "rewards", "audit"].every((k) =>
      Array.isArray(value[k]),
    )
  )
    return false;
  const validChild = (id) => people.some((p) => p.id === id);
  const active = value.awards.filter((a) => !a.revoked);
  return (
    value.awards.every((a) => {
      const s = catalog.find((s) => s.id === a.skillId);
      return (
        validChild(a.childId) &&
        s &&
        typeof a.id === "string" &&
        typeof a.coach === "string" &&
        typeof a.setup === "string" &&
        Number.isFinite(Date.parse(a.at)) &&
        (!s.target ||
          (Number.isFinite(a.value) &&
            a.value >= s.target &&
            (s.unit === "seconds" || Number.isInteger(a.value))))
      );
    }) &&
    new Set(active.map((a) => `${a.childId}-${a.skillId}`)).size ===
      active.length &&
    value.rewards.every(
      (r) =>
        validChild(r.childId) &&
        tiers.some((t) => t.id === r.tier) &&
        typeof r.id === "string" &&
        ["Choose size", "Reserved", "Ready", "Collected"].includes(r.status),
    ) &&
    new Set(value.rewards.map((r) => `${r.childId}-${r.tier}`)).size ===
      value.rewards.length &&
    value.practice.every(
      (p) => validChild(p.childId) && catalog.some((s) => s.id === p.skillId),
    ) &&
    value.bonusAwards.every(
      (a) => validChild(a.childId) && bonuses.some((b) => b.id === a.bonusId),
    )
  );
}
export function load(storage) {
  try {
    return loadValue(JSON.parse(storage.getItem(key)));
  } catch {
    return seed();
  }
}
export function loadValue(x) {
  return validateState(x)
    ? reconcile({
        ...x,
        goals: x.goals && typeof x.goals === "object" ? x.goals : {},
      })
    : seed();
}
export function apply(state, action) {
  if (action.type === "reset") return seed();
  if (action.type === "award") {
    const {
      childId,
      skillId,
      coach,
      value,
      confirmed,
      note,
      secondDate,
      project,
    } = action;
    const skill = catalog.find((s) => s.id === skillId);
    if (!skill || !people.some((p) => p.id === childId))
      throw Error("Choose a valid athlete and achievement.");
    if (
      state.awards.some(
        (a) => a.childId === childId && a.skillId === skillId && !a.revoked,
      )
    )
      throw Error("This achievement is already earned.");
    if (!isEligible(state, childId, skill))
      throw Error("Complete the prerequisite skills first.");
    if (!coach?.trim() || !confirmed)
      throw Error(
        "Coach verification and the full rubric confirmation are required.",
      );
    if (
      skill.target &&
      (String(value).trim() === "" ||
        !Number.isFinite(Number(value)) ||
        Number(value) < skill.target)
    )
      throw Error(`Record at least ${formatResult(skill, skill.target)}.`);
    if (skill.target && Number(value) > resultCap(skill))
      throw Error(
        `Record at most ${formatResult(skill, resultCap(skill))}. Check the measured result.`,
      );
    if (
      skill.target &&
      skill.unit !== "seconds" &&
      !Number.isInteger(Number(value))
    )
      throw Error("Counted skills require a whole-number result.");
    if (
      skill.special === "repeat" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(secondDate ?? "") ||
        secondDate >= new Date().toISOString().slice(0, 10))
    )
      throw Error(
        "Record an earlier qualifying date for the two-date demonstration.",
      );
    if (
      skill.special === "repeat" &&
      (!Number.isFinite(Date.parse(secondDate)) ||
        new Date(`${secondDate}T00:00:00Z`).toISOString().slice(0, 10) !==
          secondDate)
    )
      throw Error(
        "Record a valid calendar date for the earlier demonstration.",
      );
    if (
      skill.special === "project" &&
      (!project?.trim() || project.trim().length < 20)
    )
      throw Error(
        "Add the approved objective project rubric (at least 20 characters).",
      );
    const at = new Date().toISOString();
    const award = {
      id: crypto.randomUUID(),
      childId,
      skillId,
      coach: coach.trim(),
      value: skill.target ? Number(value) : "Demonstrated",
      setup: skill.setup,
      version: skill.version,
      at,
      note: note?.trim() ?? "",
      secondDate,
      project,
      revoked: false,
    };
    return reconcile({
      ...state,
      awards: [...state.awards, award],
      audit: [
        ...state.audit,
        {
          at,
          action: "Verified achievement",
          childId,
          skillId,
          by: coach.trim(),
        },
      ],
    });
  }
  if (action.type === "practice") {
    if (
      !people.some((p) => p.id === action.childId) ||
      !catalog.some((s) => s.id === action.skillId)
    )
      throw Error("Unknown practice item.");
    return {
      ...state,
      practice: [
        ...state.practice,
        {
          id: crypto.randomUUID(),
          childId: action.childId,
          skillId: action.skillId,
          at: new Date().toISOString(),
        },
      ],
    };
  }
  if (action.type === "bonus") {
    if (
      !people.some((p) => p.id === action.childId) ||
      !bonuses.some((b) => b.id === action.bonusId)
    )
      throw Error("Unknown bonus.");
    if (
      state.bonusAwards.some(
        (a) => a.childId === action.childId && a.bonusId === action.bonusId,
      )
    )
      return state;
    return {
      ...state,
      bonusAwards: [
        ...state.bonusAwards,
        { ...action, at: new Date().toISOString() },
      ],
    };
  }
  if (action.type === "goal") {
    const skill = catalog.find((s) => s.id === action.skillId);
    if (!skill || !people.some((p) => p.id === action.childId))
      throw Error("Unknown goal.");
    const goals = state.goals?.[action.childId] ?? [];
    const exists = goals.includes(skill.id);
    if (
      !exists &&
      (earnedIds(state, action.childId).includes(skill.id) ||
        !isEligible(state, action.childId, skill))
    )
      throw Error("Choose an eligible skill you have not earned.");
    const active = goals.filter(
      (id) => !earnedIds(state, action.childId).includes(id),
    );
    if (!exists && active.length >= 3)
      throw Error("Choose up to three goals. Remove a goal first.");
    return {
      ...state,
      goals: {
        ...state.goals,
        [action.childId]: exists
          ? active.filter((id) => id !== skill.id)
          : [...active, skill.id],
      },
    };
  }
  if (action.type === "reward") {
    const r = state.rewards.find((r) => r.id === action.id);
    if (!r || r.review)
      throw Error("This reward is not eligible for fulfillment.");
    const sizes = [
      "Youth XS",
      "Youth S",
      "Youth M",
      "Youth L",
      "Youth XL",
      "Adult S",
      "Adult M",
      "Adult L",
    ];
    const transitions = {
      "Choose size": "Reserved",
      Reserved: "Ready",
      Ready: "Collected",
    };
    if (transitions[r.status] !== action.status)
      throw Error("Complete the previous fulfillment step first.");
    if (action.status === "Reserved" && !sizes.includes(action.size))
      throw Error("Choose a shirt size first.");
    return {
      ...state,
      rewards: state.rewards.map((x) =>
        x.id === r.id
          ? { ...x, status: action.status, size: action.size || x.size }
          : x,
      ),
      audit: [
        ...state.audit,
        {
          at: new Date().toISOString(),
          action: `Shirt ${action.status.toLowerCase()}`,
          childId: r.childId,
          by: "Demo staff",
        },
      ],
    };
  }
  if (action.type === "revoke") {
    const reason = action.reason?.trim().slice(0, 200);
    if (!reason) throw Error("A correction reason is required.");
    const award = state.awards.find((a) => a.id === action.id && !a.revoked);
    if (!award) throw Error("Choose an active award.");
    return reconcile({
      ...state,
      awards: state.awards.map((a) =>
        a.id === award.id ? { ...a, revoked: true, reason } : a,
      ),
      audit: [
        ...state.audit,
        {
          at: new Date().toISOString(),
          action: `Corrected award: ${reason}`,
          childId: award.childId,
          skillId: award.skillId,
          by: "Demo head coach",
        },
      ],
    });
  }
  return state;
}
