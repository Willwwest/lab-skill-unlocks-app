import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  tiers,
  catalog,
  bonuses,
  people,
  key,
  earnedIds,
  tierProgress,
  currentTier,
  isEligible,
  seed,
  validateState,
  load,
  apply,
  formatResult,
} from "./domain.js";
import { num, plural, date, dayLabel } from "./format.js";

test("counted achievements reject fractional results", () => {
  assert.throws(
    () =>
      apply(seed(), {
        type: "award",
        childId: "theo",
        skillId: "S09",
        value: 10.5,
        coach: "Demo",
        confirmed: true,
      }),
    /whole-number/,
  );
});

test("impossible repeat calendar dates are rejected", () => {
  assert.throws(
    () =>
      apply(seed(), {
        type: "award",
        childId: "maya",
        skillId: "X05",
        secondDate: "2024-02-30",
        coach: "Demo",
        confirmed: true,
      }),
    /valid calendar/,
  );
});

test("correcting a prerequisite suspends dependent progress and reward fulfillment", () => {
  const state = seed();
  const prerequisite = state.awards.find(
    (a) => a.childId === "maya" && a.skillId === "S03",
  );
  const next = apply(state, {
    type: "revoke",
    id: prerequisite.id,
    reason: "Wrong wall recorded",
  });
  assert.ok(!earnedIds(next, "maya").includes("M03"));
  assert.ok(
    next.rewards.find((r) => r.childId === "maya" && r.tier === 2).review,
  );
  assert.ok(earnedIds(next, "maya").includes("S08"));
});

test("personal next goals are limited to three and do not grant awards", () => {
  const state = seed();
  assert.throws(
    () => apply(state, { type: "goal", childId: "theo", skillId: "M01" }),
    /three goals/,
  );
  const fewer = apply(state, { type: "goal", childId: "theo", skillId: "S07" });
  const changed = apply(fewer, {
    type: "goal",
    childId: "theo",
    skillId: "M01",
  });
  assert.ok(changed.goals.theo.includes("M01"));
  assert.equal(earnedIds(changed, "theo").length, 7);
});

test("corrupted duplicate persistence falls back rather than counting twice", () => {
  const state = seed();
  state.awards.push({ ...state.awards[0], id: "duplicate" });
  assert.equal(validateState(state), false);
  assert.equal(
    earnedIds(load({ getItem: () => JSON.stringify(state) }), "theo").length,
    7,
  );
});

describe("catalog structure", () => {
  test("tier counts are 10/12/15/18 totaling 55", () => {
    const tier1 = catalog.filter((s) => s.tier === 1);
    const tier2 = catalog.filter((s) => s.tier === 2);
    const tier3 = catalog.filter((s) => s.tier === 3);
    const tier4 = catalog.filter((s) => s.tier === 4);
    assert.equal(tier1.length, 10);
    assert.equal(tier2.length, 12);
    assert.equal(tier3.length, 15);
    assert.equal(tier4.length, 18);
    assert.equal(catalog.length, 55);
  });
});

describe("seed state", () => {
  test("Theo missing S07, S09, S10 from tier 1", () => {
    const state = seed();
    const theoIds = earnedIds(state, "theo");
    assert.ok(!theoIds.includes("S07"));
    assert.ok(!theoIds.includes("S09"));
    assert.ok(!theoIds.includes("S10"));
    assert.ok(theoIds.includes("S01"));
  });
});

describe("award validation", () => {
  test("duplicate award throws", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "S01",
        coach: "Demo",
        confirmed: true,
        value: 2,
      });
    }, /already earned/);
  });

  test("under-target value rejected", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "S09",
        coach: "Demo",
        confirmed: true,
        value: 5,
      });
    }, /at least 10 dribbles/);
  });

  test("missing confirmation rejected", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "S07",
        coach: "Demo",
        confirmed: false,
      });
    }, /rubric confirmation/);
  });

  test("missing coach rejected", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "S07",
        coach: "",
        confirmed: true,
      });
    }, /Coach verification/);
  });

  test("prerequisites enforced", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "M09",
        coach: "Demo",
        confirmed: true,
      });
    }, /prerequisite/);
  });

  test("exact target value accepted", () => {
    const state = seed();
    const next = apply(state, {
      type: "award",
      childId: "theo",
      skillId: "S09",
      coach: "Demo",
      confirmed: true,
      value: 10,
    });
    assert.ok(earnedIds(next, "theo").includes("S09"));
  });

  test("above target value accepted", () => {
    const state = seed();
    const next = apply(state, {
      type: "award",
      childId: "theo",
      skillId: "S09",
      coach: "Demo",
      confirmed: true,
      value: 15,
    });
    assert.ok(earnedIds(next, "theo").includes("S09"));
  });
});

