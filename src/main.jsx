import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Home,
  Lock,
  Search,
  Shirt,
  Star,
  Trophy,
  Medal,
  X,
} from "lucide-react";
import {
  catalog,
  tiers,
  categories,
  people,
  bonuses,
  load,
  key,
  apply,
  earnedIds,
  currentTier,
  tierProgress,
  isEligible,
} from "./domain";
import {
  Badge,
  Meter,
  Ring,
  ShirtImage,
  categoryMeta,
  skillNumber,
} from "./ui.jsx";
import "./styles.css";
import Club, { ClubSummary } from "./Club.jsx";
import { applyClub, validClub, emptyClub } from "./club.js";

// Nav icons only render in the phone bottom tab bar.
const navIcons = {
  "My journey": Home,
  Clubhouse: Star,
  Achievements: Trophy,
  "Coach desk": ClipboardCheck,
  Rewards: Shirt,
  Activity: Medal,
};
const shortNames = {
  "My journey": "Home",
  Clubhouse: "Club",
  Achievements: "Skills",
  "Coach desk": "Coach",
  Rewards: "Rewards",
  Activity: "Story",
};
const pageCopy = {
  Clubhouse: [
    "Clubhouse",
    "Class stars, station stamps and little moments worth celebrating.",
  ],
  Achievements: [
    "Achievements",
    "Every unlock is a real skill, verified by a coach.",
  ],
  "Coach desk": [
    "Coach desk",
    "Observe the skill. Celebrate the progress. Keep it specific.",
  ],
  Rewards: [
    "Rewards",
    "Four chapters. Four exclusive shirts. Earned, never given.",
  ],
};
const date = (at) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const statusLabel = {
  earned: "Unlocked",
  locked: "Learn first",
  practicing: "Practicing",
  goal: "My goal",
  open: "Up next",
};
function skillStatus(state, childId, skill, earned, eligible) {
  if (earned) return "earned";
  if (!eligible) return "locked";
  if (state.practice.some((p) => p.childId === childId && p.skillId === skill.id))
    return "practicing";
  if ((state.goals?.[childId] ?? []).includes(skill.id)) return "goal";
  return "open";
}
function StatusChip({ status, className = "" }) {
  return (
    <span className={`status status-${status} ${className}`.trim()}>
      {statusLabel[status]}
    </span>
  );
}

