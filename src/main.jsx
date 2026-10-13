import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Home,
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
  loadValue,
  key,
  apply,
  earnedIds,
  currentTier,
  tierProgress,
  isEligible,
  formatResult,
  resultCap,
} from "./domain";
import {
  Badge,
  Meter,
  OutlineWords,
  Ring,
  ShirtImage,
  skillNumber,
} from "./ui.jsx";
import DotField from "./DotField.jsx";
import { CountUp, Glare, reducedMotion, spark, sparkFrom } from "./motion.jsx";
import { date } from "./format.js";
import { MoveArt } from "./moves.jsx";
import "./ds/tokens.css";
import "./styles.css";
import Club, { ClubHero, ClubSummary } from "./Club.jsx";
import { applyClub, validClub, emptyClub } from "./club.js";
import { LayoutGrid, Users } from "lucide-react";
// The coach center and kiosk load on demand; they carry the QR decoder.
const CoachApp = lazy(() => import("./CoachApp.jsx"));
const Kiosk = lazy(() => import("./Kiosk.jsx"));
// The TV floor board carries three.js; only ?tv loads it.
const FloorTV = lazy(() => import("./FloorTV.jsx"));
const StyleGuide = lazy(() => import("./ds/StyleGuide.jsx"));
import Family, { MomentsGallery } from "./Family.jsx";
import Login from "./Login.jsx";
import { SESSION_KEY, formatPhone, loadSession, signOut } from "./auth.js";
import { families } from "./roster.js";
import { emptyFloor, validFloor } from "./floor.js";
import { seedGym, validGym, withHistory, withoutHistory } from "./gym.js";
import { clearPhotos } from "./media.js";
import { familyOf } from "./roster.js";
import { SkillAbout, SkillHero, SkillPath } from "./SkillDetail.jsx";
import { firstStep } from "./paths.js";
import { plain } from "./skillcopy.js";

// Read on demand so tests (and in-app links) can change the URL.
const params = {
  has: (k) => new URLSearchParams(window.location.search).has(k),
};