describe("X05 repeat skill validation", () => {
  test("X05 invalid earlier-date rejected - future date", () => {
    let state = seed();
    for (const s of catalog.filter((sk) => sk.tier <= 2)) {
      if (!earnedIds(state, "maya").includes(s.id)) {
        state = apply(state, {
          type: "award",
          childId: "maya",
          skillId: s.id,
          coach: "Demo",
          confirmed: true,
          value: s.target ?? undefined,
        });
      }
    }
    const futureDate = "2099-01-01";
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "maya",
        skillId: "X05",
        coach: "Demo",
        confirmed: true,
        secondDate: futureDate,
      });
    }, /earlier qualifying date/);
  });

  test("X05 invalid earlier-date rejected - same day", () => {
    let state = seed();
    for (const s of catalog.filter((sk) => sk.tier <= 2)) {
      if (!earnedIds(state, "maya").includes(s.id)) {
        state = apply(state, {
          type: "award",
          childId: "maya",
          skillId: s.id,
          coach: "Demo",
          confirmed: true,
          value: s.target ?? undefined,
        });
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "maya",
        skillId: "X05",
        coach: "Demo",
        confirmed: true,
        secondDate: today,
      });
    }, /earlier qualifying date/);
  });

  test("X05 invalid date format rejected", () => {
    let state = seed();
    for (const s of catalog.filter((sk) => sk.tier <= 2)) {
      if (!earnedIds(state, "maya").includes(s.id)) {
        state = apply(state, {
          type: "award",
          childId: "maya",
          skillId: s.id,
          coach: "Demo",
          confirmed: true,
          value: s.target ?? undefined,
        });
      }
    }
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "maya",
        skillId: "X05",
        coach: "Demo",
        confirmed: true,
        secondDate: "01-01-2020",
      });
    }, /earlier qualifying date/);
  });
});

describe("bonus does not change tier", () => {
  test("awarding bonus does not affect currentTier", () => {
    const state = seed();
    const tierBefore = currentTier(state, "theo");
    const next = apply(state, {
      type: "bonus",
      childId: "theo",
      bonusId: "B01",
    });
    const tierAfter = currentTier(next, "theo");
    assert.equal(tierBefore, tierAfter);
  });
});

describe("tier completion and shirt reward", () => {
  test("final Tier1 completion yields exactly one shirt", () => {
    let state = seed();
    const missing = ["S07", "S09", "S10"];
    for (const sid of missing) {
      const skill = catalog.find((s) => s.id === sid);
      state = apply(state, {
        type: "award",
        childId: "theo",
        skillId: sid,
        coach: "Demo",
        confirmed: true,
        value: skill.target ?? undefined,
      });
    }
    const theoShirts = state.rewards.filter(
      (r) => r.childId === "theo" && r.tier === 1,
    );
    assert.equal(theoShirts.length, 1);
    assert.equal(theoShirts[0].status, "Choose size");
  });
});