function App() {
  const [state, setState] = useState(() => {
    try {
      const saved = load(localStorage);
      return {
        ...saved,
        club: validClub(saved.club) ? saved.club : emptyClub(),
      };
    } catch {
      return load(null);
    }
  });
  const [saveError, setSaveError] = useState("");
  const [role, setRole] = useState("Athlete");
  const [childId, setChildId] = useState("theo");
  const [page, setPage] = useState(() =>
    new URLSearchParams(window.location.search).has("station") ||
    new URLSearchParams(window.location.search).has("class")
      ? "Clubhouse"
      : "My journey",
  );
  const [tier, setTier] = useState(() => currentTier(state, "theo"));
  const [filter, setFilter] = useState("All skills");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [correction, setCorrection] = useState(null);
  const [reason, setReason] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [toastError, setToastError] = useState(false);
  const child = people.find((p) => p.id === childId);
  const earned = new Set(earnedIds(state, childId));
  const current = currentTier(state, childId);
  const progress = tierProgress(state, childId, tier);
  const active = tiers[tier - 1];
  const total = earned.size;
  const chapter = tiers[current - 1];
  const chapterProgress = tierProgress(state, childId, current);
  const remaining = chapterProgress.total - chapterProgress.count;
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
      setSaveError("");
    } catch {
      setSaveError(
        "Browser storage is unavailable. Changes will not survive a reload.",
      );
    }
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => notify(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  function notify(message, isError = false) {
    setToast(message);
    setToastError(isError);
  }
  function commit(action, message) {
    try {
      const next = apply(state, action);
      setState(next);
      if (message) notify(message);
      return true;
    } catch (e) {
      notify(e.message, true);
      return false;
    }
  }
  function chooseChild(id) {
    setChildId(id);
    setTier(currentTier(state, id));
    setSelected(null);
  }
  const nav =
    role === "Coach"
      ? [
          "My journey",
          "Clubhouse",
          "Achievements",
          "Coach desk",
          "Rewards",
          "Activity",
        ]
      : ["My journey", "Clubhouse", "Achievements", "Rewards", "Activity"];
  function clubCommit(actions) {
    try {
      const next = (Array.isArray(actions) ? actions : [actions]).reduce(
        (current, action) => applyClub(current, action),
        state,
      );
      setState(next);
      return true;
    } catch (error) {
      notify(error.message, true);
      return false;
    }
  }
  const chosen = (state.goals?.[childId] ?? []).filter((id) => !earned.has(id));
  const featured = catalog
    .filter(
      (s) =>
        chosen.includes(s.id) &&
        !earned.has(s.id) &&
        isEligible(state, childId, s),
    )
    .concat(
      catalog.filter(
        (s) =>
          s.tier === current &&
          !chosen.includes(s.id) &&
          !earned.has(s.id) &&
          isEligible(state, childId, s),
      ),
    )
    .slice(0, 3);
  const visible = catalog.filter(
    (s) =>
      s.tier === tier &&
      (filter === "All skills" || s.category === filter) &&
      (!search ||
        `${s.title} ${s.criteria} ${s.category}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (status === "All" ||
        (status === "Earned" ? earned.has(s.id) : !earned.has(s.id))),
  );
  const recent = state.awards
    .filter((a) => a.childId === childId && !a.revoked && earned.has(a.skillId))
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));
  const ready = catalog.filter(
    (s) => !earned.has(s.id) && isEligible(state, childId, s),
  ).length;
  const chaptersDone = tiers.filter(
    (t) => tierProgress(state, childId, t.id).complete,
  ).length;
  const navigate = (p) => {
    setPage(p);
    setSearch("");
    document.documentElement.scrollTop = 0;
  };
  const heroLead =
    remaining > 0
      ? `${remaining} more ${remaining === 1 ? "skill" : "skills"} and the ${chapter.name} tee is yours. No clock. No comparison.`
      : "Every chapter complete. Keep exploring with your coaches.";
  const title = pageCopy[page];
  return (
    <div className="app">
      <header className="appbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("My journey");
          }}
        >
          <img src={`${import.meta.env.BASE_URL}lab-white.svg`} alt="The LAB — Learn. Adapt. Build." />
        </a>
        <nav className="primary-nav" aria-label="Main navigation">
          {nav.map((n) => {
            const Icon = navIcons[n];
            return (
              <button
                className={page === n ? "nav-item active" : "nav-item"}
                key={n}
                onClick={() => navigate(n)}
                aria-current={page === n ? "page" : undefined}
                title={n}
              >
                <span className="nav-icon">
                  <Icon size={18} />
                </span>
                <span className="nav-label">{n}</span>
                <span className="nav-short" aria-hidden="true">
                  {shortNames[n]}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="appbar-controls">
          <label className="chip-select athlete-chip">
            <span className="avatar" style={{ background: child.color }}>
              {child.initials}
            </span>
            <select
              aria-label="Select athlete"
              value={childId}
              onChange={(e) => chooseChild(e.target.value)}
            >
              {people.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.first}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="caret" />
          </label>
          <label className="chip-select role-chip">
            <span className="sr-only">Demo view</span>
            <select
              aria-label="Demo view"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                if (page === "Coach desk") setPage("My journey");
              }}
            >
              {["Athlete", "Parent", "Coach"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <ChevronDown size={14} className="caret" />
          </label>
        </div>
      </header>
      <main>
        {title && (
          <div className="page-head">
            <div>
              <h1>{title[0]}</h1>
              <p>{title[1]}</p>
            </div>
            {page === "Coach desk" && (
              <span className="status status-practicing">Demo workspace</span>
            )}
          </div>
        )}
        {page === "Activity" && (
          <div className="page-head">
            <div>
              <h1>{child.first}’s skill story</h1>
              <p>What happened, when, and who saw it.</p>
            </div>
            <div className="page-head-actions">
              <button
                className="button outline compact"
                onClick={() => {
                  const payload = {
                    athlete: child.name,
                    participation: (state.club?.events ?? []).filter(
                      (e) => e.childId === childId,
                    ),
                    starRewards: (state.club?.claims ?? []).filter(
                      (e) => e.childId === childId,
                    ),
                    awards: state.awards.filter((a) => a.childId === childId),
                    bonuses: state.bonusAwards.filter(
                      (a) => a.childId === childId,
                    ),
                    rewards: state.rewards.filter(
                      (r) => r.childId === childId,
                    ),
                  };
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(payload, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `lab-${childId}-progress.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  notify("Progress exported.");
                }}
              >
                Export JSON
              </button>
            </div>
          </div>
        )}
        {saveError && (
          <div role="alert" className="warning">
            {saveError}
          </div>
        )}
        {page === "Clubhouse" && (
          <Club
            state={state}
            childId={childId}
            role={role}
            commit={clubCommit}
          />
        )}
        {page === "My journey" && (
          <>
            <section className="hero" style={{ "--tier-color": chapter.color }}>
              <div className="hero-copy">
                <span className="eyebrow">
                  Chapter {current} · {chapter.name}
                </span>
                <h1>
                  {role === "Athlete" ? (
                    <>
                      Let’s build, <em>{child.first}.</em>
                    </>
                  ) : (
                    <>
                      {child.first}’s <em>journey.</em>
                    </>
                  )}
                </h1>
                <p className="lead">{heroLead}</p>
                <div className="hero-actions">
                  <button
                    className="button cyan"
                    onClick={() => {
                      setTier(current);
                      navigate("Achievements");
                    }}
                  >
                    Explore my next skills
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => navigate("Rewards")}
                  >
                    See the shirts
                  </button>
                </div>
                <div className="hero-stats">
                  <div>
                    <strong>
                      {total}
                      <small>/ {catalog.length}</small>
                    </strong>
                    <span>skills unlocked</span>
                  </div>
                  <div>
                    <strong>
                      {chaptersDone}
                      <small>/ 4</small>
                    </strong>
                    <span>chapters complete</span>
                  </div>
                  <div>
                    <strong>{ready}</strong>
                    <span>ready to explore</span>
                  </div>
                </div>
              </div>
              <div className="hero-reward">
                <div className="hero-reward-art">
                  <ShirtImage
                    tier={current}
                    view="front"
                    className="hero-shirt"
                    alt={`The ${chapter.name} tee, the tier ${current} shirt`}
                    eager
                  />
                  <Ring
                    value={chapterProgress.count}
                    max={chapterProgress.total}
                    size={100}
                    stroke={9}
                    color={chapter.color}
                    track="rgba(255,255,255,0.14)"
                  >
                    <strong>{chapterProgress.count}</strong>
                    <small>of {chapterProgress.total}</small>
                  </Ring>
                </div>
                <p className="hero-reward-caption">
                  The {chapter.name} tee
                  <span>
                    {remaining > 0
                      ? `${remaining} ${remaining === 1 ? "skill" : "skills"} away`
                      : "Earned"}
                  </span>
                </p>
              </div>
            </section>
            <div className="overview">
              <section className="card overview-card">
                <ShirtImage
                  tier={current}
                  view="back"
                  className="overview-shirt"
                  alt=""
                />
                <div>
                  <span className="eyebrow">Next reward</span>
                  <strong>The {chapter.name} tee</strong>
                  <span className="sub">
                    {remaining > 0
                      ? `${remaining} ${remaining === 1 ? "skill" : "skills"} away. Made for the ones who did it.`
                      : "Earned. Made for the ones who did it."}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => navigate("Rewards")}
                  >
                    See rewards <ArrowRight size={14} />
                  </button>
                </div>
              </section>
              <ClubSummary
                state={state}
                childId={childId}
                onOpen={() => navigate("Clubhouse")}
              />
              <section className="card overview-card">
                <div>
                  <span className="eyebrow">Latest unlock</span>
                  <strong>
                    {recent.length
                      ? catalog.find((s) => s.id === recent[0].skillId).title
                      : "Your first “I did it” is ahead."}
                  </strong>
                  <span className="sub">
                    {recent.length
                      ? `${recent[0].coach} verified this on ${date(recent[0].at)}.`
                      : "Choose a skill with your coach to get started."}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => navigate("Activity")}
                  >
                    Your timeline <ArrowRight size={14} />
                  </button>
                </div>
              </section>
            </div>
            <div className="section-heading">
              <div>
                <h2>Your four chapters</h2>
                <p>Each one earned through what you can do.</p>
              </div>
              <span className="quiet-note">NO CLOCK. NO COMPARISON.</span>
            </div>
            <TierRail
              state={state}
              childId={childId}
              selected={tier}
              onSelect={(id) => {
                setTier(id);
                navigate("Achievements");
              }}
            />
            <div className="section-heading">
              <div>
                <h2>
                  {role === "Parent"
                    ? "What’s next for " + child.first
                    : "Find your next “I did it.”"}
                </h2>
                <p>A few skills you’re ready to work toward.</p>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setTier(current);
                  navigate("Achievements");
                }}
              >
                All achievements <ArrowRight size={16} />
              </button>
            </div>
            <div className="skill-grid">
              {featured.map((s) => (
                <SkillCard
                  key={s.id}
                  skill={s}
                  earned={false}
                  eligible
                  state={state}
                  childId={childId}
                  onClick={() => setSelected(s)}
                />
              ))}
              {!featured.length && (
                <div className="empty-state">
                  <h3>A chapter worth celebrating.</h3>
                  <p>
                    Explore your achievements or revisit an earned skill with
                    your coach.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
        {(page === "Achievements" || page === "Coach desk") && (
          <>
            {page === "Coach desk" && (
              <div className="note">
                <div>
                  <strong>Demo coach workspace</strong>
                  Sample setups only. These records simulate verification; they
                  are not live athletic assessments.
                </div>
              </div>
            )}
            <TierRail
              state={state}
              childId={childId}
              selected={tier}
              onSelect={setTier}
            />
            <section className="catalog-head">
              <div className="catalog-title">
                <div>
                  <span className="eyebrow">Tier {tier}</span>
                  <h2>{active.name} achievements</h2>
                  <p>
                    {progress.count} of {progress.total} unlocked
                    {tier > 1
                      ? " · previous chapters required to earn this shirt"
                      : ""}
                  </p>
                </div>
              </div>
              <div className="catalog-actions">
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search achievements"
                    placeholder="Find a skill…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  className="select"
                  aria-label="Achievement status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option>All</option>
                  <option>Earned</option>
                  <option>To earn</option>
                </select>
              </div>
            </section>
            <div className="filters" aria-label="Skill categories">
              {categories.map((c) => (
                <button
                  key={c}
                  className={filter === c ? "selected" : ""}
                  onClick={() => setFilter(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="skill-grid catalog-grid">
              {visible.map((s) => (
                <SkillCard
                  key={s.id}
                  skill={s}
                  earned={earned.has(s.id)}
                  eligible={isEligible(state, childId, s)}
                  state={state}
                  childId={childId}
                  onClick={() => setSelected(s)}
                />
              ))}
              {!visible.length && (
                <div className="empty-state">
                  <h3>No skills match just yet.</h3>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSearch("");
                      setFilter("All skills");
                      setStatus("All");
                    }}
                  >
                    Clear filters <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
            <section className="bonus-section">
              <div className="section-heading">
                <div>
                  <h2>More ways to belong</h2>
                  <p>Bonus achievements. They don’t count toward a shirt.</p>
                </div>
              </div>
              <div className="bonus-grid">
                {bonuses.map((b) => {
                  const done = state.bonusAwards.some(
                    (a) => a.childId === childId && a.bonusId === b.id,
                  );
                  return (
                    <div
                      className={`card bonus-card ${done ? "done" : ""}`}
                      key={b.id}
                    >
                      <div>
                        <h3>{b.title}</h3>
                        <p>{b.criteria}</p>
                        {role === "Coach" ? (
                          <button
                            disabled={done}
                            onClick={() =>
                              commit(
                                { type: "bonus", childId, bonusId: b.id },
                                "Bonus added. Skill tier progress stays the same.",
                              )
                            }
                            className="text-button"
                          >
                            {done ? "Earned" : "Verify bonus"}
                          </button>
                        ) : (
                          <span className={done ? "status status-earned" : "subtle"}>
                            {done ? "Earned" : "Explore with your coach"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {page === "Rewards" && (
          <>
            <RewardsShowcase
              state={state}
              childId={childId}
              role={role}
              commit={commit}
              onExplore={(id) => {
                setTier(id);
                navigate("Achievements");
              }}
            />
            <p className="fulfillment-note">
              Shirts shown are design concepts. This local demo simulates size
              selection and collection; it does not place an order.
            </p>
          </>
        )}
        {page === "Activity" && (
          <section className="card timeline-panel">
            {recent.length ? (
              recent.map((a) => {
                const s = catalog.find((s) => s.id === a.skillId);
                return (
                  <article className="timeline-item" key={a.id}>
                    <Badge
                      category={s.category}
                      label={skillNumber(s.id)}
                      state="earned"
                      className="badge-sm"
                    />
                    <div>
                      <span className="eyebrow">
                        Tier {s.tier} · {date(a.at)}
                      </span>
                      <h3>{s.title}</h3>
                      <p>
                        {typeof a.value === "number"
                          ? `${a.value} ${s.unit} · `
                          : ""}
                        {a.setup}
                      </p>
                      <span className="verified">
                        Verified by {a.coach} · rubric v{a.version}
                      </span>
                      {a.note && <p className="coach-note">{a.note}</p>}
                    </div>
                    {role === "Coach" && (
                      <button
                        className="button outline compact correction"
                        onClick={() => {
                          setCorrection(a);
                          setReason("");
                        }}
                      >
                        Correct record
                      </button>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="empty-state">
                <h3>Every story starts somewhere.</h3>
                <p>Your first verified skill will appear here.</p>
              </div>
            )}
            {role === "Coach" &&
              state.audit
                .filter(
                  (a) =>
                    a.childId === childId && a.action.startsWith("Corrected"),
                )
                .map((a, i) => (
                  <p className="audit-line" key={i}>
                    {date(a.at)} · {a.action}
                  </p>
                ))}
          </section>
        )}
      </main>
      <footer>
        <span>
          THE LAB <b>·</b> LEARN. ADAPT. BUILD.
        </span>
        <span>
          Synthetic demo data · saved on this browser only
          <button
            onClick={() => setResetOpen(true)}
            aria-label="Reset demo data"
          >
            Reset
          </button>
        </span>
      </footer>
      {selected && (
        <SkillDialog
          skill={selected}
          child={child}
          role={role}
          state={state}
          onClose={() => setSelected(null)}
          commit={commit}
        />
      )}
      {resetOpen && (
        <Modal title="Start a fresh demo?" onClose={() => setResetOpen(false)}>
          <p>
            This resets all synthetic athletes, achievements, goals, class
            stars, station stamps, reward requests and shirt selections on this
            browser.
          </p>
          <div className="dialog-buttons">
            <button
              className="button outline"
              onClick={() => setResetOpen(false)}
            >
              Keep progress
            </button>
            <button
              className="button navy"
              onClick={() => {
                commit({ type: "reset" }, "Demo data reset.");
                setTier(1);
                setResetOpen(false);
              }}
            >
              Reset demo
            </button>
          </div>
        </Modal>
      )}
      {correction && (
        <Modal
          title="Correct an achievement"
          onClose={() => setCorrection(null)}
        >
          <p>
            A correction keeps an audit record. Any affected shirt entitlement
            will be marked for review.
          </p>
          <label className="field">
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this record being corrected?"
            />
          </label>
          <div className="dialog-buttons">
            <button
              className="button navy"
              onClick={() => {
                if (
                  commit(
                    { type: "revoke", id: correction.id, reason },
                    "Record corrected. Related rewards were rechecked.",
                  )
                )
                  setCorrection(null);
              }}
            >
              Save correction
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toastError ? "error" : ""}`}
          role={toastError ? "alert" : "status"}
        >
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => notify("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function focusTier(state, childId) {
  const open = state.rewards.find(
    (r) => r.childId === childId && r.status !== "Collected",
  );
  return open ? open.tier : currentTier(state, childId);
}
function RewardsShowcase({ state, childId, role, commit, onExplore }) {
  const [focus, setFocus] = useState(() => focusTier(state, childId));
  const [view, setView] = useState("front");
  useEffect(() => {
    setFocus(focusTier(state, childId));
    setView("front");
  }, [childId]);
  const status = (t) => {
    const p = tierProgress(state, childId, t.id);
    const reward = state.rewards.find(
      (r) => r.childId === childId && r.tier === t.id,
    );
    const locked =
      t.id > 1 && !tierProgress(state, childId, t.id - 1).complete;
    return {
      p,
      reward,
      locked,
      name: reward && !reward.review ? "earned" : locked ? "locked" : "progress",
    };
  };
  const t = tiers[focus - 1];
  const { p, reward, locked, name } = status(t);
  const remaining = p.total - p.count;
  const lead = reward?.review
    ? "A corrected record put this shirt under review. A coach will recheck it."
    : reward
      ? `Earned on ${date(reward.earnedAt)}. Made for the ones who did it.`
      : locked
        ? `Finish the ${tiers[t.id - 2].name} chapter first. Every skill you unlock here still counts.`
        : remaining === 1
          ? "One more skill. Then it’s yours."
          : `${remaining} more skills. Then it’s yours.`;
  return (
    <section className="trophy-case">
      <div
        className="stage"
        style={{ "--tier-color": t.color }}
        data-state={name}
      >
        <div className="stage-art">
          <span className="stage-glow" />
          <span className="stage-number" aria-hidden="true">
            0{t.id}
          </span>
          <ShirtImage tier={t.id} view={view} className="stage-shirt" eager />
          <div className="stage-flip" role="group" aria-label="Shirt view">
            <button
              aria-pressed={view === "front"}
              onClick={() => setView("front")}
            >
              Front
            </button>
            <button
              aria-pressed={view === "back"}
              onClick={() => setView("back")}
            >
              Back
            </button>
          </div>
        </div>
        <div className="stage-copy">
          <span className="eyebrow">
            Tier {t.id} ·{" "}
            {reward
              ? reward.review
                ? "Under review"
                : reward.status
              : locked
                ? "Locked"
                : "In progress"}
          </span>
          <h2>The {t.name} tee</h2>
          <p className="stage-word">{t.word}</p>
          <p className="stage-lead">{lead}</p>
          <div className="stage-progress">
            <div>
              <b>
                {p.count} of {p.total} skills
              </b>
              <span>
                {p.complete ? "Chapter complete" : `in the ${t.name} chapter`}
              </span>
            </div>
            <Meter
              value={p.count}
              max={p.total}
              color={t.color}
              label={`${t.name} chapter progress`}
              className="on-dark"
            />
          </div>
          {reward && !reward.review ? (
            <RewardControls reward={reward} role={role} commit={commit} />
          ) : (
            <div className="stage-actions">
              <button className="button cyan" onClick={() => onExplore(t.id)}>
                {locked ? `Explore ${t.name} skills` : "Explore this chapter"}
              </button>
            </div>
          )}
          <p className="stage-specs">
            Youth athletic crewneck · Two-color screen print · {t.id}-stripe
            sleeve rank · Earned, never sold
          </p>
        </div>
      </div>
      <div className="collection" role="group" aria-label="Shirt collection">
        {tiers.map((c) => {
          const s = status(c);
          return (
            <button
              key={c.id}
              className={`collection-card ${s.name} ${focus === c.id ? "selected" : ""}`}
              style={{ "--tier-color": c.color }}
              aria-pressed={focus === c.id}
              onClick={() => {
                setFocus(c.id);
                setView("front");
              }}
            >
              <span className="collection-number" aria-hidden="true">
                0{c.id}
              </span>
              <ShirtImage
                tier={c.id}
                view="front"
                className="collection-shirt"
                eager
              />
              <span className="collection-meta">
                <strong>{c.name}</strong>
                <span>
                  {s.reward
                    ? s.reward.review
                      ? "Under review"
                      : s.reward.status === "Collected"
                        ? "Collected"
                        : "Earned"
                    : s.locked
                      ? "Locked"
                      : `${s.p.count}/${s.p.total} skills`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
function TierRail({ state, childId, selected, onSelect }) {
  return (
    <div className="tier-rail">
      {tiers.map((t) => {
        const p = tierProgress(state, childId, t.id);
        return (
          <button
            key={t.id}
            className={`tier-card ${selected === t.id ? "selected" : ""} ${p.complete ? "complete" : ""}`}
            onClick={() => onSelect(t.id)}
            style={{ "--tier-color": t.color }}
          >
            <span className="tier-kicker">TIER {t.id}</span>
            <h3>{t.name}</h3>
            <p>
              {p.complete ? "Complete" : `${p.count} of ${p.total} unlocked`}
            </p>
            <Meter
              value={p.count}
              max={p.total}
              color={p.complete ? "var(--mint-deep)" : t.color}
              label={`${t.name} progress`}
            />
          </button>
        );
      })}
    </div>
  );
}
function SkillCard({ skill, earned, eligible, state, childId, onClick }) {
  const status = skillStatus(state, childId, skill, earned, eligible);
  const meta = categoryMeta[skill.category] ?? categoryMeta["Course skills"];
  return (
    <button
      className={`skill-card state-${status}`}
      style={{ "--cat": meta.color }}
      onClick={onClick}
    >
      <Badge
        category={skill.category}
        label={skillNumber(skill.id)}
        state={earned ? "earned" : eligible ? "open" : "locked"}
      />
      <StatusChip status={status} />
      <div className="skill-card-body">
        <span className="skill-meta">
          <span className="sr-only">{skill.id} · </span>
          Tier {skill.tier} · {skill.category}
        </span>
        <h3>{skill.title}</h3>
        <p>{skill.target ? `${skill.target} ${skill.unit}` : skill.criteria}</p>
      </div>
    </button>
  );
}
function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const listener = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = ref.current.querySelectorAll(
          'button:not(:disabled),input,textarea,select,[tabindex="0"]',
        );
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", listener);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        ref={ref}
      >
        <button
          className="modal-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <h2 id="dialog-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}
function SkillDialog({ skill, child, role, state, onClose, commit }) {
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [secondDate, setSecondDate] = useState("");
  const [project, setProject] = useState("");
  const [error, setError] = useState("");
  const earned = earnedIds(state, child.id).includes(skill.id);
  const eligible = isEligible(state, child.id, skill);
  const award = state.awards.find(
    (a) => a.childId === child.id && a.skillId === skill.id && !a.revoked,
  );
  const status = skillStatus(state, child.id, skill, earned, eligible);
  function verify(e) {
    e.preventDefault();
    const action = {
      type: "award",
      childId: child.id,
      skillId: skill.id,
      coach: "Coach Jordan",
      value,
      confirmed,
      note,
      secondDate,
      project,
    };
    try {
      apply(state, action);
      if (commit(action, `${child.first} unlocked ${skill.title}!`)) onClose();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Modal title={skill.title} onClose={onClose}>
      <div className="dialog-head">
        <Badge
          category={skill.category}
          label={skillNumber(skill.id)}
          state={earned ? "earned" : eligible ? "open" : "locked"}
          className="badge-lg"
        />
        <div>
          <span className="skill-meta">
            {skill.id} · Tier {skill.tier} · {skill.category}
          </span>
          <StatusChip status={status} />
        </div>
      </div>
      <p className="dialog-criteria">{skill.criteria}</p>
      <div className="setup-box">
        <strong>Sample setup</strong>
        <p>{skill.setup}</p>
      </div>
      <p className="demo-detail">
        Prototype rubric only. Real equipment dimensions, readiness, rest and
        stop rules require qualified coach approval.
      </p>
      {skill.prerequisites.length > 0 && (
        <div className="prerequisites">
          <strong>Build these skills first</strong>
          {skill.prerequisites.map((id) => (
            <div key={id}>
              {earnedIds(state, child.id).includes(id) ? (
                <Check size={15} className="done" aria-label="Done" />
              ) : (
                <Lock size={15} aria-label="Not yet" />
              )}
              {catalog.find((s) => s.id === id).title}
            </div>
          ))}
        </div>
      )}
      {!earned && eligible && (
        <button
          className="button outline goal-button"
          onClick={() =>
            commit(
              { type: "goal", childId: child.id, skillId: skill.id },
              (state.goals?.[child.id] ?? []).includes(skill.id)
                ? "Goal removed."
                : "Added to your next goals.",
            )
          }
        >
          {(state.goals?.[child.id] ?? []).includes(skill.id)
            ? "Remove from my goals"
            : "Make this my next goal"}
        </button>
      )}
      {earned ? (
        <div className="earned-proof">
          <div>
            <strong>Unlocked by {child.first}</strong>
            <p>
              {award.coach} · {date(award.at)}
              {typeof award.value === "number"
                ? ` · ${award.value} ${skill.unit}`
                : ""}
            </p>
          </div>
        </div>
      ) : role === "Coach" ? (
        <form onSubmit={verify}>
          <div className="form-divider" />
          <h3>Verify a demonstration</h3>
          <p className="subtle">Demo verifier: Coach Jordan</p>
          {skill.target && (
            <label className="field">
              Measured result ({skill.unit})
              <input
                type="number"
                min="0"
                step={skill.unit === "seconds" ? "any" : "1"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`Target: ${skill.target}`}
                required
              />
            </label>
          )}
          {skill.special === "repeat" && (
            <label className="field">
              Earlier qualifying assessment date
              <input
                type="date"
                value={secondDate}
                onChange={(e) => setSecondDate(e.target.value)}
                required
              />
            </label>
          )}
          {skill.special === "project" && (
            <label className="field">
              Approved objective project rubric
              <textarea
                value={project}
                onChange={(e) => setProject(e.target.value)}
                required
                placeholder="Task, setup, criteria, prerequisites and assistance…"
              />
            </label>
          )}
          <label className="field">
            Coach note <span>(optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you observe?"
              maxLength={500}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I observed the full sample task, with the specified setup,
              prerequisites and controlled finish.
            </span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-buttons">
            <button
              type="button"
              className="button outline"
              onClick={() => {
                if (
                  commit(
                    { type: "practice", childId: child.id, skillId: skill.id },
                    "Practice recorded. No mastery badge awarded.",
                  )
                )
                  onClose();
              }}
            >
              Log practice
            </button>
            <button className="button navy" disabled={!eligible} type="submit">
              Verify unlock
            </button>
          </div>
          {!eligible && (
            <p className="form-error">
              Prerequisite skills must be verified first.
            </p>
          )}
        </form>
      ) : (
        <div className="coach-prompt">
          <p>
            {eligible
              ? "Ready to work on this? Ask your coach to watch your next attempt."
              : "Work with your coach on the prerequisites first."}
          </p>
        </div>
      )}
    </Modal>
  );
}
function RewardControls({ reward, role, commit }) {
  const [size, setSize] = useState(reward.size || "");
  return (
    <div className="reward-controls">
      {reward.status === "Choose size" && role === "Athlete" ? (
        <p className="subtle">
          You earned it! Ask your parent to choose your size in the Parent view.
        </p>
      ) : reward.status === "Choose size" ? (
        <>
          <label className="sr-only" htmlFor={`size-${reward.id}`}>
            Shirt size
          </label>
          <select
            id={`size-${reward.id}`}
            className="select"
            aria-label={`Tier ${reward.tier} shirt size`}
            value={size}
            onChange={(e) => setSize(e.target.value)}
          >
            <option value="">Choose your size</option>
            {[
              "Youth XS",
              "Youth S",
              "Youth M",
              "Youth L",
              "Youth XL",
              "Adult S",
              "Adult M",
              "Adult L",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button
            className="button navy"
            disabled={!size}
            onClick={() =>
              commit(
                { type: "reward", id: reward.id, status: "Reserved", size },
                "Demo shirt reserved. No order was placed.",
              )
            }
          >
            Reserve demo shirt
          </button>
        </>
      ) : (
        <>
          <span className="size-label">
            {reward.size} · {reward.status}
          </span>
          {role === "Coach" && reward.status !== "Collected" && (
            <button
              className="button navy"
              onClick={() =>
                commit(
                  {
                    type: "reward",
                    id: reward.id,
                    status:
                      reward.status === "Reserved" ? "Ready" : "Collected",
                  },
                  "Shirt status updated.",
                )
              }
            >
              {reward.status === "Reserved" ? "Mark ready" : "Mark collected"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
export { App };
const rootElement = document.getElementById("root");
if (rootElement) createRoot(rootElement).render(<App />);