// Nav icons only render in the phone bottom tab bar.
const navIcons = {
  "My journey": Home,
  Clubhouse: Star,
  Achievements: Trophy,
  "Coach desk": ClipboardCheck,
  "Coach center": LayoutGrid,
  Family: Users,
  Rewards: Shirt,
  Activity: Medal,
};
const shortNames = {
  "My journey": "Home",
  Clubhouse: "Club",
  Achievements: "Skills",
  "Coach desk": "Desk",
  "Coach center": "Floor",
  Family: "Family",
  Rewards: "Rewards",
  Activity: "Story",
};
const pageCopy = {
  Achievements: [
    "Achievements",
    "Every unlock is a real skill, verified by a coach.",
  ],
  "Coach desk": [
    "Coach desk",
    "Observe the skill. Celebrate the progress. Keep it specific.",
  ],
};
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
  if (
    state.practice.some((p) => p.childId === childId && p.skillId === skill.id)
  )
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
        floor: validFloor(saved.floor) ? saved.floor : emptyFloor(),
        gym: validGym(saved.gym)
          ? withHistory(saved.gym)
          : seedGym(new Date(), { history: true }),
      };
    } catch {
      return { ...load(null), gym: seedGym(new Date(), { history: true }) };
    }
  });
  const [saveError, setSaveError] = useState("");
  const [session, setSession] = useState(() => {
    try {
      return loadSession(localStorage);
    } catch {
      return null;
    }
  });
  const start = startFor(session);
  const [role, setRole] = useState(start.role);
  const [childId, setChildId] = useState(start.childId);
  const [page, setPage] = useState(() =>
    session?.kind === "staff" && params.has("coach")
      ? "Coach center"
      : new URLSearchParams(window.location.search).has("station") ||
          new URLSearchParams(window.location.search).has("class")
        ? "Clubhouse"
        : start.page,
  );
  const [tier, setTier] = useState(() => currentTier(state, "theo"));
  const [filter, setFilter] = useState("All skills");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  // { id, message, error, tier, leaving }; a new id restarts the timer even
  // when the same message fires twice.
  const [toast, setToast] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [reason, setReason] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [toastPaused, setToastPaused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [rewardFocus, setRewardFocus] = useState(() =>
    focusTier(state, "theo"),
  );
  const [rewardView, setRewardView] = useState("front");
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
      localStorage.setItem(
        key,
        JSON.stringify({ ...state, gym: withoutHistory(state.gym) }),
      );
      setSaveError("");
    } catch {
      setSaveError(
        "Browser storage is unavailable. Changes will not survive a reload.",
      );
    }
  }, [state]);
  // Other tabs on this device (the kiosk, a second coach view) write the
  // same record; pick up their saves.
  // Signing in or out in another tab applies here too.
  useEffect(() => {
    const onSession = (e) => {
      if (e.key !== SESSION_KEY) return;
      const s = loadSession(localStorage);
      const next = startFor(s);
      setSession(s);
      setRole(next.role);
      setChildId(next.childId);
      setPage(next.page);
    };
    window.addEventListener("storage", onSession);
    return () => window.removeEventListener("storage", onSession);
  }, []);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== key || !e.newValue) return;
      try {
        const raw = JSON.parse(e.newValue);
        const next = loadValue(raw);
        setState({
          ...next,
          club: validClub(raw.club) ? raw.club : emptyClub(),
          floor: validFloor(raw.floor) ? raw.floor : emptyFloor(),
          gym: validGym(raw.gym)
            ? withHistory(raw.gym)
            : seedGym(new Date(), { history: true }),
        });
      } catch {
        // Ignore a partial write; the next one will land.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // The timer pauses while the toast is hovered or the tab is hidden, and
  // restarts in full on resume.
  useEffect(() => {
    if (!toast || toast.leaving || toastPaused) return;
    const id = setTimeout(dismissToast, toast.tier ? 6500 : 4500);
    return () => clearTimeout(id);
  }, [toast, toastPaused]);
  useEffect(() => {
    const onVisibility = () => setToastPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  function notify(message, isError = false, tier = null) {
    setToastPaused(false);
    setToast(
      message ? { id: Date.now(), message, error: isError, tier } : null,
    );
  }
  // Exit runs as a short transition before unmount.
  function dismissToast() {
    if (reducedMotion()) return setToast(null);
    setToast((t) => (t ? { ...t, leaving: true } : t));
    setTimeout(() => setToast((t) => (t?.leaving ? null : t)), 200);
  }
  function commit(action, message) {
    try {
      const next = apply(state, action);
      setState(next);
      // Finishing a chapter creates its shirt reward: the one moment that
      // gets its own toast.
      const newReward =
        action.type === "award" &&
        next.rewards.find((r) => !state.rewards.some((o) => o.id === r.id));
      if (newReward) {
        const t = tiers[newReward.tier - 1];
        const who = people.find((p) => p.id === newReward.childId);
        notify(`${who.first} earned the ${t.name} tee!`, false, newReward.tier);
        spark(window.innerWidth / 2, window.innerHeight - 120, {
          count: 24,
          radius: 140,
          size: 26,
          duration: 900,
        });
      } else if (message) notify(message);
      return true;
    } catch (e) {
      notify(e.message, true);
      return false;
    }
  }
  // A parent sees their own kids; staff see everyone.
  const kids =
    session?.kind === "guardian"
      ? people.filter((p) => familyKids(session).includes(p.id))
      : people;
  const views =
    session?.kind === "staff"
      ? ["Coach", "Parent", "Athlete"]
      : ["Parent", "Athlete"];
  function doSignOut() {
    signOut(localStorage);
    setSession(null);
    setSelected(null);
    setRole("Athlete");
    setPage("My journey");
  }
  function chooseChild(id) {
    setChildId(id);
    setTier(currentTier(state, id));
    setRewardFocus(focusTier(state, id));
    setRewardView("front");
    setSelected(null);
  }
  const nav =
    role === "Coach"
      ? [
          "Coach center",
          "My journey",
          "Clubhouse",
          "Achievements",
          "Coach desk",
          "Rewards",
          "Activity",
        ]
      : role === "Parent"
        ? [
            "My journey",
            "Clubhouse",
            "Achievements",
            "Rewards",
            "Activity",
            "Family",
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
      ? `${remaining} more ${remaining === 1 ? "skill" : "skills"} and the ${chapter.name} tee is yours.`
      : "Every chapter complete. Keep exploring with your coaches.";
  const title = pageCopy[page];
  const exportProgress = () => {
    const payload = {
      athlete: child.name,
      participation: (state.club?.events ?? []).filter(
        (e) => e.childId === childId,
      ),
      starRewards: (state.club?.claims ?? []).filter(
        (e) => e.childId === childId,
      ),
      awards: state.awards.filter((a) => a.childId === childId),
      bonuses: state.bonusAwards.filter((a) => a.childId === childId),
      rewards: state.rewards.filter((r) => r.childId === childId),
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
  };
  const exploreTier = (id) => {
    setTier(id);
    navigate("Achievements");
  };
  const mastheadKind =
    page === "My journey"
      ? "home"
      : page === "Rewards"
        ? "rewards"
        : page === "Clubhouse"
          ? "club"
          : "page";
  if (params.has("ds"))
    return (
      <Suspense fallback={<div className="cc-loading" />}>
        <StyleGuide />
      </Suspense>
    );
  if (params.has("tv"))
    return (
      <Suspense fallback={<div className="cc-loading" />}>
        <FloorTV state={state} setState={setState} session={session} />
      </Suspense>
    );
  if (params.has("kiosk"))
    return (
      <Suspense fallback={<div className="cc-loading" />}>
        <Kiosk state={state} setState={setState} />
      </Suspense>
    );
  if (!session)
    return (
      <Login
        onSignedIn={(s) => {
          const next = startFor(s);
          setSession(s);
          setRole(next.role);
          setChildId(next.childId);
          setTier(currentTier(state, next.childId));
          setRewardFocus(focusTier(state, next.childId));
          setPage(next.page);
          window.scrollTo?.(0, 0);
        }}
      />
    );
  if (page === "Coach center" && session.kind === "staff")
    return (
      <Suspense fallback={<div className="cc-loading" />}>
        <CoachApp
          state={state}
          setState={setState}
          account={session}
          onSignOut={doSignOut}
          onExit={() => {
            setRole("Coach");
            setPage("My journey");
          }}
        />
      </Suspense>
    );
  return (
    <div className="app">
      <header className={`appbar ${scrolled ? "is-scrolled" : ""}`.trim()}>
        <div className="appbar-inner">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("My journey");
            }}
          >
            <img
              src={`${import.meta.env.BASE_URL}lab-white.svg`}
              alt="The LAB — Learn. Adapt. Build."
            />
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
                {kids.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.first}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="caret" />
            </label>
            <label className="chip-select role-chip">
              <span className="sr-only">View as</span>
              <select
                aria-label="View as"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  if (page === "Coach desk") setPage("My journey");
                  if (page === "Family" && e.target.value !== "Parent")
                    setPage("My journey");
                }}
              >
                {views.map((r) => (
                  <option key={r} value={r}>
                    {r === "Athlete" ? "Kid view" : r}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="caret" />
            </label>
          </div>
        </div>
      </header>
      <section
        className={`masthead masthead-${mastheadKind}`}
        style={{
          "--tier-color":
            page === "Rewards" ? tiers[rewardFocus - 1].color : chapter.color,
        }}
      >
        <div className="masthead-art" aria-hidden="true">
          <DotField />
          {mastheadKind !== "home" && <OutlineWords />}
        </div>
        <div className="masthead-inner">
          {page === "My journey" && (
            <div className="hero">
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
                <div className="hero-progress">
                  <Ring
                    value={chapterProgress.count}
                    max={chapterProgress.total}
                    size={64}
                    stroke={6}
                    color="var(--cyan)"
                    track="rgba(255,255,255,0.16)"
                  >
                    <strong>
                      <CountUp value={chapterProgress.count} />
                    </strong>
                    <small>of {chapterProgress.total}</small>
                  </Ring>
                  <p className="lead">{heroLead}</p>
                </div>
              </div>
              <div className="hero-actions">
                <button
                  className="button cyan"
                  onClick={() => exploreTier(current)}
                >
                  Explore my next skills
                </button>
                <button
                  className="hero-link"
                  onClick={() => navigate("Rewards")}
                >
                  See the shirts <ArrowRight size={16} />
                </button>
              </div>
              <div className="hero-reward">
                <ShirtImage
                  tier={current}
                  view="front"
                  className="hero-shirt"
                  alt={`The ${chapter.name} tee, the tier ${current} shirt`}
                  eager
                />
              </div>
            </div>
          )}
          {page === "Clubhouse" && <ClubHero state={state} childId={childId} />}
          {page === "Rewards" && (
            <RewardStage
              state={state}
              childId={childId}
              role={role}
              commit={commit}
              focus={rewardFocus}
              view={rewardView}
              setView={setRewardView}
              onExplore={exploreTier}
            />
          )}
          {title && (
            <>
              <div className="page-head">
                <div>
                  <h1>{title[0]}</h1>
                  <p>{title[1]}</p>
                </div>
              </div>
              <TierRail
                state={state}
                childId={childId}
                selected={tier}
                onSelect={setTier}
              />
            </>
          )}
          {page === "Activity" && (
            <div className="page-head">
              <div>
                <span className="eyebrow">Activity</span>
                <h1>{child.first}’s skill story</h1>
                <p>What happened, when, and who saw it.</p>
              </div>
              <div className="page-head-actions">
                <button
                  className="button mint compact"
                  onClick={exportProgress}
                >
                  Export JSON
                </button>
              </div>
            </div>
          )}
          {page === "Family" && (
            <div className="page-head">
              <div>
                <span className="eyebrow">Family</span>
                <h1>{familyOf(childId)?.name ?? "Your family"}</h1>
                <p>
                  Your check-in pass, photo settings and moments from the floor.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
      <main>
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
            <div className="stat-strip">
              <section className="stat-tile tile-sky">
                <span className="eyebrow">Skills</span>
                <strong className="stat-value">
                  <CountUp value={total} />
                  <small>/ {catalog.length}</small>
                </strong>
                <b>skills unlocked</b>
                <small>
                  {ready} ready to explore · {chaptersDone} of 4 chapters
                  complete
                </small>
              </section>
              <ClubSummary
                state={state}
                childId={childId}
                onOpen={() => navigate("Clubhouse")}
              />
              <button
                className="stat-tile tile-lime"
                onClick={() => navigate("Activity")}
              >
                <span className="eyebrow">Latest unlock</span>
                <strong className="stat-title">
                  {recent.length
                    ? catalog.find((s) => s.id === recent[0].skillId).title
                    : "Your first “I did it” is ahead."}
                </strong>
                <small>
                  {recent.length
                    ? `${recent[0].coach} verified this on ${date(recent[0].at)}.`
                    : "Choose a skill with your coach to get started."}
                </small>
                <span className="text-button">
                  Your timeline <ArrowRight size={14} />
                </span>
              </button>
            </div>
            <div className="section-heading">
              <div>
                <h2>Your four chapters</h2>
                <p>Each one earned through what you can do.</p>
              </div>
            </div>
            <TierRail
              state={state}
              childId={childId}
              selected={tier}
              onSelect={exploreTier}
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
                onClick={() => exploreTier(current)}
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
            <section className="catalog-head">
              <div className="catalog-title">
                <div>
                  <span className="eyebrow">Tier {tier}</span>
                  <h2>{active.name} achievements</h2>
                  <p>
                    {progress.count} of {progress.total} unlocked
                    {tier > 1 &&
                    !tierProgress(state, childId, tier - 1).complete
                      ? " · previous chapters required to earn this shirt"
                      : ""}
                  </p>
                </div>
              </div>
              <div className="catalog-actions">
                <label className="search">
                  <Search size={16} />
                  <input
                    type="search"
                    enterKeyHint="search"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
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
                      className={`bonus-card ${done ? "done" : ""}`}
                      key={b.id}
                    >
                      <h3>{b.title}</h3>
                      <p>{b.criteria}</p>
                      {role === "Coach" ? (
                        <button
                          disabled={done}
                          onClick={(e) => {
                            const el = e.currentTarget;
                            if (
                              commit(
                                { type: "bonus", childId, bonusId: b.id },
                                "Bonus added.",
                              )
                            )
                              sparkFrom(el);
                          }}
                          className="text-button"
                        >
                          {done ? "Earned" : "Verify bonus"}
                        </button>
                      ) : (
                        <span
                          className={done ? "status status-earned" : "subtle"}
                        >
                          {done ? "Earned" : "Explore with your coach"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {page === "Rewards" && (
          <>
            <RewardCollection
              state={state}
              childId={childId}
              focus={rewardFocus}
              onFocus={(id) => {
                setRewardFocus(id);
                setRewardView("front");
              }}
            />
            <p className="fulfillment-note">
              Shirts shown are design concepts. This local demo simulates size
              selection and collection; it does not place an order.
            </p>
          </>
        )}
        {page === "Family" && role === "Parent" && (
          <Family
            state={state}
            childId={childId}
            setState={setState}
            notify={notify}
          />
        )}
        {page === "Activity" && (
          <MomentsGallery
            state={state}
            childIds={[childId]}
            role={role}
            setState={setState}
            notify={notify}
          />
        )}
        {page === "Activity" && (
          <section className="card timeline-panel">
            {recent.length ? (
              recent.map((a) => {
                const s = catalog.find((s) => s.id === a.skillId);
                return (
                  <article className="timeline-item" key={a.id}>
                    <Badge
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
                          ? `${formatResult(s, a.value)} · `
                          : ""}
                        {a.setup}
                      </p>
                      <span className="verified">
                        Verified by {a.coach}
                        {role === "Coach" && ` · rubric v${a.version}`}
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
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img
              src={`${import.meta.env.BASE_URL}lab-white.svg`}
              alt="The LAB"
            />
            <p>Stronger kids. Closer families. Every day.</p>
          </div>
          <div className="footer-meta">
            <span className="account-line">
              Signed in as {session.name} · {formatPhone(session.phone)}
              <button onClick={doSignOut}>Sign out</button>
            </span>
            <span>Synthetic demo data · saved on this browser only</span>
            <button
              onClick={() => setResetOpen(true)}
              aria-label="Reset demo data"
            >
              Reset
            </button>
          </div>
        </div>
        <img
          className="footer-watermark"
          src={`${import.meta.env.BASE_URL}lab-white.svg`}
          alt=""
          aria-hidden="true"
        />
      </footer>
      {selected && (
        <SkillDialog
          skill={selected}
          child={child}
          role={role}
          state={state}
          onClose={() => setSelected(null)}
          commit={commit}
          onOpenSkill={setSelected}
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
                setState((x) => ({
                  ...x,
                  gym: seedGym(new Date(), { history: true }),
                }));
                clearPhotos().catch(() => {});
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
              maxLength={200}
              enterKeyHint="done"
            />
          </label>
          <div className="dialog-buttons">
            <button
              className="button navy"
              onClick={() => {
                if (
                  commit(
                    { type: "revoke", id: correction.id, reason },
                    "Record corrected.",
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
          key={toast.id}
          className={`toast ${toast.error ? "error" : ""} ${toast.tier ? "toast-reward" : ""} ${toast.leaving ? "is-leaving" : ""}`}
          role={toast.error ? "alert" : "status"}
          onMouseEnter={() => setToastPaused(true)}
          onMouseLeave={() => setToastPaused(false)}
        >
          {toast.tier && (
            <ShirtImage
              tier={toast.tier}
              view="front"
              className="toast-shirt"
              alt=""
              eager
            />
          )}
          <span>{toast.message}</span>
          <button aria-label="Dismiss notification" onClick={dismissToast}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
const familyKids = (session) =>
  families.find((f) => f.id === session?.familyId)?.kids ?? [];
// Where an account lands after signing in.
function startFor(session) {
  if (session?.kind === "staff")
    return { role: "Coach", childId: "theo", page: "Coach center" };
  if (session?.kind === "guardian")
    return {
      role: "Parent",
      childId: familyKids(session)[0] ?? "theo",
      page: "My journey",
    };
  return { role: "Athlete", childId: "theo", page: "My journey" };
}
function focusTier(state, childId) {
  const open = state.rewards.find(
    (r) => r.childId === childId && r.status !== "Collected",
  );
  return open ? open.tier : currentTier(state, childId);
}
function rewardStatus(state, childId, t) {
  const p = tierProgress(state, childId, t.id);
  const reward = state.rewards.find(
    (r) => r.childId === childId && r.tier === t.id,
  );
  const locked = t.id > 1 && !tierProgress(state, childId, t.id - 1).complete;
  return {
    p,
    reward,
    locked,
    name: reward && !reward.review ? "earned" : locked ? "locked" : "progress",
  };
}
function RewardStage({
  state,
  childId,
  role,
  commit,
  focus,
  view,
  setView,
  onExplore,
}) {
  const t = tiers[focus - 1];
  const { p, reward, locked, name } = rewardStatus(state, childId, t);
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
    <div className="stage" data-state={name}>
      <div className="stage-copy">
        <h1 className="eyebrow">Rewards</h1>
        <span className="stage-kicker">
          Tier {t.id} ·{" "}
          {reward
            ? reward.review
              ? "Under review"
              : reward.status
            : locked
              ? "Locked"
              : "In progress"}
        </span>
        <h2 className={name === "earned" ? "shiny" : undefined}>
          The {t.name} tee
        </h2>
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
      </div>
      <div className="stage-art">
        <ShirtImage
          key={`${t.id}-${view}`}
          tier={t.id}
          view={view}
          className="stage-shirt"
          eager
        />
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
    </div>
  );
}
function RewardCollection({ state, childId, focus, onFocus }) {
  return (
    <section className="collection-section">
      <div className="section-heading">
        <div>
          <h2>The collection</h2>
          <p>Four chapters. Four exclusive shirts. Earned, never given.</p>
        </div>
      </div>
      <div className="collection" role="group" aria-label="Shirt collection">
        {tiers.map((c) => {
          const s = rewardStatus(state, childId, c);
          return (
            <button
              key={c.id}
              className={`collection-card ${s.name} ${focus === c.id ? "selected" : ""}`}
              style={{ "--tier-color": c.color }}
              aria-pressed={focus === c.id}
              onClick={() => onFocus(c.id)}
            >
              {s.name === "earned" && (
                <Glare
                  once={focus === c.id}
                  key={focus === c.id ? "focus" : "rest"}
                />
              )}
              <ShirtImage
                tier={c.id}
                view="front"
                className="collection-shirt"
                eager
              />
              <span className="collection-meta">
                <span className="collection-number">TIER 0{c.id}</span>
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
      <p className="stage-specs">
        Youth athletic crewneck · Two-color screen print · Sleeve stripes mark
        the tier · Earned, never sold
      </p>
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
  return (
    <button className={`skill-card state-${status}`} onClick={onClick}>
      <MoveArt skillId={skill.id} />
      <Badge
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
        <p>
          {skill.target
            ? formatResult(skill, skill.target)
            : (plain[skill.id] ?? skill.criteria)}
        </p>
      </div>
    </button>
  );
}
function Modal({ title, header, className = "", onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [leaving, setLeaving] = useState(false);
  // Pointer closes play a short exit first; Escape closes at once.
  const animatedClose = () => {
    if (reducedMotion()) return onClose();
    setLeaving(true);
    setTimeout(() => closeRef.current(), 180);
  };
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
      className={`modal-backdrop ${leaving ? "is-leaving" : ""}`.trim()}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) animatedClose();
      }}
    >
      <section
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        ref={ref}
      >
        <button
          className="modal-close"
          aria-label="Close dialog"
          onClick={animatedClose}
        >
          <X size={18} />
        </button>
        {header ?? <h2 id="dialog-title">{title}</h2>}
        {children}
      </section>
    </div>
  );
}
function SkillDialog({
  skill,
  child,
  role,
  state,
  onClose,
  commit,
  onOpenSkill,
}) {
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
  // Moving along the prerequisite path swaps the skill in place.
  useEffect(() => {
    setValue("");
    setConfirmed(false);
    setNote("");
    setSecondDate("");
    setProject("");
    setError("");
    document.querySelector(".skill-modal")?.scrollTo?.(0, 0);
  }, [skill.id]);
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
      const from = e.nativeEvent.submitter ?? e.currentTarget;
      if (commit(action, `${child.first} unlocked ${skill.title}!`)) {
        sparkFrom(from, { count: 16, radius: 84, size: 20 });
        onClose();
      }
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Modal
      title={skill.title}
      onClose={onClose}
      className="skill-modal"
      header={
        <SkillHero
          skill={skill}
          child={child}
          state={state}
          status={status}
          award={award}
        />
      }
    >
      <SkillAbout skill={skill} />
      <SkillPath
        skill={skill}
        state={state}
        childId={child.id}
        onOpen={onOpenSkill}
      />
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
            <strong className="shiny">Unlocked by {child.first}</strong>
            <p>
              {award.coach} · {date(award.at)}
              {typeof award.value === "number"
                ? ` · ${formatResult(skill, award.value)}`
                : ""}
            </p>
          </div>
        </div>
      ) : role === "Coach" ? (
        <form onSubmit={verify}>
          <div className="form-divider" />
          <h3>Verify a demonstration</h3>
          <p className="subtle">Demo verifier: Coach Jordan</p>
          <p className="demo-detail">
            Prototype rubric only. Real equipment dimensions, readiness, rest
            and stop rules require qualified coach approval.
          </p>
          {skill.target && (
            <label className="field">
              Measured result ({skill.units?.[1] ?? skill.unit})
              <input
                type="number"
                inputMode={skill.unit === "seconds" ? "decimal" : "numeric"}
                enterKeyHint="done"
                min="0"
                max={resultCap(skill)}
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
                    "Practice recorded.",
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
          {eligible ? (
            <p>
              Ready to work on this? Ask your coach to watch your next attempt.
            </p>
          ) : (
            firstStep(state, child.id, skill.id) && (
              <button
                className="text-button"
                onClick={() =>
                  onOpenSkill(firstStep(state, child.id, skill.id))
                }
              >
                Start with {firstStep(state, child.id, skill.id).title}{" "}
                <ArrowRight size={16} />
              </button>
            )
          )}
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
                "Shirt reserved.",
              )
            }
          >
            Reserve shirt
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