describe("reward fulfillment", () => {
  test("invalid size rejected", () => {
    let state = seed();
    const missing = ["S07", "S09", "S10"];
    for (const sid of missing) {
      const skill = catalog.find((s) => s.id === sid);
      state = apply(state, {
        type: "award",
        childId: "theo",
        skillId: sid,
        coach: "Demo",
        confirmed: true,
        value: skill.target ?? undefined,
      });
    }
    const reward = state.rewards.find(
      (r) => r.childId === "theo" && r.tier === 1,
    );
    assert.throws(() => {
      apply(state, {
        type: "reward",
        id: reward.id,
        status: "Reserved",
        size: "Invalid Size",
      });
    }, /shirt size/);
  });

  test("invalid transition rejected", () => {
    let state = seed();
    const missing = ["S07", "S09", "S10"];
    for (const sid of missing) {
      const skill = catalog.find((s) => s.id === sid);
      state = apply(state, {
        type: "award",
        childId: "theo",
        skillId: sid,
        coach: "Demo",
        confirmed: true,
        value: skill.target ?? undefined,
      });
    }
    const reward = state.rewards.find(
      (r) => r.childId === "theo" && r.tier === 1,
    );
    assert.throws(() => {
      apply(state, { type: "reward", id: reward.id, status: "Ready" });
    }, /previous fulfillment step/);
  });

  test("valid fulfillment flow", () => {
    let state = seed();
    const missing = ["S07", "S09", "S10"];
    for (const sid of missing) {
      const skill = catalog.find((s) => s.id === sid);
      state = apply(state, {
        type: "award",
        childId: "theo",
        skillId: sid,
        coach: "Demo",
        confirmed: true,
        value: skill.target ?? undefined,
      });
    }
    const reward = state.rewards.find(
      (r) => r.childId === "theo" && r.tier === 1,
    );
    state = apply(state, {
      type: "reward",
      id: reward.id,
      status: "Reserved",
      size: "Youth M",
    });
    state = apply(state, { type: "reward", id: reward.id, status: "Ready" });
    state = apply(state, {
      type: "reward",
      id: reward.id,
      status: "Collected",
    });
    const updated = state.rewards.find((r) => r.id === reward.id);
    assert.equal(updated.status, "Collected");
    assert.equal(updated.size, "Youth M");
  });
});

describe("persistence", () => {
  test("valid state loads correctly", () => {
    const original = seed();
    const storage = {
      getItem: () => JSON.stringify(original),
    };
    const loaded = load(storage);
    assert.equal(loaded.version, 1);
    assert.ok(Array.isArray(loaded.awards));
  });

  test("malformed JSON falls back to seed", () => {
    const storage = {
      getItem: () => "not valid json {",
    };
    const loaded = load(storage);
    assert.equal(loaded.version, 1);
    assert.ok(Array.isArray(loaded.awards));
  });

  test("invalid state structure falls back to seed", () => {
    const storage = {
      getItem: () => JSON.stringify({ version: 2, awards: [] }),
    };
    const loaded = load(storage);
    assert.equal(loaded.version, 1);
  });

  test("null storage value falls back to seed", () => {
    const storage = {
      getItem: () => null,
    };
    const loaded = load(storage);
    assert.equal(loaded.version, 1);
  });
});

describe("correction marks shirt review", () => {
  test("revoking award marks shirt for review", () => {
    let state = seed();
    const missing = ["S07", "S09", "S10"];
    for (const sid of missing) {
      const skill = catalog.find((s) => s.id === sid);
      state = apply(state, {
        type: "award",
        childId: "theo",
        skillId: sid,
        coach: "Demo",
        confirmed: true,
        value: skill.target ?? undefined,
      });
    }
    const theoS07Award = state.awards.find(
      (a) => a.childId === "theo" && a.skillId === "S07" && !a.revoked,
    );
    state = apply(state, {
      type: "revoke",
      id: theoS07Award.id,
      reason: "Scoring error",
    });
    const reward = state.rewards.find(
      (r) => r.childId === "theo" && r.tier === 1,
    );
    assert.equal(reward.review, true);
  });

  test("revoke without reason throws", () => {
    let state = seed();
    const award = state.awards.find((a) => a.childId === "theo" && !a.revoked);
    assert.throws(() => {
      apply(state, { type: "revoke", id: award.id, reason: "" });
    }, /correction reason/);
  });
});

describe("per-child isolation", () => {
  test("awards for one child do not affect another", () => {
    let state = seed();
    const theoCountBefore = earnedIds(state, "theo").length;
    const leoCountBefore = earnedIds(state, "leo").length;
    state = apply(state, {
      type: "award",
      childId: "leo",
      skillId: "S01",
      coach: "Demo",
      confirmed: true,
      value: 2,
    });
    assert.equal(earnedIds(state, "theo").length, theoCountBefore);
    assert.equal(earnedIds(state, "leo").length, leoCountBefore + 1);
  });

  test("tier progress isolated per child", () => {
    const state = seed();
    const theoProgress = tierProgress(state, "theo", 1);
    const mayaProgress = tierProgress(state, "maya", 1);
    const leoProgress = tierProgress(state, "leo", 1);
    assert.equal(theoProgress.count, 7);
    assert.equal(mayaProgress.count, 10);
    assert.equal(leoProgress.count, 0);
  });
});

describe("boundary tests", () => {
  test("empty value string for target skill rejected", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "S09",
        coach: "Demo",
        confirmed: true,
        value: "",
      });
    }, /at least/);
  });

  test("non-numeric value for target skill rejected", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "S09",
        coach: "Demo",
        confirmed: true,
        value: "ten",
      });
    }, /at least/);
  });

  test("whitespace-only coach rejected", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "S07",
        coach: "   ",
        confirmed: true,
      });
    }, /Coach verification/);
  });

  test("invalid child id rejected", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "unknown",
        skillId: "S01",
        coach: "Demo",
        confirmed: true,
      });
    }, /valid athlete/);
  });

  test("invalid skill id rejected", () => {
    const state = seed();
    assert.throws(() => {
      apply(state, {
        type: "award",
        childId: "theo",
        skillId: "INVALID",
        coach: "Demo",
        confirmed: true,
      });
    }, /valid athlete/);
  });

  test("skill without target accepts undefined value", () => {
    const state = seed();
    const next = apply(state, {
      type: "award",
      childId: "theo",
      skillId: "S07",
      coach: "Demo",
      confirmed: true,
    });
    assert.ok(earnedIds(next, "theo").includes("S07"));
  });

  test("reward on review status cannot be fulfilled", () => {
    let state = seed();
    const missing = ["S07", "S09", "S10"];
    for (const sid of missing) {
      const skill = catalog.find((s) => s.id === sid);
      state = apply(state, {
        type: "award",
        childId: "theo",
        skillId: sid,
        coach: "Demo",
        confirmed: true,
        value: skill.target ?? undefined,
      });
    }
    const theoS07Award = state.awards.find(
      (a) => a.childId === "theo" && a.skillId === "S07" && !a.revoked,
    );
    state = apply(state, {
      type: "revoke",
      id: theoS07Award.id,
      reason: "Error",
    });
    const reward = state.rewards.find(
      (r) => r.childId === "theo" && r.tier === 1,
    );
    assert.throws(() => {
      apply(state, {
        type: "reward",
        id: reward.id,
        status: "Reserved",
        size: "Youth M",
      });
    }, /not eligible/);
  });
});

describe("display formatting", () => {
  const skill = (id) => catalog.find((s) => s.id === id);
  test("counts pluralize and big numbers get separators", () => {
    assert.equal(plural(1, "try", "tries"), "1 try");
    assert.equal(plural(0, "try", "tries"), "0 tries");
    assert.equal(plural(1250, "star", "stars"), "1,250 stars");
    assert.equal(num(12500), "12,500");
  });

  test("dates read on the Phoenix calendar", () => {
    // 9 PM in Phoenix on Oct 9 is already Oct 10 in UTC.
    assert.equal(date("2026-10-10T04:00:00Z"), "Oct 9");
    assert.equal(dayLabel("2026-10-05"), "Oct 5");
  });

  test("results pluralize their unit and keep one decimal for seconds", () => {
    assert.equal(formatResult(skill("S08"), 1), "1 basket");
    assert.equal(formatResult(skill("S08"), 2), "2 baskets");
    assert.equal(formatResult(skill("S02"), 12.345), "12.3 seconds");
    assert.equal(formatResult(skill("S02"), 1), "1 second");
    assert.equal(formatResult(skill("S07"), "Demonstrated"), "Demonstrated");
  });

  test("results far above the target are rejected as entry mistakes", () => {
    const award = (value) =>
      apply(seed(), {
        type: "award",
        childId: "leo",
        skillId: "S08",
        value,
        coach: "Demo",
        confirmed: true,
      });
    assert.throws(() => award(11), /at most 10 baskets/);
    assert.equal(award(10).awards.at(-1).value, 10);
  });
});
