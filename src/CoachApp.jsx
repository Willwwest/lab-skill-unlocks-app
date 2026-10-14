import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock,
  Check,
  ChevronDown,
  Gift,
  Hand,
  HeartPulse,
  Lock,
  Plus,
  Trash2,
  UserPlus,
  Cake,
  Sparkles,
  Pause,
  Play,
  Search,
  SkipForward,
  Square,
  Timer,
  Users,
  X,
} from "lucide-react";
import {
  apply,
  catalog,
  currentTier,
  people,
  tierProgress,
  tiers,
} from "./domain.js";
import {
  Card,
  Chip,
  CoachMark,
  Empty,
  Eyebrow,
  Field,
  IconButton,
  Menu,
  SaveBar,
  Section,
  Segmented,
  Select,
  Tag,
  TextArea,
} from "./ds/index.jsx";
import {
  clock,
  dayKey,
  sessionPhase,
  sessions,
  stations,
  BONUS_PICKS,
} from "./club.js";
import {
  applyFloor,
  birthdayIn,
  hereNow,
  rosterFor,
  stationCategory,
  stationFor,
} from "./floor.js";
import { coaches, families, kidInfo, staff } from "./roster.js";
import { plain } from "./skillcopy.js";
import { plural } from "./format.js";
import {
  calendarMonthYear,
  gymFullDay,
  gymHour,
  gymLocalIso,
  gymSyncedAt,
  toMinutes,
} from "./gym-time.js";
import { Avatar } from "./photos.jsx";
import { CountUp, sparkFrom } from "./motion.jsx";
import { Badge, OutlineWords, Ring, skillNumber } from "./ui.jsx";
import DotField from "./DotField.jsx";
import { clockTime, skillStars, starsToday } from "./coachkit.jsx";
import {
  applyGym,
  bonusesBy,
  checkinsFor,
  checkOff,
  classTimeline,
  coachAt,
  coachModes,
  coachOfGroup,
  fitRounds,
  handoffsFor,
  MAX_ROUNDS,
  modeFor,
  postOf,
  runCoaches,
  runMode,
  coachStats,
  crewFor,
  crewOn,
  deskIssues,
  findKids,
  flagsFor,
  focusAt,
  focusSkills,
  gymOf,
  groupSummary,
  leadOf,
  levelOf,
  levels,
  member,
  myBlocks,
  nextSkill,
  nextSkills,
  planFor,
  pointsLabel,
  roleNames,
  rotation,
  runOf,
  staffName,
  stationFocus,
  stationLabel,
  tenure,
  tenureKinds,
} from "./gym.js";
import CoachCenter from "./Coach.jsx";
// The 3D gym map carries three.js; it loads only when opened.
const FloorTV = lazy(() => import("./FloorTV.jsx"));
import {
  StaffPanel,
  staffBadge,
  staffLeads,
  staffTabs,
  staffTitles,
} from "./Staffing.jsx";
import { classCrew, groupLimit, withLevel } from "./staffing.js";
import YourWeek from "./YourWeek.jsx";
import BlockSchedule from "./BlockSchedule.jsx";
import Inbox from "./Inbox.jsx";
import ClockCard from "./ClockCard.jsx";
import { scheduleOf, sessionFromId } from "./schedule.js";
import { insights, kidVisits } from "./insights.js";
import "./coach.css";
import "./coachapp.css";
import "./plans.css";

const InsightsTab = lazy(() =>
  import("./InsightsView.jsx").then((module) => ({
    default: module.InsightsTab,
  })),
);

const DEVICE = "lab-coach-app";
const readDevice = () => {
  try {
    return JSON.parse(sessionStorage.getItem(DEVICE)) ?? {};
  } catch {
    return {};
  }
};
const writeDevice = (patch) => {
  try {
    sessionStorage.setItem(
      DEVICE,
      JSON.stringify({ ...readDevice(), ...patch }),
    );
  } catch {
    // Without storage a refresh returns to Today.
  }
};

function useNow(ms) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// True while the element is on screen. A step's main button lives in the
// masthead; a copy docks at the bottom once that scrolls away.
// A callback ref, so the observer follows the element if React replaces it.
function useInView() {
  const [inView, setInView] = useState(true);
  const io = useRef(null);
  const ref = useCallback((node) => {
    io.current?.disconnect();
    io.current = null;
    if (!node || typeof IntersectionObserver === "undefined") return;
    io.current = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { rootMargin: "-90px 0px 0px 0px" },
    );
    io.current.observe(node);
  }, []);
  useEffect(() => () => io.current?.disconnect(), []);
  return [ref, inView];
}

const byStart = (a, b) => a.start.localeCompare(b.start);
const kidById = (id) => people.find((p) => p.id === id);
const lastName = (id) => kidInfo[id]?.last ?? "";
const firstName = (name) => name.replace("Coach ", "");
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const minutesLabel = (m) =>
  m === null || m === undefined ? "—" : `${Math.round(m)} min`;
const classStart = (block) =>
  Date.parse(gymLocalIso(block.id.slice(0, 10), block.start));
// "Homeschool ninja" → ["Homeschool", "ninja."]
const splitTitle = (name) => {
  const words = name.split(" ");
  return words.length > 1
    ? [words.slice(0, -1).join(" "), `${words[words.length - 1]}.`]
    : ["", `${name}.`];
};

// A short two-tone beep for the rotation warning. Silent where audio is blocked.
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.28].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // No audio on this device.
  }
}

/* ---------- Masthead ---------- */

function Masthead({ children, kind = "page" }) {
  return (
    <section
      className={`masthead masthead-club cf-masthead cf-masthead-${kind}`}
    >
      <div className="masthead-art" aria-hidden="true">
        <DotField />
        <OutlineWords />
      </div>
      <div className="masthead-inner">{children}</div>
    </section>
  );
}

function Hero({
  eyebrow,
  title,
  lead,
  aside,
  actions,
  actionsRef,
  actionsAway,
  children,
}) {
  const [a, b] = Array.isArray(title) ? title : splitTitle(title);
  return (
    <div className={`cf-hero ${aside ? "" : "no-aside"}`.trim()}>
      <div className="cf-hero-copy">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>
          {a} <em>{b}</em>
        </h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
      {aside && <div className="cf-hero-aside">{aside}</div>}
      {actions && (
        <div
          className="cf-hero-actions"
          ref={actionsRef}
          inert={actionsAway || undefined}
          aria-hidden={actionsAway || undefined}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

function Dock({ show, children }) {
  return show ? (
    <div className="cf-dock" role="region" aria-label="Quick actions">
      {children}
    </div>
  ) : null;
}

function SectionHead({ title, note, children }) {
  return (
    <div className="section-heading cf-section">
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {children}
    </div>
  );
}

/* ---------- Kid identity ---------- */

function KidFace({ id, state, now, size = 44 }) {
  const child = kidById(id);
  const t = tenure(state, id, now);
  return (
    <span className={`cf-face ${t ? `ring-${t.id}` : ""}`.trim()}>
      <Avatar child={child} photoId={state.floor?.avatars?.[id]} size={size} />
    </span>
  );
}

function TenureTag({ state, id, now }) {
  const t = tenure(state, id, now);
  return t ? <em className={`cf-tenure t-${t.id}`}>{t.label}</em> : null;
}

function LevelChip({ state, id }) {
  const l = levels.find((x) => x.id === levelOf(state, id));
  return l ? <em className="cf-level">{l.label}</em> : null;
}

// The kid's current shirt chapter in its color, as in the kid's own app.
function TierChip({ state, id }) {
  const t = tiers[currentTier(state, id) - 1];
  return (
    <em className="cf-tier" style={{ "--tier": t.color }}>
      {t.name}
    </em>
  );
}

function LevelPick({ ops, id, label = true }) {
  const current = levelOf(ops.state, id);
  const kid = kidById(id);
  return (
    <div
      className="cf-levelpick"
      role="group"
      aria-label={`Level for ${kid.first}`}
    >
      {label && !current && <span>Level?</span>}
      {levels.map((l) => (
        <button
          key={l.id}
          aria-pressed={current === l.id}
          aria-label={`${kid.first}: ${l.label}`}
          title={l.label}
          onClick={(e) =>
            ops.run(
              `${kid.first} set to ${l.label.toLowerCase()}.`,
              (s) =>
                applyGym(s, {
                  type: "level",
                  childId: id,
                  level: l.id,
                  actor: ops.actor,
                }),
              {
                spark: e.currentTarget,
                quiet: current === l.id,
              },
            )
          }
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

function FlagChips({ state, id, now, skip = [] }) {
  return flagsFor(state, id, now)
    .filter((f) => !skip.includes(f.id))
    .map((f) => (
      <em key={f.id} className={`cf-flag f-${f.id}`}>
        {f.id === "desk" ? "Not at front desk" : f.label}
      </em>
    ));
}

function TenureLegend() {
  return (
    <div className="cf-legend" aria-label="Color key">
      {Object.entries(tenureKinds).map(([id, label]) => (
        <span key={id}>
          <i className={`dot t-${id}`} aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  );
}

function SkillLine({ skill, showStation }) {
  return (
    <div className="cf-skill-line">
      <Badge label={skillNumber(skill.id)} state="open" className="badge-sm" />
      <span>
        <small>
          {showStation ? stationLabel(stationFor(skill)) : "Next skill"}
        </small>
        <b>{skill.title}</b>
        <span>{plain[skill.id]}</span>
      </span>
    </div>
  );
}

// One kid, their next skill, and a one-tap "Got it".
// Progress toward the kid's next shirt, as in their own app.
function ShirtProgress({ state, id }) {
  const t = tiers[currentTier(state, id) - 1];
  const p = tierProgress(state, id, t.id);
  return (
    <span
      className="cf-shirt"
      title={`${p.count} of ${p.total} skills toward the ${t.name} tee`}
    >
      <span className="cf-shirt-track" style={{ "--tier": t.color }}>
        <i style={{ width: `${(p.count / p.total) * 100}%` }} />
      </span>
      <small>
        {p.count}/{p.total} {t.name} tee
      </small>
    </span>
  );
}

function KidRow({ ops, id, stationId, prefer, tags }) {
  const { state, now } = ops;
  const kid = kidById(id);
  const skill = nextSkill(state, id, stationId, prefer);
  const care = kidInfo[id]?.care;
  return (
    <article className="cf-row card">
      <button className="cf-row-who" onClick={() => ops.openKid(id)}>
        <KidFace id={id} state={state} now={now} size={52} />
        <span>
          <b>
            {kid.first} <span className="cf-last">{lastName(id)}</span>
          </b>
          <span className="cf-tags">
            <small>Age {kid.age}</small>
            <LevelChip state={state} id={id} />
            <TenureTag state={state} id={id} now={now} />
            {care && (
              <em className="cf-care" title={care}>
                <HeartPulse size={14} aria-hidden="true" /> Care note
              </em>
            )}
            {tags}
          </span>
          <ShirtProgress state={state} id={id} />
        </span>
      </button>
      {!levelOf(state, id) && <LevelPick ops={ops} id={id} />}
      {skill ? (
        <SkillLine skill={skill} showStation={!stationId} />
      ) : (
        <p className="cf-row-none">
          No skill ready {stationId ? "at this station" : "right now"}.
        </p>
      )}
      {skill && (
        <button
          className="button mint cf-got"
          aria-label={`${kid.first} got ${skill.title}`}
          onClick={(e) => {
            if (
              ops.run(
                `${kid.first} unlocked ${skill.title}. +${pointsLabel(kid, skillStars(skill))}`,
                (s) => checkOff(s, ops.actor, id, skill.id),
                {
                  spark: e.currentTarget,
                },
              )
            )
              ops.celebrate(id, skill);
          }}
        >
          <Check size={18} /> Got it
        </button>
      )}
    </article>
  );
}

/* ---------- Timer ---------- */

function useRotationWarning(run, r) {
  const warned = useRef("");
  useEffect(() => {
    if (!r?.warn) return;
    const key = `${run.session}:${r.idx}`;
    if (warned.current === key) return;
    warned.current = key;
    navigator.vibrate?.([300, 120, 300]);
    beep();
  }, [r?.warn, r?.idx, run?.session]);
}

function TimerRing({ run, size = 220 }) {
  useNow(250);
  const r = rotation(run, Date.now());
  useRotationWarning(run, r);
  if (!r) return null;
  return (
    <div
      className={`cf-timer ${r.warn ? "is-warn" : ""} ${r.done ? "is-done" : ""} ${r.paused ? "is-paused" : ""}`.trim()}
      aria-live="polite"
    >
      <Ring
        value={r.done ? 0 : r.left}
        max={(r.warmup ? run.warmup : run.minutes) * 60000}
        size={size}
        stroke={10}
        color={
          r.paused
            ? "var(--ds-zone-paused)"
            : r.warn
              ? "var(--gold)"
              : "var(--cyan)"
        }
        track="rgba(255,255,255,0.14)"
      >
        <span className="cf-timer-label">{rotationLabel(r)}</span>
        <strong>{r.done ? "0:00" : mmss(r.left)}</strong>
        <small>
          {r.done
            ? "Wrap up"
            : r.paused
              ? "On hold"
              : r.warmup
                ? "Until the first station"
                : r.warn
                  ? "Last runs"
                  : r.rounds > 1
                    ? `Round ${r.round} of ${r.rounds}`
                    : `${run.minutes}-min rotations`}
        </small>
      </Ring>
    </div>
  );
}

// "Warm-up", "Rotation 3 of 8" or "Rotations done".
function rotationLabel(r) {
  if (r.done) return "Rotations done";
  if (r.warmup) return "Warm-up";
  return `Rotation ${r.idx + 1} of ${r.total}`;
}

// The live class, pinned in the app bar on every screen.
function LivePill({ ops }) {
  const { state, me } = ops;
  const now = useNow(1000);
  const live = sessions(now, ops.state)
    .map((b) => ({ b, run: runOf(state, b.id) }))
    .find(
      ({ run }) =>
        run?.startedAt &&
        !run.endedAt &&
        (me.head || run.lead === me.name || runCoaches(run).includes(me.id)),
    );
  if (!live) return null;
  const r = rotation(live.run, Date.now());
  const role = live.run.lead === me.name || me.head ? "head" : "station";
  return (
    <button
      className={`cf-live ${r.warn ? "is-warn" : ""}`.trim()}
      onClick={() => ops.enter(live.b, role)}
      aria-label={`${live.b.name} live`}
    >
      <i aria-hidden="true" />
      <span className="cf-live-name">{live.b.name}</span>
      <b>
        {r.done
          ? "Done"
          : r.paused
            ? "On hold"
            : r.warmup
              ? `Warm-up · ${mmss(r.left)}`
              : `${r.idx + 1}/${r.total} · ${mmss(r.left)}`}
      </b>
    </button>
  );
}

/* ---------- Today ---------- */

function blockStatus(state, block, now) {
  const run = runOf(state, block.id);
  if (block.kind === "open") {
    const n = checkinsFor(state, block.id).length;
    return n ? `${n} on the floor` : "";
  }
  if (!run) return "";
  if (run.endedAt) return "Class done";
  if (run.startedAt) {
    const r = rotation(run, now);
    return r.paused ? "On hold" : rotationLabel(r);
  }
  if (run.groups) return "Groups ready";
  return `Attendance · ${checkinsFor(state, block.id).length} in`;
}

function CrewMarks({ crew }) {
  return (
    <span className="cf-crew">
      {crew.map((c) => {
        const s = staff.find((x) => x.id === c.staffId);
        return (
          <span
            key={c.staffId}
            className={`cf-mark r-${c.role}`}
            title={`${s.name} · ${roleNames[c.role]}`}
          >
            {s.initials}
          </span>
        );
      })}
    </span>
  );
}

function DayView({ ops }) {
  const { state, me, now } = ops;
  const [picking, setPicking] = useState(null);
  const mine = myBlocks(state, me.id, now);
  const all = sessions(now, ops.state).slice().sort(byStart);
  const next =
    mine.find((b) => sessionPhase(b, now) === "live") ??
    mine.find((b) => sessionPhase(b, now) === "upcoming") ??
    null;
  const hour = gymHour(now);
  const owed = all.find((b) => {
    const run = runOf(state, b.id);
    return (
      run?.endedAt &&
      (run.lead === me.name || runCoaches(run).includes(me.id)) &&
      bonusesBy(state, b.id, me.name).length < BONUS_PICKS
    );
  });
  const action = (b) =>
    b.role === "head"
      ? runOf(state, b.id)?.startedAt
        ? "Run the class"
        : "Take attendance"
      : b.role === "station"
        ? "Go to my station"
        : b.role === "helper"
          ? "Go to the class"
          : "Start open gym";
  const day = new Date(now).toDateString();
  const myIns = gymOf(state).checkins.filter(
    (c) => c.by === me.name && new Date(c.at).toDateString() === day,
  ).length;
  const mySkills = state.awards.filter(
    (a) =>
      a.coach === me.name &&
      !a.revoked &&
      new Date(a.at).toDateString() === day,
  ).length;
  const lead = !mine.length
    ? "You're not on the floor schedule today."
    : `You're on ${plural(mine.length, "block", "blocks")} today: ${mine.map((b) => `${roleNames[b.role].toLowerCase()} at ${clock(b.start)}`).join(", ")}.`;
  return (
    <>
      <Masthead kind="today">
        <Hero
          eyebrow={`${gymFullDay(now)} · ${clockTime(now)}`}
          title={[
            `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"},`,
            `${firstName(me.name)}.`,
          ]}
          lead={lead}
          aside={
            next ? (
              <div className={`cf-next phase-${sessionPhase(next, now)}`}>
                <span className="eyebrow">
                  {sessionPhase(next, now) === "live"
                    ? "On now"
                    : `Next · ${clock(next.start)}`}
                </span>
                <h2>{next.name}</h2>
                <p>
                  {roleNames[next.role]}
                  {next.ages ? ` · Ages ${next.ages}` : ""} ·{" "}
                  {clock(next.start)}–{clock(next.end)}
                </p>
                {blockStatus(state, next, now) && (
                  <p className="cf-next-status">
                    {blockStatus(state, next, now)}
                  </p>
                )}
                <button
                  className="button cyan"
                  onClick={() => ops.enter(next, next.role)}
                >
                  {action(next)} <ArrowRight size={18} />
                </button>
              </div>
            ) : null
          }
        />
      </Masthead>
      <main className="cf-main">
        <ClockCard ops={ops} />
        <Inbox ops={ops} />
        {owed && (
          <section className="card cf-bonus cf-owed">
            <span>
              <span className="eyebrow">Before you go</span>
              <h3>Bonus picks for {owed.name}</h3>
              <p>
                {BONUS_PICKS - bonusesBy(state, owed.id, me.name).length} of{" "}
                {BONUS_PICKS} left to give.
              </p>
            </span>
            <button
              className="button cyan"
              onClick={() =>
                ops.enter(
                  owed,
                  runOf(state, owed.id).lead === me.name ? "head" : "station",
                )
              }
            >
              <Gift size={18} /> Give bonus picks
            </button>
          </section>
        )}
        <div className="stat-strip cf-strip">
          <section className="stat-tile tile-sky">
            <span className="eyebrow">In the building</span>
            <strong className="stat-value">
              <CountUp value={hereNow(state, now).length} />
            </strong>
            <b>checked in at the front desk</b>
          </section>
          <section className="stat-tile tile-mint">
            <span className="eyebrow">Your check-ins</span>
            <strong className="stat-value">
              <CountUp value={myIns} />
            </strong>
            <b>kids you put on the floor today</b>
          </section>
          <section className="stat-tile tile-lime">
            <span className="eyebrow">Your unlocks</span>
            <strong className="stat-value">
              <CountUp value={mySkills} />
            </strong>
            <b>skills you checked off today</b>
          </section>
        </div>
        <div className="in-today-grid">
          <YourWeek state={state} me={me} now={now} />
          <KidsToWatch ops={ops} blocks={mine} />
        </div>
        <SectionHead
          title="Today at the gym"
          note="Your blocks are highlighted. Tap one to start it."
        />
        <div className="cf-timeline">
          {!all.length && (
            <Empty icon={CalendarDays} title="The gym is closed today">
              Nothing is on the schedule.
            </Empty>
          )}
          {all.map((b) => {
            const crew = classCrew(state, b, now);
            const role = crew.find((c) => c.staffId === me.id)?.role;
            const head = crew.find((c) => c.role === "head");
            const phase = sessionPhase(b, now);
            const Tag = role ? "button" : "div";
            return (
              <Tag
                key={b.id}
                className={`cf-slot card phase-${phase} ${role ? "is-mine" : ""}`.trim()}
                onClick={role ? () => ops.enter(b, role) : undefined}
              >
                <span className="cf-slot-time">
                  <b>{clock(b.start)}</b>
                  <small>to {clock(b.end)}</small>
                </span>
                <span className="cf-slot-body">
                  <span className="cf-slot-title">
                    <b>{b.name}</b>
                    {phase === "live" && <em className="cf-livetag">Live</em>}
                    {role && (
                      <em className={`cf-role r-${role}`}>{roleNames[role]}</em>
                    )}
                  </span>
                  <small>
                    {b.kind === "class" ? `Class · Ages ${b.ages}` : "Open gym"}
                    {head ? ` · Head: ${staffName(head.staffId)}` : ""}
                    {blockStatus(state, b, now)
                      ? ` · ${blockStatus(state, b, now)}`
                      : ""}
                  </small>
                </span>
                <CrewMarks crew={crew} />
                {role && (
                  <ArrowRight
                    size={20}
                    className="cf-slot-go"
                    aria-hidden="true"
                  />
                )}
              </Tag>
            );
          })}
        </div>
        <div className="cf-cover">
          <span>Covering for someone?</span>
          {[
            ["attendant", "Open gym"],
            ["head", "Head coach"],
            ["station", "A station"],
          ].map(([role, label]) => (
            <button
              key={role}
              className="chip"
              aria-pressed={picking === role}
              onClick={() => setPicking(picking === role ? null : role)}
            >
              {label}
            </button>
          ))}
          {picking &&
            all
              .filter((b) =>
                picking === "attendant"
                  ? b.kind === "open"
                  : b.kind === "class",
              )
              .map((b) => (
                <button
                  key={b.id}
                  className="button outline compact"
                  onClick={() => ops.enter(b, picking)}
                >
                  {b.name} · {clock(b.start)}
                </button>
              ))}
        </div>
      </main>
    </>
  );
}

// New kids, kids coming back after a gap, birthdays and care notes among
// the kids this coach will see today.
function KidsToWatch({ ops, blocks }) {
  const { state, now } = ops;
  const day = new Date(now).toDateString();
  const lapsed = useMemo(
    () =>
      Object.fromEntries(
        insights(state, { days: 7 })
          .newKids.filter((n) => n.atRisk)
          .map((n) => [n.id, n]),
      ),
    [state, day],
  );
  const here = hereNow(state, now).map((p) => p.childId);
  const mine = blocks
    .filter((b) => b.kind === "class")
    .flatMap((b) => rosterFor(b.index).map((p) => p.id));
  const ids = [...new Set([...here, ...mine])];
  const items = ids
    .map((id) => {
      const t = tenure(state, id, now);
      const bday = birthdayIn(id, now);
      const why = [];
      if (t?.id === "first")
        why.push({ icon: Sparkles, text: "First visit", tone: "t-first" });
      else if (lapsed[id])
        why.push({
          icon: AlertTriangle,
          text: `Back after ${lapsed[id].lastAgo ?? "a while"} days`,
          tone: "f-pastDue",
        });
      if (bday !== null && bday <= 3)
        why.push({
          icon: Cake,
          text:
            bday === 0
              ? "Birthday today"
              : `Birthday in ${bday} day${bday === 1 ? "" : "s"}`,
          tone: "f-desk",
        });
      if (kidInfo[id]?.care)
        why.push({ icon: HeartPulse, text: kidInfo[id].care, tone: "f-care" });
      return why.length
        ? { id, why, rank: t?.id === "first" ? 0 : lapsed[id] ? 1 : 2 }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 6);
  return (
    <section className="card in-watch">
      <span className="eyebrow">Kids to watch today</span>
      {!items.length && (
        <p className="cc-muted">Nobody to flag in your blocks today.</p>
      )}
      <div className="in-watch-list">
        {items.map(({ id, why }) => (
          <button
            key={id}
            className="in-watch-row"
            onClick={() => ops.openKid(id)}
          >
            <KidFace id={id} state={state} now={now} size={44} />
            <span>
              <b>{kidById(id).name}</b>
              <span className="cf-tags">
                {why.map((w) => {
                  const Icon = w.icon;
                  return (
                    <em key={w.text} className={`cf-flag ${w.tone}`}>
                      <Icon size={13} aria-hidden="true" /> {w.text}
                    </em>
                  );
                })}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- Search ---------- */

function SearchField({ value, onChange, label, placeholder }) {
  return (
    <div className="cf-search">
      <Search size={22} />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")}>
          <X size={18} />
        </button>
      )}
    </div>
  );
}

/* ---------- Open gym ---------- */

function OpenGymView({ ops, block }) {
  const { state, now } = ops;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const ins = checkinsFor(state, block.id)
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));
  const inIds = ins.map((c) => c.childId);
  const waiting = hereNow(state, now).filter((p) => !inIds.includes(p.childId));
  const hits = query.trim().length >= 2 ? findKids(query) : [];
  // Matching kids grouped by family, with their siblings, so one search
  // checks in a whole family.
  const fams = [...new Set(hits.map((k) => kidInfo[k.id]?.family))]
    .map((fid) => families.find((f) => f.id === fid))
    .filter(Boolean);
  const crew = crewOn(state, block.index, now);
  const toggle = (id) =>
    setPicked(
      picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id],
    );
  const checkIn = (ids, el) => {
    const kid = kidById(ids[0]);
    if (
      ops.run(
        ids.length === 1
          ? `${kid.first} is in open gym. +${pointsLabel(kid, 5)}`
          : `${ids.length} kids checked into open gym. +5 each`,
        (s) =>
          applyGym(s, {
            type: "checkIn",
            session: block.id,
            childIds: ids,
            actor: ops.actor,
          }),
        { spark: el },
      )
    ) {
      setPicked([]);
      setQuery("");
    }
  };
  return (
    <>
      <Masthead>
        <Hero
          eyebrow={`Open gym · ${clock(block.start)}–${clock(block.end)} · Floor: ${crew.map((c) => firstName(staffName(c.staffId))).join(", ")}`}
          title={["Open", "gym."]}
          aside={
            query.trim().length >= 2 ? null : (
              <Ring
                value={ins.length}
                max={Math.max(1, ins.length + waiting.length)}
                size={176}
                stroke={10}
                color="var(--cyan)"
                track="rgba(255,255,255,0.14)"
                className="cf-bigring"
              >
                <strong>
                  <CountUp value={ins.length} />
                </strong>
                <small>on the floor</small>
                <span className="cf-ring-sub">
                  {waiting.length} at the desk
                </span>
              </Ring>
            )
          }
        >
          <SearchField
            value={query}
            onChange={setQuery}
            label="Find kids to check in"
            placeholder="Name, parent or phone number"
          />
        </Hero>
      </Masthead>
      <main className="cf-main">
        {query.trim().length >= 2 && (
          <section className="card cf-results">
            {!fams.length && (
              <p className="cc-muted">No kids match “{query}”.</p>
            )}
            {fams.map((f) => (
              <div key={f.id} className="cf-family">
                <div className="cf-family-head">
                  <b>{f.name}</b>
                  <small>{f.guardian}</small>
                  {f.kids.filter((id) => !inIds.includes(id)).length > 1 && (
                    <button
                      className="text-button"
                      onClick={() =>
                        setPicked([
                          ...new Set([
                            ...picked,
                            ...f.kids.filter((id) => !inIds.includes(id)),
                          ]),
                        ])
                      }
                    >
                      Select all
                    </button>
                  )}
                </div>
                <div className="cf-family-kids">
                  {f.kids.map((id) => {
                    const kid = kidById(id);
                    const done = inIds.includes(id);
                    return (
                      <button
                        key={id}
                        className="cf-pick"
                        aria-pressed={picked.includes(id)}
                        disabled={done}
                        onClick={() => toggle(id)}
                      >
                        <span className="cf-check" aria-hidden="true">
                          {(picked.includes(id) || done) && <Check size={16} />}
                        </span>
                        <KidFace id={id} state={state} now={now} size={44} />
                        <span className="cf-pick-text">
                          <b>
                            {kid.first} {lastName(id)}
                          </b>
                          <small>
                            {done ? "Already on the floor" : `Age ${kid.age}`}
                          </small>
                        </span>
                        <span className="cf-tags">
                          <FlagChips state={state} id={id} now={now} />
                          <TenureTag state={state} id={id} now={now} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
        <Dock show={picked.length > 0}>
          <span>
            <b>{picked.map((id) => kidById(id).first).join(", ")}</b>
            {picked.some((id) => flagsFor(state, id, now).length) && (
              <small>
                <AlertTriangle size={14} /> Flags go to the front desk list
              </small>
            )}
          </span>
          <button
            className="button cyan"
            onClick={(e) => checkIn(picked, e.currentTarget)}
          >
            Check in {picked.length}
          </button>
        </Dock>
        {waiting.length > 0 && (
          <>
            <SectionHead
              title="At the front desk"
              note="Checked in at the desk, not on the floor yet."
            >
              <button
                className="button navy compact"
                onClick={(e) =>
                  checkIn(
                    waiting.map((p) => p.childId),
                    e.currentTarget,
                  )
                }
              >
                Check in all {waiting.length}
              </button>
            </SectionHead>
            <div className="cf-waiting-row">
              {waiting.map((p) => {
                const kid = kidById(p.childId);
                const mins = Math.max(
                  0,
                  Math.round((now - Date.parse(p.in)) / 60000),
                );
                return (
                  <button
                    key={p.id}
                    className="cf-waiting card"
                    aria-label={`Check in ${kid.first}`}
                    onClick={(e) => checkIn([p.childId], e.currentTarget)}
                  >
                    <KidFace id={p.childId} state={state} now={now} size={48} />
                    <b>{kid.first}</b>
                    <small className={mins >= 10 ? "is-late" : ""}>
                      {mins} min
                    </small>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <SectionHead title={`On the floor · ${ins.length}`}>
          <TenureLegend />
        </SectionHead>
        {!ins.length && (
          <p className="cf-empty card">
            Search above, or check in the kids waiting at the desk.
          </p>
        )}
        <div className="cf-rows">
          {ins.map((c) => (
            <KidRow
              key={c.id}
              ops={ops}
              id={c.childId}
              tags={
                <>
                  {!c.deskAt && (
                    <em className="cf-flag f-desk">Not at front desk</em>
                  )}
                  {c.pastDue && <em className="cf-flag f-pastDue">Past due</em>}
                </>
              }
            />
          ))}
        </div>
        {ins.length > 0 && (
          <BonusPicker
            ops={ops}
            block={block}
            ids={inIds}
            title="End of shift"
          />
        )}
      </main>
    </>
  );
}

/* ---------- Bonus picks ---------- */

function BonusPicker({ ops, block, ids, title = "Bonus picks" }) {
  const { state, now, actor } = ops;
  const [picked, setPicked] = useState([]);
  const given = bonusesBy(state, block.id, actor.name);
  const left = BONUS_PICKS - given.length;
  return (
    <section className="card cf-bonus">
      <span className="eyebrow">{title}</span>
      <h3>
        {left
          ? `Pick ${left} ${left === 1 ? "kid" : "kids"} for a bonus`
          : "Your bonus picks are in"}
      </h3>
      <p>
        +10 each. Whoever earned it today: effort, listening, helping, a
        breakthrough.
      </p>
      {given.length > 0 && (
        <div className="cf-given">
          {given.map((e) => (
            <span key={e.id}>
              <KidFace id={e.childId} state={state} now={now} size={32} />
              {kidById(e.childId).first}
            </span>
          ))}
        </div>
      )}
      {left > 0 && (
        <>
          <div className="cf-bonus-grid">
            {ids
              .filter((id) => !given.some((e) => e.childId === id))
              .map((id) => {
                const on = picked.includes(id);
                return (
                  <button
                    key={id}
                    className="cf-bonus-kid"
                    aria-pressed={on}
                    disabled={!on && picked.length >= left}
                    onClick={() =>
                      setPicked(
                        on ? picked.filter((x) => x !== id) : [...picked, id],
                      )
                    }
                  >
                    <KidFace id={id} state={state} now={now} size={46} />
                    <b>{kidById(id).first}</b>
                  </button>
                );
              })}
          </div>
          <button
            className="button cyan"
            disabled={!picked.length}
            onClick={(e) => {
              if (
                ops.run(
                  `Bonus for ${picked.map((id) => kidById(id).first).join(", ")}.`,
                  (s) =>
                    applyGym(s, {
                      type: "bonus",
                      session: block.id,
                      childIds: picked,
                      actor,
                    }),
                  {
                    spark: e.currentTarget,
                  },
                )
              )
                setPicked([]);
            }}
          >
            <Gift size={18} /> Give bonus
            {picked.length ? ` to ${picked.length}` : ""}
          </button>
        </>
      )}
    </section>
  );
}

/* ---------- Head coach ---------- */

const classSteps = [
  { id: "attendance", label: "Attendance" },
  { id: "groups", label: "Groups" },
  { id: "live", label: "Class" },
  { id: "wrap", label: "Wrap-up" },
];
const classStep = (run) =>
  !run?.attendanceDoneAt || !run.groups
    ? "attendance"
    : !run.startedAt
      ? "groups"
      : !run.endedAt
        ? "live"
        : "wrap";

function Steps({ current }) {
  const at = classSteps.findIndex((s) => s.id === current);
  return (
    <ol className="cf-steps" aria-label="Class steps">
      {classSteps.map((s, i) => (
        <li
          key={s.id}
          className={i < at ? "done" : i === at ? "now" : ""}
          aria-current={i === at ? "step" : undefined}
        >
          <span>{i < at ? <Check size={13} /> : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function ClassView({ ops, block }) {
  const { state, me, now } = ops;
  const run = runOf(state, block.id);
  const step = classStep(run);
  const [ctaRef, ctaInView] = useInView();
  const [pickedMinutes, setMinutes] = useState(null);
  const [pickedWarmup, setWarmup] = useState(null);
  const [pickedRounds, setRounds] = useState(null);
  const plan = planFor(state, block.index);
  const minutes = pickedMinutes ?? run?.minutes ?? plan.minutes;
  const warmup = pickedWarmup ?? run?.warmup ?? plan.warmup;
  const rounds = pickedRounds ?? run?.rounds ?? 1;
  const [confirmWide, setConfirmWide] = useState(false);
  const other =
    run &&
    run.lead !== me.name &&
    leadOf(state, block.index) !== me.id &&
    !me.head;
  const ins = checkinsFor(state, block.id);
  const roster = [
    ...new Set([
      ...rosterFor(block.index).map((p) => p.id),
      ...ins.map((c) => c.childId),
    ]),
  ];
  const wide = run?.groups
    ? run.groups
        .map((ids, g) => ({ g, sum: groupSummary(state, ids) }))
        .filter((x) => x.sum.tooWide)
    : [];
  const ids = run?.groups?.flat() ?? [];
  const skills = run?.startedAt
    ? state.awards.filter(
        (a) =>
          !a.revoked &&
          ids.includes(a.childId) &&
          a.at >= run.startedAt &&
          (!run.endedAt || a.at <= run.endedAt),
      )
    : [];

  const complete = () =>
    ops.run(`${ins.length} kids sorted into groups.`, (s) =>
      applyGym(s, {
        type: "attendanceDone",
        session: block.id,
        actor: ops.actor,
      }),
    );
  const start = () => {
    if (wide.length && !confirmWide) return setConfirmWide(true);
    ops.run("Class started.", (s) =>
      applyGym(s, {
        type: "startClass",
        session: block.id,
        minutes,
        warmup,
        rounds,
        actor: ops.actor,
      }),
    );
  };
  const hold = () =>
    ops.run("Clock on hold.", (s) =>
      applyGym(s, { type: "hold", session: block.id, actor: ops.actor }),
    );
  const resume = () =>
    ops.run("Clock running again.", (s) =>
      applyGym(s, { type: "resume", session: block.id, actor: ops.actor }),
    );
  const live = run?.startedAt ? rotation(run, Date.now()) : null;
  // A head coach who also has a group or station can switch to it.
  const post = postOf(run, me.id);
  const mine = post && (
    <button
      className="button outline-light"
      onClick={() => ops.enter(block, "station")}
    >
      {runMode(run) === "group"
        ? `My group: ${post.group + 1}`
        : `My station: ${stationLabel(post.station)}`}
    </button>
  );
  const rotate = () =>
    ops.run("Rotated.", (s) =>
      applyGym(s, { type: "rotate", session: block.id, actor: ops.actor }),
    );
  const end = () =>
    ops.run("Class ended.", (s) =>
      applyGym(s, { type: "endClass", session: block.id, actor: ops.actor }),
    );

  const cta =
    step === "attendance" ? (
      <button className="button cyan" disabled={!ins.length} onClick={complete}>
        Attendance complete · {ins.length}
      </button>
    ) : step === "groups" ? (
      <>
        <button className="button cyan" onClick={start}>
          <Play size={18} />{" "}
          {wide.length && confirmWide ? "Start anyway" : "Start class"}
        </button>
        {mine}
        {wide.length > 0 && confirmWide && (
          <span className="cf-hero-warn">
            <AlertTriangle size={14} /> Group{" "}
            {wide.map((w) => w.g + 1).join(", ")} mixes ages outside the rule
          </span>
        )}
      </>
    ) : step === "live" ? (
      <>
        {live && !live.done && (
          <button
            className="button outline-light"
            onClick={live.paused ? resume : hold}
          >
            {live.paused ? (
              <>
                <Play size={18} /> Resume
              </>
            ) : (
              <>
                <Pause size={18} /> Hold
              </>
            )}
          </button>
        )}
        {live && !live.done && !live.paused && (
          <button className="button outline-light" onClick={rotate}>
            <SkipForward size={18} />{" "}
            {live.warmup ? "Skip warm-up" : "Rotate now"}
          </button>
        )}
        <button className="button cyan" onClick={end}>
          <Square size={16} /> End class
        </button>
        {mine}
      </>
    ) : (
      <button className="button cyan" onClick={ops.home}>
        Back to today
      </button>
    );

  const leads = {
    attendance: `Drag or tap kids in from the gym. ${ins.length} of ${roster.length} on the roster here.`,
    groups: run?.raised
      ? `${run.groups.length} groups, not ${run.raised}: fewer would put kids outside the age rule together.`
      : `${run?.groups?.length ?? 0} groups, sorted by age, then level. Move anyone who shouldn't be together.`,
    live:
      run?.groups?.length === 1
        ? "One group: the class moves through the stations together. Every coach's phone shows the same clock."
        : runMode(run) === "group"
          ? "Each coach keeps their group and walks it to the next station. Every coach's phone shows the same clock."
          : "Coaches stay put and the groups rotate. Every coach's phone shows the same clock.",
    wrap: `${plural(ids.length, "kid", "kids")} in class · ${plural(skills.length, "skill", "skills")} unlocked.`,
  };
  const late = run?.attendanceAt
    ? Math.round((Date.parse(run.attendanceAt) - classStart(block)) / 60000)
    : null;

  return (
    <>
      <Masthead kind="class">
        <Hero
          eyebrow={`Head coach · ${clock(block.start)}–${clock(block.end)} · Ages ${block.ages}`}
          title={block.name}
          lead={leads[step]}
          actions={cta}
          actionsRef={ctaRef}
          actionsAway={!ctaInView}
          aside={
            step === "attendance" ? (
              <Ring
                value={ins.length}
                max={Math.max(1, roster.length)}
                size={176}
                stroke={10}
                color="var(--cyan)"
                track="rgba(255,255,255,0.14)"
                className="cf-bigring"
              >
                <strong>
                  <CountUp value={ins.length} />
                </strong>
                <small>of {roster.length} here</small>
                {late !== null && (
                  <span className="cf-ring-sub">
                    {late <= 0 ? "Started on time" : `Started ${late} min in`}
                  </span>
                )}
              </Ring>
            ) : step === "groups" ? (
              <div className="cf-bignum">
                <strong>{run.groups.length}</strong>
                <small>
                  {run.groups.length === 1 ? "group" : "groups"} · {minutes} min
                  per station
                </small>
              </div>
            ) : step === "live" ? (
              <TimerRing run={run} />
            ) : (
              <div className="cf-bignum gold">
                <strong>
                  <CountUp value={skills.length} />
                </strong>
                <small>skills unlocked</small>
              </div>
            )
          }
        >
          <Steps current={step} />
        </Hero>
      </Masthead>
      <main className="cf-main">
        {other && (
          <div className="card cf-takeover">
            <span>
              <b>{run.lead}</b> is running this class.
            </span>
            <button
              className="button outline compact"
              onClick={() =>
                ops.run(`You're running ${block.name}.`, (s) =>
                  applyGym(s, {
                    type: "takeLead",
                    session: block.id,
                    actor: ops.actor,
                  }),
                )
              }
            >
              Take over as head coach
            </button>
          </div>
        )}
        {step !== "wrap" && <ClassCoaches ops={ops} block={block} />}
        {step === "attendance" && (
          <AttendanceStep ops={ops} block={block} roster={roster} ins={ins} />
        )}
        {step === "groups" && (
          <GroupsStep
            ops={ops}
            block={block}
            run={run}
            minutes={minutes}
            setMinutes={setMinutes}
            warmup={warmup}
            setWarmup={setWarmup}
            rounds={rounds}
            setRounds={setRounds}
          />
        )}
        {(step === "groups" || step === "live") && (
          <LateArrivals ops={ops} block={block} />
        )}
        {step === "live" && <LiveStep ops={ops} block={block} run={run} />}
        {step === "wrap" && (
          <WrapStep ops={ops} block={block} run={run} skills={skills} />
        )}
        <Dock show={!ctaInView}>
          <span>
            <b>{block.name}</b>
            <small>{classSteps.find((s) => s.id === step).label}</small>
          </span>
          <span className="cf-dock-acts">{cta}</span>
        </Dock>
      </main>
    </>
  );
}

// Drag a chip onto anything marked data-drop. Mouse drags after a small
// move; touch and pen drag after a short press, so a swipe still scrolls.
// A plain tap or click runs the chip's own action.
// The drop zone under the pointer, looking through the docked action bar
// and anything else floating on top.
const dropAt = (ev) => {
  for (const el of document.elementsFromPoint(ev.clientX, ev.clientY)) {
    const zone = el.closest("[data-drop]");
    if (zone) return zone.getAttribute("data-drop");
  }
  return null;
};
function useDrag(onDrop) {
  const [ghost, setGhost] = useState(null);
  const dragged = useRef(false);
  const bind = (id, label) => ({
    onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // No text selection or native drag while a mouse drags a chip.
      if (e.pointerType === "mouse") e.preventDefault();
      dragged.current = false;
      const sx = e.clientX;
      const sy = e.clientY;
      const touch = e.pointerType !== "mouse";
      let live = false;
      let timer = null;
      let edge = null;
      let last = { clientX: sx, clientY: sy };
      const begin = (x, y) => {
        live = true;
        dragged.current = true;
        navigator.vibrate?.(15);
        setGhost({ id, label, x, y, over: null });
        // Hold near the top or bottom of the screen to scroll while dragging.
        edge = setInterval(() => {
          const zone = 120;
          const y = last.clientY;
          const step = y < zone ? -14 : y > window.innerHeight - zone ? 14 : 0;
          if (!step) return;
          window.scrollBy(0, step);
          setGhost((g) => g && { ...g, over: dropAt(last) });
        }, 16);
      };
      const block = (ev) => live && ev.preventDefault();
      const move = (ev) => {
        last = { clientX: ev.clientX, clientY: ev.clientY };
        if (!live) {
          const far = Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8;
          if (touch) {
            if (far) stop();
            return;
          }
          if (!far) return;
          begin(ev.clientX, ev.clientY);
        }
        ev.preventDefault();
        setGhost({ id, label, x: ev.clientX, y: ev.clientY, over: dropAt(ev) });
      };
      const up = (ev) => {
        const target = live ? dropAt(ev) : null;
        stop();
        if (target) onDrop(id, target);
      };
      function stop() {
        clearTimeout(timer);
        clearInterval(edge);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", stop);
        document.removeEventListener("touchmove", block);
        if (live) setGhost(null);
        live = false;
      }
      if (touch) timer = setTimeout(() => begin(sx, sy), 280);
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", stop);
      document.addEventListener("touchmove", block, { passive: false });
    },
    // A finished drag isn't also a tap.
    onClickCapture(e) {
      if (dragged.current) {
        e.stopPropagation();
        e.preventDefault();
        dragged.current = false;
      }
    },
    onContextMenu: (e) => e.preventDefault(),
  });
  const layer = ghost && (
    <div
      className="cf-ghost"
      style={{ left: ghost.x, top: ghost.y }}
      aria-hidden="true"
    >
      {ghost.label}
    </div>
  );
  return { bind, ghost, layer };
}

// Two-year age bands for finding kids fast on the attendance board.
const attBands = [
  [0, 6, "Up to 6"],
  [7, 8, "Ages 7–8"],
  [9, 10, "Ages 9–10"],
  [11, 12, "Ages 11–12"],
  [13, 99, "13 and up"],
];
function byAgeBand(ids) {
  return attBands
    .map(([lo, hi, label]) => ({
      label,
      ids: ids
        .filter((id) => {
          const a = kidById(id).age;
          return a >= lo && a <= hi;
        })
        .sort((a, b) => kidById(a).first.localeCompare(kidById(b).first)),
    }))
    .filter((b) => b.ids.length);
}
// Kids in the gym who could plausibly be in this class: within a year of
// its age range.
function fitsClass(block, id) {
  const [lo, hi] = String(block.ages ?? "")
    .split(/[–-]/)
    .map(Number);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return true;
  const a = kidById(id).age;
  return a >= lo - 1 && a <= hi + 1;
}

// Class attendance as a board. Kids the front desk checked in wait on the
// left, sorted into age bands; drag or tap them into the class. A kid on
// the roster who hasn't been to the desk can still join; they're flagged
// and the front desk sees it on their list. One search finds anyone.
function AttendanceBoard({ ops, block, roster, ins, compact = false }) {
  const { state, now } = ops;
  const [query, setQuery] = useState("");
  const [others, setOthers] = useState(false);
  const inIds = ins.map((c) => c.childId);
  const gym = hereNow(state, now).map((p) => p.childId);
  const waiting = gym.filter(
    (id) => !inIds.includes(id) && roster.includes(id),
  );
  const extra = gym.filter(
    (id) => !inIds.includes(id) && !roster.includes(id) && fitsClass(block, id),
  );
  const missing = roster.filter(
    (id) => !inIds.includes(id) && !gym.includes(id),
  );
  const add = (ids, el) => {
    const list = ids.filter((id) => !inIds.includes(id));
    if (!list.length) return;
    const off = list.filter((id) => !gym.includes(id));
    const names =
      list.length === 1 ? kidById(list[0]).first : `${list.length} kids`;
    ops.run(
      off.length
        ? `${names} in class. ${off.map((id) => kidById(id).first).join(", ")} flagged for the front desk.`
        : `${names} in class. +${pointsLabel(kidById(list[0]), 5)}`,
      (s) =>
        applyGym(s, {
          type: "checkIn",
          session: block.id,
          childIds: list,
          asLead: true,
          actor: ops.actor,
        }),
      { spark: el },
    );
  };
  const remove = (id) =>
    ops.run(`${kidById(id).first} taken out of class.`, (s) =>
      applyGym(s, {
        type: "undoCheckIn",
        session: block.id,
        childId: id,
        actor: ops.actor,
      }),
    );
  const { bind, ghost, layer } = useDrag((id, zone) => {
    if (zone === "in") add([id]);
    if (zone === "out" && inIds.includes(id)) remove(id);
  });
  const hits = query.trim().length >= 2 ? findKids(query) : [];
  const chip = (id, { inClass = false, offDesk = false } = {}) => {
    const kid = kidById(id);
    return (
      <button
        key={id}
        className={`cf-ac ${inClass ? "is-in" : ""} ${offDesk ? "is-off" : ""} ${ghost?.id === id ? "is-lifted" : ""}`.trim()}
        aria-label={
          inClass
            ? `${kid.name}, in class. Tap to take out.`
            : `Add ${kid.name}${offDesk ? ", not at the front desk" : ""}`
        }
        onClick={(e) => (inClass ? remove(id) : add([id], e.currentTarget))}
        {...bind(id, kid.first)}
      >
        <KidFace id={id} state={state} now={now} size={34} />
        <span className="cf-ac-name">
          <b>{kid.first}</b> <small>{kid.age}</small>
        </span>
        {offDesk && (
          <em
            className="cf-flag f-desk"
            title="Not checked in at the front desk"
          >
            No desk
          </em>
        )}
        <FlagChips state={state} id={id} now={now} skip={["desk"]} />
      </button>
    );
  };
  const bands = (ids, opts, addAll = true) =>
    byAgeBand(ids).map((b) => (
      <div key={b.label} className="cf-band">
        <div className="cf-band-head">
          <span>
            {b.label} · {b.ids.length}
          </span>
          {addAll && b.ids.length > 1 && (
            <button
              className="text-button"
              onClick={(e) => add(b.ids, e.currentTarget)}
            >
              Add all {b.ids.length}
            </button>
          )}
        </div>
        <div className="cf-band-kids">
          {b.ids.map((id) => chip(id, opts(id)))}
        </div>
      </div>
    ));
  const unrated = inIds.filter((id) => !levelOf(state, id));
  return (
    <>
      <div className="cf-toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          label="Find any kid"
          placeholder="Find any kid: name, parent or phone"
        />
        {!compact && <TenureLegend />}
      </div>
      {query.trim().length >= 2 && (
        <div className="cf-hits">
          {!hits.length && (
            <span className="cc-muted">No kids match “{query}”.</span>
          )}
          {hits.slice(0, 12).map((k) => {
            const on = inIds.includes(k.id);
            const desk = gym.includes(k.id);
            return (
              <button
                key={k.id}
                className="chip cf-hit"
                aria-pressed={on}
                onClick={(e) =>
                  on ? remove(k.id) : add([k.id], e.currentTarget)
                }
              >
                {on ? <Check size={14} /> : "+"} {k.name} · {k.age}
                {!on && !desk ? " · not at the desk" : ""}
                {!on && !roster.includes(k.id) ? " · walk-in" : ""}
              </button>
            );
          })}
        </div>
      )}
      <div className={`cf-attboard ${compact ? "is-compact" : ""}`.trim()}>
        <section
          className={`card cf-col ${ghost?.over === "out" ? "is-over" : ""}`.trim()}
          data-drop="out"
          aria-label="In the gym"
        >
          <header className="cf-col-head">
            <span>
              <b>{compact ? "Late arrivals" : "In the gym"}</b>
              <small>Checked in at the front desk</small>
            </span>
            {waiting.length > 1 && (
              <button
                className="button outline compact"
                onClick={(e) => add(waiting, e.currentTarget)}
              >
                Add all {waiting.length}
              </button>
            )}
          </header>
          {waiting.length ? (
            bands(waiting, () => ({}))
          ) : (
            <p className="cf-col-empty">
              {roster.length
                ? "Everyone on the roster who's at the desk is in class."
                : "No one on the roster yet."}
            </p>
          )}
          {missing.length > 0 && (
            <div className="cf-band is-missing">
              <div className="cf-band-head">
                <span>Not at the front desk yet · {missing.length}</span>
              </div>
              <p className="cf-band-note">
                Here anyway? Add them. They're flagged so the desk can check
                them in.
              </p>
              <div className="cf-band-kids">
                {missing.map((id) => chip(id, { offDesk: true }))}
              </div>
            </div>
          )}
          {extra.length > 0 && (
            <div className="cf-band is-others">
              <button
                className="text-button"
                aria-expanded={others}
                onClick={() => setOthers(!others)}
              >
                {others ? "Hide" : "Show"} others in the gym · {extra.length}{" "}
                <ChevronDown size={14} />
              </button>
              {others && bands(extra, () => ({}), false)}
            </div>
          )}
        </section>
        {!compact && (
          <section
            className={`card cf-col cf-col-in ${ghost?.over === "in" ? "is-over" : ""}`.trim()}
            data-drop="in"
            aria-label="In class"
          >
            <header className="cf-col-head">
              <span>
                <b>In class · {inIds.length}</b>
                <small>
                  {unrated.length
                    ? `${unrated.length} need a level: B, I or A`
                    : "Tap a kid to take them out"}
                </small>
              </span>
            </header>
            {inIds.length ? (
              byAgeBand(inIds).map((b) => (
                <div key={b.label} className="cf-band">
                  <div className="cf-band-head">
                    <span>
                      {b.label} · {b.ids.length}
                    </span>
                  </div>
                  <div className="cf-band-kids">
                    {b.ids.map((id) => (
                      <span key={id} className="cf-ac-wrap">
                        {chip(id, {
                          inClass: true,
                          offDesk: !gym.includes(id),
                        })}
                        {!levelOf(state, id) && (
                          <LevelPick ops={ops} id={id} label={false} />
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="cf-col-empty">Drag kids here, or tap them.</p>
            )}
          </section>
        )}
      </div>
      {layer}
    </>
  );
}

function AttendanceStep({ ops, block, roster, ins }) {
  return <AttendanceBoard ops={ops} block={block} roster={roster} ins={ins} />;
}

// After attendance: kids who turn up late go straight into a group.
function LateArrivals({ ops, block }) {
  const [open, setOpen] = useState(false);
  const { state, now } = ops;
  const ins = checkinsFor(state, block.id);
  const inIds = ins.map((c) => c.childId);
  const roster = rosterFor(block.index).map((p) => p.id);
  const waiting = hereNow(state, now)
    .map((p) => p.childId)
    .filter((id) => !inIds.includes(id) && roster.includes(id));
  return (
    <section className="card cf-late">
      <button
        className="cf-late-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <UserPlus size={18} aria-hidden="true" />
        <b>Add a late kid</b>
        <small>
          {waiting.length
            ? `${plural(waiting.length, "kid", "kids")} on the roster at the desk, not in class`
            : "They join the group that fits their age"}
        </small>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <AttendanceBoard
          ops={ops}
          block={block}
          roster={roster}
          ins={ins}
          compact
        />
      )}
    </section>
  );
}

// Who's coaching this class today. The head coach can add a coach who
// jumps in to help; that coach gets the class on their phone like the
// crew: their group or station, check-offs, bonus picks, hold and notes.
function ClassCoaches({ ops, block }) {
  const { state, now } = ops;
  const run = runOf(state, block.id);
  const crew = classCrew(state, block, now).filter(
    (c) => c.role !== "attendant",
  );
  const leadId = staff.find((s) => s.name === run?.lead)?.id;
  if (leadId && !crew.some((c) => c.staffId === leadId))
    crew.unshift({ staffId: leadId, role: "head" });
  const ids = run?.groups
    ? run.groups.flat()
    : checkinsFor(state, block.id).map((c) => c.childId);
  const { limit } = groupLimit(state, ids);
  const need = Math.max(1, Math.ceil(ids.length / limit));
  const free = coaches.filter((c) => !crew.some((x) => x.staffId === c.id));
  const fewerGroups =
    run?.groups && !run.startedAt && run.groups.length < crew.length;
  const add = (id) =>
    id &&
    ops.run(`${firstName(staffName(id))} is helping with ${block.name}.`, (s) =>
      applyGym(s, {
        type: "addHelper",
        session: block.id,
        staffId: id,
        actor: ops.actor,
      }),
    );
  const remove = (id) =>
    ops.run(`${firstName(staffName(id))} is off this class.`, (s) =>
      applyGym(s, {
        type: "removeHelper",
        session: block.id,
        staffId: id,
        actor: ops.actor,
      }),
    );
  return (
    <section className="card cf-coaches" aria-label="Coaches in this class">
      <div className="cf-coaches-head">
        <span className="eyebrow">Coaches in this class</span>
        {ids.length > 0 && (
          <em className={crew.length < need ? "cf-flag f-pastDue" : "cf-ok"}>
            {ids.length} kids at 1:{limit} ·{" "}
            {crew.length < need
              ? `needs ${need} coaches, ${crew.length} here`
              : plural(crew.length, "coach is", "coaches are") + " enough"}
          </em>
        )}
      </div>
      <div className="cf-coach-list">
        {crew.map((c) => {
          const s = staff.find((x) => x.id === c.staffId);
          return (
            <span key={c.staffId} className="cf-coach-pill">
              <CoachMark
                initials={s.initials}
                role={c.role === "helper" ? "station" : c.role}
                size={30}
              />
              <span>
                <b>{firstName(s.name)}</b>
                <small>{roleNames[c.role]}</small>
              </span>
              {c.role === "helper" && (
                <IconButton
                  label={`${firstName(s.name)} isn't helping`}
                  icon={X}
                  tone="danger"
                  size={14}
                  onClick={() => remove(c.staffId)}
                />
              )}
            </span>
          );
        })}
        {free.length > 0 && (
          <label className="cf-pill-select cf-add-helper">
            <Hand size={14} aria-hidden="true" />
            <span className="sr-only">Another coach is helping</span>
            <select value="" onChange={(e) => add(e.target.value)}>
              <option value="">Another coach is helping…</option>
              {free.map((c) => (
                <option key={c.id} value={c.id}>
                  {firstName(c.name)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        )}
      </div>
      {fewerGroups && (
        <p className="cf-coaches-note">
          {plural(crew.length, "coach", "coaches")} and{" "}
          {plural(run.groups.length, "group", "groups")}.{" "}
          <button
            className="text-button"
            onClick={() =>
              ops.run(`Re-sorted into ${crew.length} groups.`, (s) =>
                applyGym(s, {
                  type: "regroup",
                  session: block.id,
                  count: Math.min(crew.length, stations.length),
                  actor: ops.actor,
                }),
              )
            }
          >
            Give every coach a group <ArrowRight size={14} />
          </button>
        </p>
      )}
    </section>
  );
}

function GroupsStep({
  ops,
  block,
  run,
  minutes,
  setMinutes,
  warmup,
  setWarmup,
  rounds,
  setRounds,
}) {
  const { state, now } = ops;
  const [moving, setMoving] = useState(null);
  const plan = planFor(state, block.index);
  const mode = runMode(run);
  const traveling = mode === "group";
  const length = toMinutes(block.end) - toMinutes(block.start);
  const time = classTimeline(length, {
    warmup,
    minutes,
    stations: run.stations.length,
    rounds,
  });
  const regroup = (patch, note) => {
    setRounds(null);
    ops.run(note, (s) =>
      applyGym(s, {
        type: "regroup",
        session: block.id,
        actor: ops.actor,
        ...patch,
      }),
    );
  };
  const move = (id, to) => {
    setMoving(null);
    if (run.groups[to].includes(id)) return;
    ops.run(`${kidById(id).first} moved to group ${to + 1}.`, (s) =>
      applyGym(s, {
        type: "moveKid",
        session: block.id,
        childId: id,
        to,
        actor: ops.actor,
      }),
    );
  };
  const { bind, ghost, layer } = useDrag((id, zone) => {
    if (zone.startsWith("g")) move(id, Number(zone.slice(1)));
  });
  const setCoach = (g, staffId) =>
    ops.run(null, (s) =>
      applyGym(
        s,
        traveling
          ? {
              type: "setLeader",
              session: block.id,
              group: g,
              staffId,
              actor: ops.actor,
            }
          : {
              type: "setCoach",
              session: block.id,
              station: run.stations[g],
              staffId,
              actor: ops.actor,
            },
      ),
    );
  const coachOf = (g) => coachOfGroup(run, g);
  const uncoached = run.groups
    .map((_, g) => g)
    .filter((g) => !coachOf(g))
    .map((g) => g + 1);
  const options = [
    ...new Set([
      ...classCrew(state, block, now)
        .filter((c) => c.role !== "attendant")
        .map((c) => c.staffId),
      ...coaches.map((c) => c.id),
    ]),
  ];
  return (
    <>
      <section className="card cf-builder" aria-label="How the class runs">
        <div className="cf-builder-row">
          <span className="cf-count" role="group" aria-label="Number of groups">
            Groups
            {stations.map((_, i) => (
              <button
                key={i}
                aria-pressed={run.groups.length === i + 1}
                onClick={() =>
                  regroup({ count: i + 1 }, `Re-sorted into ${i + 1} groups.`)
                }
              >
                {i + 1}
              </button>
            ))}
          </span>
          {run.groups.length > 1 && (
            <Segmented
              size="sm"
              label="How the coaches move"
              value={mode}
              options={Object.entries(coachModes).map(([value, m]) => ({
                value,
                label: m.label,
              }))}
              onChange={(m) =>
                m !== mode &&
                regroup(
                  { mode: m, count: run.groups.length },
                  coachModes[m].long + ".",
                )
              }
            />
          )}
        </div>
        <p className="cf-builder-note">
          {run.groups.length === 1
            ? `One group: the coach takes the whole class through ${plural(run.stations.length, "station", "stations")} together.`
            : `${coachModes[mode].long}. ${
                traveling
                  ? `${run.groups.length} groups share ${run.stations.length} stations, so some sit empty each rotation.`
                  : `${run.stations.length} stations, one per group.`
              }`}
        </p>
        <div className="cf-builder-row">
          <label className="cc-inline">
            Warm-up
            <select
              value={warmup}
              onChange={(e) => setWarmup(Number(e.target.value))}
            >
              {[...new Set([0, 3, 5, 8, 10, warmup])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {m ? `${m} min` : "None"}
                  </option>
                ))}
            </select>
          </label>
          <label className="cc-inline">
            Minutes per station
            <select
              value={minutes}
              onChange={(e) => {
                const m = Number(e.target.value);
                setMinutes(m);
                setRounds(fitRounds(length, warmup, run.stations.length, m));
              }}
            >
              {[...new Set([5, 8, 10, 12, 15, 20, minutes])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m}>{m}</option>
                ))}
            </select>
          </label>
          <label className="cc-inline">
            Times through
            <select
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
            >
              {Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "Once" : `${n} times`}
                </option>
              ))}
            </select>
          </label>
          <Tag tone={time.over ? "warn" : "info"} icon={Timer}>
            {warmup ? `${warmup} warm-up + ` : ""}
            {run.stations.length * rounds} × {minutes} = {time.used} of {length}{" "}
            min
            {time.over
              ? " · runs over"
              : time.spare > 0
                ? ` · ${time.spare} to close`
                : ""}
          </Tag>
        </div>
      </section>
      <div className="cf-toolbar">
        <span className="cc-muted cf-hint">
          Drag a kid, or tap one and then a group.
        </span>
        {uncoached.length > 0 && (
          <span className="cf-flag f-desk">
            <AlertTriangle size={12} /> No coach for group{" "}
            {uncoached.join(", ")}
          </span>
        )}
      </div>
      <TenureLegend />
      <div className="cf-board" style={{ "--cols": run.groups.length }}>
        {run.groups.map((ids, g) => {
          const sum = groupSummary(state, ids);
          const ratio = groupLimit(state, ids);
          const st = run.stations[g];
          const meta = stations.find((s) => s.id === st);
          const route = run.stations
            .map((_, i) => run.stations[(g + i) % run.stations.length])
            .map(stationLabel);
          return (
            <section
              key={g}
              className={`cf-group card ${ghost?.over === `g${g}` ? "is-over" : ""} ${moving && !ids.includes(moving) ? "is-target" : ""}`.trim()}
              style={{ "--station": meta.color }}
              data-drop={`g${g}`}
              aria-label={`Group ${g + 1}`}
            >
              <header>
                <span className="cf-group-num">{g + 1}</span>
                <span>
                  <b>{sum.ages}</b>
                  <small>
                    {sum.level} · {ids.length} kids
                  </small>
                </span>
              </header>
              <div className="cf-group-station">
                <span className="cf-station-icon" aria-hidden="true">
                  {meta.icon}
                </span>
                <span>
                  <small>Starts at</small>
                  <b>{meta.name}</b>
                </span>
              </div>
              {traveling || run.groups.length === 1 ? (
                <p className="cf-group-focus">Route: {route.join(" → ")}</p>
              ) : (
                <p className="cf-group-focus">{focusAt(plan, st)}</p>
              )}
              <label className="cf-field">
                <span>
                  {traveling || run.groups.length === 1
                    ? "Coach with this group"
                    : `Coach at ${meta.name}`}
                </span>
                <select
                  value={coachOf(g) ?? ""}
                  onChange={(e) => setCoach(g, e.target.value)}
                >
                  <option value="">Choose a coach</option>
                  {options.map((id) => (
                    <option key={id} value={id}>
                      {staffName(id)}
                    </option>
                  ))}
                </select>
              </label>
              {sum.tooWide && (
                <em className="cf-flag f-pastDue">
                  <AlertTriangle size={12} /> Ages outside the rule
                </em>
              )}
              {ratio.over && (
                <em className="cf-flag f-pastDue">
                  <AlertTriangle size={12} /> {ids.length} kids for one coach
                  (1:{ratio.limit}). Split it or add a coach.
                </em>
              )}
              <div className="cf-group-kids">
                {ids.map((id) => {
                  const kid = kidById(id);
                  return (
                    <button
                      key={id}
                      className={`cf-kidchip ${ghost?.id === id ? "is-lifted" : ""}`.trim()}
                      aria-pressed={moving === id}
                      onClick={() => setMoving(moving === id ? null : id)}
                      {...bind(id, kid.first)}
                    >
                      <KidFace id={id} state={state} now={now} size={32} />
                      <span className="cf-kidname">
                        {kid.first} <small>{kid.age}</small>
                      </span>
                      <LevelChip state={state} id={id} />
                    </button>
                  );
                })}
              </div>
              {moving && !ids.includes(moving) && (
                <button
                  className="button outline compact cf-movehere"
                  onClick={() => move(moving, g)}
                >
                  Move {kidById(moving).first} here
                </button>
              )}
            </section>
          );
        })}
      </div>
      {layer}
    </>
  );
}

function StationBoard({ ops, run, block }) {
  const { state, now } = ops;
  const r = rotation(run, Date.now());
  const plan = planFor(state, block.index);
  const traveling = runMode(run) === "group";
  return (
    <div className="cf-stations">
      {run.stations.map((st) => {
        const g = r.groupAt(st);
        const coach = coachAt(run, st, r);
        const meta = stations.find((s) => s.id === st);
        // Who arrives next: the group one station back.
        const after =
          !r.done && r.idx + 1 < r.total
            ? run.groups.findIndex((_, x) => r.nextStationOf(x) === st)
            : -1;
        return (
          <section
            key={st}
            className={`cf-station card ${g < 0 ? "is-empty" : ""}`.trim()}
            style={{ "--station": meta.color }}
          >
            <header>
              <span className="cf-station-icon" aria-hidden="true">
                {meta.icon}
              </span>
              <span>
                <b>{meta.name}</b>
                <small>
                  {coach
                    ? staffName(coach)
                    : g < 0
                      ? "Free this rotation"
                      : "No coach"}
                </small>
              </span>
              {g >= 0 && (
                <span className="cf-group-num small" title={`Group ${g + 1}`}>
                  {g + 1}
                </span>
              )}
            </header>
            <p className="cf-group-focus">{focusAt(plan, st)}</p>
            {g >= 0 && (
              <div className="cf-names">
                {run.groups[g].map((id) => (
                  <span key={id} className="cf-namechip">
                    <KidFace id={id} state={state} now={now} size={26} />
                    {kidById(id).first}
                  </span>
                ))}
              </div>
            )}
            {after >= 0 && (
              <small className="cf-next-group">
                Next: group {after + 1}
                {traveling && coachOfGroup(run, after)
                  ? ` with ${firstName(staffName(coachOfGroup(run, after)))}`
                  : ""}
              </small>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LiveStep({ ops, block, run }) {
  const traveling = runMode(run) === "group";
  return (
    <>
      <SectionHead
        title="Where everyone is"
        note={
          traveling
            ? "The number in the corner is the group. Each coach moves with their group."
            : "The number in the corner is the group. It moves one station along each rotation."
        }
      />
      <StationBoard ops={ops} run={run} block={block} />
    </>
  );
}

function WrapStep({ ops, block, run, skills }) {
  const { state } = ops;
  const ids = run.groups.flat();
  const late = Math.round(
    (Date.parse(run.attendanceDoneAt) - classStart(block)) / 60000,
  );
  const coaches = runCoaches(run);
  return (
    <>
      <div className="stat-strip cf-strip">
        <section className="stat-tile tile-sky">
          <span className="eyebrow">Kids</span>
          <strong className="stat-value">{ids.length}</strong>
          <b>in class</b>
        </section>
        <section className="stat-tile tile-mint">
          <span className="eyebrow">Attendance</span>
          <strong className="stat-value">
            {Math.max(0, late)}
            <small>min</small>
          </strong>
          <b>
            {late <= 0 ? "done on time" : "after the start, until it was done"}
          </b>
        </section>
        <section className="stat-tile tile-lime">
          <span className="eyebrow">Unlocked</span>
          <strong className="stat-value">{skills.length}</strong>
          <b>new skills this class</b>
        </section>
      </div>
      <div className="cf-wrap-grid">
        <BonusPicker
          ops={ops}
          block={block}
          ids={ids}
          title="Your bonus picks"
        />
        <section className="card cf-panel">
          <h3>Bonus picks</h3>
          <div className="cf-lines">
            {coaches.map((id) => {
              const name = staffName(id);
              const given = bonusesBy(state, block.id, name);
              return (
                <div key={id} className="cf-line">
                  <span className="cf-mark">
                    {staff.find((s) => s.id === id).initials}
                  </span>
                  <b>{name}</b>
                  <span>
                    {given.length
                      ? given.map((e) => kidById(e.childId).first).join(", ")
                      : "Not yet"}
                  </span>
                  <em
                    className={
                      given.length >= BONUS_PICKS ? "cf-ok" : "cf-flag f-desk"
                    }
                  >
                    {given.length}/{BONUS_PICKS}
                  </em>
                </div>
              );
            })}
          </div>
          {skills.length > 0 && (
            <>
              <h3>Unlocked this class</h3>
              <div className="cf-lines">
                {skills.map((a) => (
                  <div key={a.id} className="cf-line">
                    <Badge
                      label={skillNumber(a.skillId)}
                      state="earned"
                      className="cf-mini-badge"
                    />
                    <b>{kidById(a.childId).first}</b>
                    <span>{catalog.find((s) => s.id === a.skillId).title}</span>
                    <small>{a.coach}</small>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

/* ---------- Station coach ---------- */

// A coach's own corner of a class: the group with them now, each kid's
// next skill, and what's coming. With coaches staying put it follows the
// coach's station; with coaches traveling it follows their group.
function StationView({ ops, block }) {
  const { state, me, now } = ops;
  const run = runOf(state, block.id);
  const traveling = runMode(run) === "group";
  const post = postOf(run, me.id);
  const [chosen, setChosen] = useState(null);
  const plan = planFor(state, block.index);
  const r = run?.startedAt ? rotation(run, Date.now()) : null;
  const groupCount = run?.groups?.length ?? 0;
  let g = -1;
  let st = null;
  if (run?.groups) {
    if (traveling) {
      g = chosen !== null ? Number(chosen) : (post?.group ?? -1);
      st = g >= 0 ? (r ? r.stationOf(g) : run.stations[g]) : null;
    } else {
      st = chosen ?? post?.station ?? null;
      const s = run.stations.indexOf(st);
      g = st ? (r ? r.groupAt(st) : s < groupCount ? s : -1) : -1;
    }
  }
  const meta = stations.find((s) => s.id === st);
  const kids = g >= 0 ? run.groups[g] : [];
  const live = r && !r.done;
  // Station mode: the group arriving next. Group mode: where we go next.
  const nextG =
    !traveling && live && r.idx + 1 < r.total && st
      ? run.groups.findIndex((_, x) => r.nextStationOf(x) === st)
      : -1;
  const nextSt = traveling && live && g >= 0 ? r.nextStationOf(g) : null;
  const helping = run?.helpers?.includes(me.id);
  // The head coach (or the manager) can jump to running the class from
  // here, and anyone on the class can start attendance if no one has.
  const canLead =
    me.head || run?.lead === me.name || leadOf(state, block.index) === me.id;
  const onClass = classCrew(state, block, now).some((c) => c.staffId === me.id);
  const toClass = (canLead || (!run && onClass)) && (
    <button
      className="button cyan compact"
      onClick={() => ops.enter(block, "head")}
    >
      {!run
        ? "Take attendance"
        : !run.groups
          ? "Back to attendance"
          : run.startedAt
            ? "Run the class"
            : "Groups and start"}{" "}
      <ArrowRight size={16} />
    </button>
  );
  const picker = run?.groups && (
    <label className="cf-pill-select">
      <span className="sr-only">{traveling ? "Group" : "Station"}</span>
      {traveling ? (
        <select
          value={g >= 0 ? String(g) : ""}
          onChange={(e) =>
            setChosen(e.target.value === "" ? null : e.target.value)
          }
        >
          {g < 0 && <option value="">Pick a group</option>}
          {run.groups.map((_, i) => (
            <option key={i} value={String(i)}>
              Group {i + 1}
              {i === post?.group ? " (mine)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <select
          value={st ?? ""}
          onChange={(e) => setChosen(e.target.value || null)}
        >
          {!st && <option value="">Pick a station</option>}
          {run.stations.map((id) => (
            <option key={id} value={id}>
              {stationLabel(id)}
              {id === post?.station ? " (mine)" : ""}
            </option>
          ))}
        </select>
      )}
      <ChevronDown size={14} />
    </label>
  );
  const hold = () =>
    ops.run(r.paused ? "Clock running again." : "Clock on hold.", (s) =>
      applyGym(s, {
        type: r.paused ? "resume" : "hold",
        session: block.id,
        actor: ops.actor,
      }),
    );
  const role = helping
    ? "Helping"
    : run?.lead === me.name || leadOf(state, block.index) === me.id
      ? "Head coach"
      : traveling
        ? "Group coach"
        : "Station coach";
  return (
    <>
      <Masthead kind="station">
        <Hero
          eyebrow={`${role} · ${block.name} · ${clock(block.start)}–${clock(block.end)}`}
          title={meta ? meta.name : traveling ? "Your group" : "Your station"}
          lead={
            !run?.groups
              ? run
                ? `${run.lead} is taking attendance. ${checkinsFor(state, block.id).length} kids in so far. ${traveling ? "Your group" : "Your station"} shows up when the groups are made.`
                : canLead || onClass
                  ? "Attendance hasn't started. Take attendance to check kids in and make the groups."
                  : "Attendance hasn't started. You'll see your kids when the head coach makes the groups."
              : !meta
                ? traveling
                  ? "You don't have a group in this class. Pick one to follow along."
                  : "You aren't on a station in this class. Pick one to follow along."
                : r?.warmup
                  ? `Warm-up. ${traveling ? `Group ${g + 1} starts` : "You start"} at ${meta.name}: ${focusAt(plan, st)}`
                  : focusAt(plan, st)
          }
          actions={
            <>
              {toClass}
              {picker}
              {live && (
                <button className="button outline-light compact" onClick={hold}>
                  {r.paused ? <Play size={16} /> : <Pause size={16} />}{" "}
                  {r.paused ? "Resume" : "Hold"}
                </button>
              )}
            </>
          }
          aside={
            run?.startedAt ? (
              <TimerRing run={run} />
            ) : run?.groups && g >= 0 ? (
              <div className="cf-bignum">
                <strong>{g + 1}</strong>
                <small>
                  {traveling ? "your group all class" : "group starts with you"}
                </small>
              </div>
            ) : null
          }
        />
      </Masthead>
      <main className="cf-main">
        {r?.done ? (
          <BonusPicker
            ops={ops}
            block={block}
            ids={run.groups.flat()}
            title="Class is done"
          />
        ) : (
          g >= 0 && (
            <>
              <SectionHead
                title={`Group ${g + 1} · ${kids.length} kids`}
                note={
                  traveling
                    ? "With you all class."
                    : r
                      ? "With you now."
                      : "Starts with you when the class begins."
                }
              >
                <TenureLegend />
              </SectionHead>
              {groupLimit(state, kids).over && (
                <p className="cf-flag f-pastDue cf-ratio-flag">
                  <AlertTriangle size={12} /> {kids.length} kids for one coach
                  (1:{groupLimit(state, kids).limit}). Split the lanes or ask
                  the head coach for help.
                </p>
              )}
              <div className="cf-rows">
                {kids.map((id) => (
                  <KidRow
                    key={id}
                    ops={ops}
                    id={id}
                    stationId={st}
                    prefer={focusSkills(plan, st)}
                    tags={handoffsFor(run, id)
                      .slice(0, 2)
                      .map((h) => (
                        <em key={h.id} className="cf-handoff" title={h.text}>
                          {firstName(h.by)}: {h.text}
                        </em>
                      ))}
                  />
                ))}
              </div>
              <Handoff ops={ops} block={block} kids={kids} />
              {nextG >= 0 && (
                <div className="card cf-upnext">
                  <span className="eyebrow">Up next · group {nextG + 1}</span>
                  <div className="cf-names">
                    {run.groups[nextG].map((id) => (
                      <span key={id} className="cf-namechip">
                        <KidFace id={id} state={state} now={now} size={26} />
                        {kidById(id).first}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {nextSt && (
                <div className="card cf-upnext">
                  <span className="eyebrow">
                    Up next · {stationLabel(nextSt)}
                  </span>
                  <p className="cf-group-focus">{focusAt(plan, nextSt)}</p>
                  {coachAt(run, nextSt, r) && (
                    <small className="cc-muted">
                      {firstName(staffName(coachAt(run, nextSt, r)))}'s group is
                      there now. Swap on the call.
                    </small>
                  )}
                </div>
              )}
            </>
          )
        )}
      </main>
    </>
  );
}

// One line for whoever has a kid next: "sore wrist, keep off rings".
function Handoff({ ops, block, kids }) {
  const [childId, setChildId] = useState("");
  const [text, setText] = useState("");
  if (!kids.length) return null;
  const send = (e) => {
    e.preventDefault();
    if (
      ops.run(`Note passed on for ${kidById(childId).first}.`, (s) =>
        applyGym(s, {
          type: "handoff",
          session: block.id,
          childId,
          text,
          actor: ops.actor,
        }),
      )
    ) {
      setText("");
      setChildId("");
    }
  };
  return (
    <form className="card cf-handoff-form" onSubmit={send}>
      <span className="eyebrow">Pass a note to the next coach</span>
      <div className="cf-handoff-row">
        <select
          aria-label="Kid"
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
        >
          <option value="">Kid…</option>
          {kids.map((id) => (
            <option key={id} value={id}>
              {kidById(id).first}
            </option>
          ))}
        </select>
        <input
          aria-label="Note"
          maxLength={140}
          placeholder="Sore wrist, keep off rings"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="button navy compact"
          disabled={!childId || !text.trim()}
        >
          Pass it on
        </button>
      </div>
    </form>
  );
}

/* ---------- Kids ---------- */

function KidsView({ ops }) {
  const { state, now } = ops;
  const [query, setQuery] = useState("");
  const here = hereNow(state, now).map((p) => p.childId);
  const searching = query.trim().length >= 2;
  const list = searching ? findKids(query).map((k) => k.id) : here;
  return (
    <>
      <Masthead>
        <Hero
          eyebrow={`${here.length} in the building`}
          title={["Find a", "kid."]}
        >
          <SearchField
            value={query}
            onChange={setQuery}
            label="Search kids"
            placeholder="Name, parent or phone number"
          />
        </Hero>
      </Masthead>
      <main className="cf-main">
        <SectionHead
          title={
            searching
              ? `Matches · ${list.length}`
              : `Here today · ${list.length}`
          }
        >
          <TenureLegend />
        </SectionHead>
        {!list.length && (
          <p className="cf-empty card">
            {searching
              ? `No kids match “${query}”.`
              : "No one is checked in yet."}
          </p>
        )}
        <div className="cf-rows">
          {list.map((id) => (
            <KidRow key={id} ops={ops} id={id} />
          ))}
        </div>
      </main>
    </>
  );
}

/* ---------- Kid sheet ---------- */

function KidSheet({ ops, id, onClose }) {
  const { state, now } = ops;
  const kid = kidById(id);
  const fam = families.find((f) => f.id === kidInfo[id]?.family);
  const m = member(state, id);
  const t = tenure(state, id, now);
  const today = starsToday(state, id, now);
  const ready = stations
    .map((s) => ({ s, list: nextSkills(state, id, s.id).slice(0, 2) }))
    .filter((x) => x.list.length);
  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="sheet cf-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${kid.name} profile`}
      >
        <header className="sheet-head">
          <span className="eyebrow">{fam?.name}</span>
          <button className="kp-close" aria-label="Close" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <div className="cf-sheet-who">
          <KidFace id={id} state={state} now={now} size={72} />
          <div>
            <h2>{kid.name}</h2>
            <div className="cf-tags">
              <small>Age {kid.age}</small>
              <TierChip state={state} id={id} />
              <TenureTag state={state} id={id} now={now} />
              <FlagChips state={state} id={id} now={now} />
            </div>
            <p>
              {t
                ? t.label
                : `Member since ${m?.joined ? calendarMonthYear(m.joined) : "—"}`}{" "}
              · +{pointsLabel(kid, today)} today
            </p>
          </div>
        </div>
        {kidInfo[id]?.care && <p className="cc-banner">{kidInfo[id].care}</p>}
        <VisitStrip state={state} id={id} />
        <div className="cf-sheet-level">
          <b>Level</b>
          <LevelPick ops={ops} id={id} label={false} />
        </div>
        <h3>Next skills by station</h3>
        <div className="cf-lines">
          {ready.map(({ list }) =>
            list.map((skill) => (
              <div key={skill.id} className="cf-line cf-skill">
                <SkillLine skill={skill} showStation />
                <span className="cf-skill-acts">
                  <button
                    className="button outline compact"
                    onClick={() =>
                      ops.run(`Practice logged for ${kid.first}.`, (st) =>
                        apply(st, {
                          type: "practice",
                          childId: id,
                          skillId: skill.id,
                        }),
                      )
                    }
                  >
                    Worked on it
                  </button>
                  <button
                    className="button mint compact"
                    onClick={(e) => {
                      if (
                        ops.run(
                          `${kid.first} unlocked ${skill.title}. +${pointsLabel(kid, skillStars(skill))}`,
                          (st) => checkOff(st, ops.actor, id, skill.id),
                          {
                            spark: e.currentTarget,
                          },
                        )
                      )
                        ops.celebrate(id, skill);
                    }}
                  >
                    <Check size={16} /> Got it
                  </button>
                </span>
              </div>
            )),
          )}
          {!ready.length && (
            <p className="cc-muted">No skills ready right now.</p>
          )}
        </div>
        {fam && (
          <p className="cc-muted">
            {fam.guardian} ·{" "}
            {fam.guardians[0].phone.replace(
              /^\+1(\d{3})(\d{3})(\d{4})$/,
              "($1) $2-$3",
            )}
          </p>
        )}
      </section>
    </div>
  );
}

// The last six weeks, one square a day.
function VisitStrip({ state, id }) {
  const days = kidVisits(state, id, 42);
  const count = days.filter((d) => d.here).length;
  const lastIdx = days.map((d) => d.here).lastIndexOf(true);
  const ago = lastIdx < 0 ? null : days.length - 1 - lastIdx;
  return (
    <div className="cf-visits">
      <div className="cf-visits-head">
        <b>Last 6 weeks</b>
        <small>
          {count} visits ·{" "}
          {ago === null
            ? "no visits yet"
            : ago === 0
              ? "here today"
              : `last here ${ago} day${ago === 1 ? "" : "s"} ago`}
        </small>
      </div>
      <div
        className="cf-visits-grid"
        role="img"
        aria-label={`${count} visits in the last 6 weeks`}
      >
        {days.map((d) => (
          <i key={d.date} className={d.here ? "is-here" : ""} title={d.date} />
        ))}
      </div>
      <ShirtProgress state={state} id={id} />
    </div>
  );
}

// A short, skippable moment when a kid lands a skill.
function Celebration({ party, onDone }) {
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [party, onDone]);
  if (!party) return null;
  const kid = kidById(party.id);
  return (
    <div className="cf-party" role="status" onClick={onDone}>
      <div className="cf-party-card">
        <Badge
          label={skillNumber(party.skill.id)}
          state="earned"
          className="badge-lg"
        />
        <span className="eyebrow">Skill unlocked</span>
        <h2>{party.skill.title}</h2>
        <p>
          {kid.first} · +{pointsLabel(kid, skillStars(party.skill))}
        </p>
      </div>
    </div>
  );
}

/* ---------- Staffing ---------- */

function StaffView({ ops, tab, setTab }) {
  const { me } = ops;
  const tabs = staffTabs(me);
  const current = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  return (
    <div className="st-page">
      <Masthead>
        <Hero
          eyebrow={me.owner ? "Owner" : me.head ? "Gym manager" : me.name}
          title={staffTitles[current]}
          lead={staffLeads[current]}
        >
          <div className="cf-hero-tabs" role="tablist" aria-label="Shifts">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={current === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </Hero>
      </Masthead>
      <main className="cf-main">
        <StaffPanel ops={ops} tab={current} />
      </main>
    </div>
  );
}

/* ---------- Manager ---------- */

function ManageView({ ops, tab, setTab }) {
  const { me } = ops;
  const tabs = me.head
    ? [
        ["insights", "Insights"],
        ["team", "Coaches"],
        ["desk", "Front desk"],
        ["members", "Members"],
        ["plans", "Plans & crew"],
      ]
    : [["plans", "Plans & crew"]];
  const titles = {
    insights: ["Floor", "insights."],
    team: ["The", "team."],
    desk: ["Front", "desk."],
    members: ["Spark", "members."],
    plans: ["Plans", "& crew."],
  };
  const leads = {
    insights: "How the floor is running, and which new kids need a call.",
    team: "Who's checking kids in, how fast, and who's unlocking skills.",
    desk: "Check-ins to follow up: no desk visit, past due or not active.",
    members:
      "Spark membership: who's active, who's past due, when they joined.",
    plans: "This week's stations for each class, and who works each block.",
  };
  return (
    <>
      <Masthead>
        <Hero
          eyebrow={me.owner ? "Owner" : me.head ? "Gym manager" : "Head coach"}
          title={titles[tab]}
          lead={leads[tab]}
        >
          <div className="cf-hero-tabs" role="tablist" aria-label="Manage">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </Hero>
      </Masthead>
      <main className="cf-main">
        {tab === "insights" && (
          <Suspense fallback={<p className="cf-main">Loading insights…</p>}>
            <InsightsTab ops={ops} />
          </Suspense>
        )}
        {tab === "team" && <TeamTab ops={ops} />}
        {tab === "desk" && <DeskTab ops={ops} />}
        {tab === "members" && <MembersTab ops={ops} />}
        {tab === "plans" && <PlansTab ops={ops} />}
      </main>
    </>
  );
}

function TeamTab({ ops }) {
  const { state, now } = ops;
  const [range, setRange] = useState(7);
  const from = new Date(now.getTime() - range * 86400000);
  const rows = coachStats(state, from);
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  const waits = rows.filter((r) => r.deskWait !== null);
  const avgWait = waits.length
    ? waits.reduce((n, r) => n + r.deskWait, 0) / waits.length
    : null;
  const top = rows
    .slice()
    .sort((a, b) => b.skills - a.skills || b.checkins - a.checkins)[0];
  return (
    <>
      <div className="cf-toolbar">
        <div className="cc-filter" role="group" aria-label="Range">
          {[
            [1, "Today"],
            [7, "7 days"],
            [30, "30 days"],
          ].map(([d, l]) => (
            <button
              key={d}
              aria-pressed={range === d}
              onClick={() => setRange(d)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="stat-strip cf-strip four">
        <section className="stat-tile tile-sky">
          <span className="eyebrow">Check-ins</span>
          <strong className="stat-value">
            <CountUp value={sum("checkins")} />
          </strong>
          <b>kids put on the floor</b>
        </section>
        <section className="stat-tile tile-mint">
          <span className="eyebrow">Desk to floor</span>
          <strong className="stat-value">
            {avgWait === null ? "—" : Math.round(avgWait)}
            {avgWait !== null && <small>min</small>}
          </strong>
          <b>average wait</b>
        </section>
        <section className="stat-tile tile-lime">
          <span className="eyebrow">Unlocks</span>
          <strong className="stat-value">
            <CountUp value={sum("skills")} />
          </strong>
          <b>skills checked off</b>
        </section>
        <section className="stat-tile tile-lavender">
          <span className="eyebrow">Bonus picks</span>
          <strong className="stat-value">
            <CountUp value={sum("bonuses")} />
          </strong>
          <b>given out</b>
        </section>
      </div>
      <>
        {top && (top.skills > 0 || top.checkins > 0) && (
          <section className="card cf-bonus cf-leader">
            <span className="eyebrow">Leading the floor</span>
            <h3>{top.staff.name}</h3>
            <p>
              {plural(top.skills, "skill", "skills")} unlocked ·{" "}
              {plural(top.checkins, "check-in", "check-ins")} ·{" "}
              {plural(top.bonuses, "bonus pick", "bonus picks")}
            </p>
          </section>
        )}
        <section className="card cf-panel">
          <h3>By coach</h3>
          <div className="cc-table cf-table" role="table">
            <div role="row" className="cc-tr cc-th">
              <span role="columnheader">Coach</span>
              <span role="columnheader">Check-ins</span>
              <span role="columnheader">Desk to floor</span>
              <span role="columnheader">Classes</span>
              <span role="columnheader">Attendance</span>
              <span role="columnheader">Skills</span>
              <span role="columnheader">Bonus</span>
            </div>
            {rows.map((r) => (
              <div role="row" className="cc-tr" key={r.staff.id}>
                <span role="cell" className="cf-coachcell">
                  <span className="cf-mark">{r.staff.initials}</span>
                  {r.staff.name}
                </span>
                <span role="cell" data-label="Check-ins">
                  {r.checkins}
                </span>
                <span role="cell" data-label="Desk to floor">
                  {minutesLabel(r.deskWait)}
                </span>
                <span role="cell" data-label="Classes">
                  {r.classes}
                </span>
                <span role="cell" data-label="Attendance">
                  {r.attendance === null
                    ? "—"
                    : r.attendance <= 0
                      ? "On time"
                      : `+${Math.round(r.attendance)} min`}
                </span>
                <span role="cell" data-label="Skills">
                  {r.skills}
                </span>
                <span role="cell" data-label="Bonus">
                  {r.bonuses}
                </span>
              </div>
            ))}
          </div>
          <p className="cc-muted">
            Attendance: minutes after the class start time until the head coach
            finished attendance.
          </p>
        </section>
      </>
    </>
  );
}

function DeskTab({ ops }) {
  const { state, now } = ops;
  const rows = deskIssues(state, now);
  const name = (sid) =>
    sessions(now, ops.state).find((s) => s.id === sid)?.name ?? "Earlier";
  return (
    <section className="card cf-panel">
      <h3>Today · {rows.length}</h3>
      {!rows.length && <p className="cc-muted">Nothing to follow up.</p>}
      <div className="cf-lines">
        {rows.map((c) => (
          <div key={c.id} className="cf-line">
            <KidFace id={c.childId} state={state} now={now} size={40} />
            <b>{kidById(c.childId).name}</b>
            <span>
              {name(c.session)} · {c.by} · {clockTime(c.at)}
            </span>
            <span className="cf-tags">
              {!c.deskAt && (
                <em className="cf-flag f-desk">Not at front desk</em>
              )}
              {c.pastDue && <em className="cf-flag f-pastDue">Past due</em>}
              {c.inactive && <em className="cf-flag f-inactive">Not active</em>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MembersTab({ ops }) {
  const { state, now } = ops;
  const g = gymOf(state);
  const [text, setText] = useState("");
  const all = Object.entries(g.members);
  const pastDue = all.filter(([, m]) => m.pastDue);
  const fresh = people.filter((p) => tenure(state, p.id, now));
  const unrated = people.filter((p) => !levelOf(state, p.id));
  return (
    <>
      <div className="stat-strip cf-strip four">
        <section className="stat-tile tile-sky">
          <span className="eyebrow">Active</span>
          <strong className="stat-value">
            {all.filter(([, m]) => m.status === "active").length}
          </strong>
          <b>members</b>
        </section>
        <section className="stat-tile tile-mint">
          <span className="eyebrow">Past due</span>
          <strong className="stat-value">{pastDue.length}</strong>
          <b>flagged at check-in</b>
        </section>
        <section className="stat-tile tile-lime">
          <span className="eyebrow">New</span>
          <strong className="stat-value">{fresh.length}</strong>
          <b>in their first 60 days</b>
        </section>
        <section className="stat-tile tile-lavender">
          <span className="eyebrow">No level</span>
          <strong className="stat-value">{unrated.length}</strong>
          <b>coaches set it at first check-in</b>
        </section>
      </div>
      <div className="cf-wrap-grid">
        <section className="card cf-panel">
          <h3>Update from Spark</h3>
          <p className="cc-muted">
            Last updated {gymSyncedAt(g.spark.syncedAt)} from {g.spark.source}
            {g.spark.matched ? ` · ${g.spark.matched} matched` : ""}
            {g.spark.unmatched?.length
              ? ` · not on the roster: ${g.spark.unmatched.join(", ")}`
              : ""}
          </p>
          <label className="cf-field wide">
            <span>Paste an export: first, last, status, past due, joined</span>
            <textarea
              rows={5}
              value={text}
              placeholder={
                "first,last,status,past_due,joined\nTheo,Parker,active,no,2025-03-14"
              }
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="cf-toolbar">
            <label className="button outline compact">
              Choose a CSV file
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setText(await f.text());
                }}
              />
            </label>
            <button
              className="button navy compact"
              disabled={!text.trim()}
              onClick={() => {
                if (
                  ops.run("Membership updated.", (s) =>
                    applyGym(s, {
                      type: "import",
                      text,
                      source: "Spark export",
                      actor: ops.actor,
                    }),
                  )
                )
                  setText("");
              }}
            >
              Update members
            </button>
          </div>
        </section>
        <section className="card cf-panel">
          <h3>Past due</h3>
          <div className="cf-lines">
            {pastDue.map(([id]) => (
              <button
                key={id}
                className="cf-line"
                onClick={() => ops.openKid(id)}
              >
                <KidFace id={id} state={state} now={now} size={36} />
                <b>{kidById(id).name}</b>
                <em className="cf-flag f-pastDue">Past due</em>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

// Plans & crew: pick a block on the left, edit it on the right. Edits stay
// as drafts per block until one Save writes all of them.
const clockMin = (m) =>
  clock(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function PlansTab({ ops }) {
  const { state, now, me } = ops;
  // Every block on the weekly template, not just today's: a class that
  // doesn't run today can still be planned and staffed.
  const blocks = scheduleOf(state)
    .blocks.filter((b) => !b.effectiveUntil || b.effectiveUntil >= dayKey(now))
    .map((b) => sessionFromId(state, `${dayKey(now)}:${b.id}`))
    .sort(byStart);
  const canPlanFor = (b) =>
    b.kind === "class" && (me.head || leadOf(state, b.index) === me.id);
  const [pick, setPick] = useState(
    () => (blocks.find(canPlanFor) ?? blocks[0]).index,
  );
  const [drafts, setDrafts] = useState({});
  const block = blocks.find((b) => b.index === pick) ?? blocks[0];
  const savedOf = (b) => ({
    crew: crewFor(state, b.index),
    plan: planFor(state, b.index),
  });
  const draftOf = (b) => ({ ...savedOf(b), ...drafts[b.index] });
  const changed = blocks.filter(
    (b) => drafts[b.index] && !same(draftOf(b), savedOf(b)),
  );
  const edit = (patch) =>
    setDrafts((d) => ({
      ...d,
      [block.index]: { ...savedOf(block), ...d[block.index], ...patch },
    }));
  const save = () => {
    const ok = ops.run(
      changed.length > 1
        ? `${changed.length} blocks saved.`
        : `${changed[0].name} saved.`,
      (s) =>
        changed.reduce((n, b) => {
          const d = draftOf(b);
          let out = n;
          if (!same(d.crew, crewFor(n, b.index)))
            out = applyGym(out, {
              type: "crew",
              index: b.index,
              crew: d.crew,
              actor: ops.actor,
            });
          if (b.kind === "class" && !same(d.plan, planFor(n, b.index)))
            out = applyGym(out, {
              type: "plan",
              index: b.index,
              plan: d.plan,
              actor: ops.actor,
            });
          return out;
        }, s),
    );
    if (ok) setDrafts({});
  };
  return (
    <div className="pl">
      <nav className="pl-rail" aria-label="Blocks today">
        <Eyebrow tone="muted">Today's blocks</Eyebrow>
        {blocks.map((b) => (
          <button
            key={b.id}
            className="pl-block"
            aria-current={b.index === block.index ? "true" : undefined}
            onClick={() => setPick(b.index)}
          >
            <span className="pl-time">
              <b>{clock(b.start)}</b>
              <small>{clock(b.end)}</small>
            </span>
            <span className="pl-block-main">
              <b>{b.name}</b>
              <small>
                {b.kind === "class" ? `Class · ages ${b.ages}` : "Open gym"}
              </small>
            </span>
            <span className="pl-block-end">
              <CoachStack crew={draftOf(b).crew} size={28} />
              {changed.includes(b) && <Tag tone="warn">Unsaved</Tag>}
            </span>
          </button>
        ))}
      </nav>
      <BlockEditor
        key={block.id}
        ops={ops}
        block={block}
        draft={draftOf(block)}
        edit={edit}
        canCrew={me.head}
        canPlan={canPlanFor(block)}
      />
      <SaveBar
        show={changed.length > 0}
        message={
          changed.length > 1
            ? `${changed.length} blocks changed`
            : `${changed[0]?.name}: unsaved`
        }
        saveLabel={changed.length > 1 ? "Save all" : "Save"}
        onSave={save}
        onDiscard={() => setDrafts({})}
      />
    </div>
  );
}

function CoachStack({ crew, size = 30 }) {
  return (
    <span className="pl-stack">
      {crew.map((c) => {
        const s = staff.find((x) => x.id === c.staffId);
        return (
          <CoachMark
            key={c.staffId}
            initials={s.initials}
            role={c.role}
            size={size}
            title={`${s.name} · ${roleNames[c.role]}`}
          />
        );
      })}
    </span>
  );
}

function BlockEditor({ ops, block, draft, edit, canCrew, canPlan }) {
  const { crew, plan } = draft;
  const isClass = block.kind === "class";
  const length = toMinutes(block.end) - toMinutes(block.start);
  const used = plan.warmup + plan.stations.length * plan.minutes;
  const readOnly = !canCrew && !canPlan;
  return (
    <div className="pl-editor">
      <Card tone="ink" className="pl-head">
        <div className="pl-head-top">
          <div>
            <Eyebrow tone="sky">
              {isClass ? `Class · ages ${block.ages}` : "Open gym"}
            </Eyebrow>
            <h2 className="ds-h2">{block.name}</h2>
            <p className="ds-note">
              {clock(block.start)}–{clock(block.end)} · {length} min
            </p>
          </div>
          <div className="pl-head-tags">
            {isClass &&
              (plan.week ? (
                <Tag tone="good" icon={Check}>
                  Planned week of {plan.week.slice(5).replace("-", "/")}
                  {plan.by ? ` · ${firstName(plan.by)}` : ""}
                </Tag>
              ) : (
                <Tag tone="neutral">Default plan</Tag>
              ))}
            {readOnly && (
              <Tag tone="outline" icon={Lock}>
                View only
              </Tag>
            )}
          </div>
        </div>
        {isClass ? (
          <RotationBar block={block} plan={plan} length={length} />
        ) : (
          <CoachStack crew={crew} size={40} />
        )}
      </Card>

      <CrewSection
        block={block}
        crew={crew}
        canCrew={canCrew}
        onChange={(next) => edit({ crew: next })}
      />

      <BlockSchedule ops={ops} block={block} />

      {isClass && (
        <ClassShape
          block={block}
          plan={plan}
          crew={crew}
          length={length}
          canPlan={canPlan}
          onChange={(p) => edit({ plan: p })}
        />
      )}

      {isClass && (
        <Section
          title="Stations"
          note={
            canPlan
              ? "Kids rotate through in this order. Coaches see the focus and skills on their station screen."
              : "The head coach or the gym manager sets these."
          }
          toolbar={
            <>
              <Tag tone={used > length ? "warn" : "info"} icon={Timer}>
                {plan.warmup ? `${plan.warmup} warm-up + ` : ""}
                {plan.stations.length} × {plan.minutes} = {used} of {length} min
              </Tag>
              {canPlan && (
                <Segmented
                  label="Minutes at each station"
                  value={plan.minutes}
                  options={[...new Set([8, 10, 12, 15, 20, plan.minutes])]
                    .sort((a, b) => a - b)
                    .map((m) => ({ value: m, label: `${m} min` }))}
                  onChange={(m) => edit({ plan: { ...plan, minutes: m } })}
                />
              )}
            </>
          }
        >
          <div className="pl-stations">
            {plan.stations.map((s, i) => (
              <StationCard
                key={`${s.station}-${i}`}
                block={block}
                plan={plan}
                i={i}
                canPlan={canPlan}
                onChange={(p) => edit({ plan: p })}
              />
            ))}
            {canPlan && plan.stations.length < stations.length && (
              <button
                className="pl-add"
                onClick={() => {
                  const free = stations.find(
                    (x) => !plan.stations.some((s) => s.station === x.id),
                  );
                  edit({
                    plan: {
                      ...plan,
                      stations: [
                        ...plan.stations,
                        {
                          station: free.id,
                          focus: stationFocus[free.id],
                          skills: [],
                        },
                      ],
                    },
                  });
                }}
              >
                <Plus size={22} aria-hidden="true" />
                <b>Add a station</b>
                <small>
                  {plural(
                    stations.length - plan.stations.length,
                    "station",
                    "stations",
                  )}{" "}
                  not in the rotation
                </small>
              </button>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// How the class runs: the warm-up, whether coaches stay at stations or
// travel with their groups, and what the class looks like with one, two
// or three coaches, so the plan holds whoever turns up.
function ClassShape({ block, plan, crew, length, canPlan, onChange }) {
  const coachCount = crew.filter((c) =>
    ["head", "station"].includes(c.role),
  ).length;
  // One, two and three coaches, plus this week's crew if it's bigger.
  const crewShape = Math.min(coachCount, stations.length);
  const counts = [...new Set([1, 2, 3, crewShape])]
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
  const shapes = counts.map((n) => {
    const mode = n === 1 ? "group" : modeFor(plan, n);
    const count =
      mode === "group"
        ? Math.max(n, plan.stations.length)
        : Math.min(n, stations.length);
    const rounds = fitRounds(length, plan.warmup, count, plan.minutes);
    const time = classTimeline(length, {
      warmup: plan.warmup,
      minutes: plan.minutes,
      stations: count,
      rounds,
    });
    return {
      n,
      mode,
      rounds,
      time,
      text:
        n === 1
          ? `The whole class moves together through ${plural(count, "station", "stations")}`
          : mode === "group"
            ? `${n} groups, each with its coach, through ${plural(count, "station", "stations")}`
            : `${n} coaches hold ${plural(count, "station", "stations")} and ${n} groups rotate`,
    };
  });
  return (
    <Section
      title="How the class runs"
      note="The same plan works with one, two or three coaches. On the day the head coach can still change the groups, timing and how coaches move."
      toolbar={
        canPlan && (
          <>
            <Segmented
              size="sm"
              label="Warm-up"
              value={plan.warmup}
              options={[...new Set([0, 5, 8, 10, plan.warmup])]
                .sort((a, b) => a - b)
                .map((m) => ({
                  value: m,
                  label: m ? `${m}-min warm-up` : "No warm-up",
                }))}
              onChange={(m) => onChange({ ...plan, warmup: m })}
            />
            <Segmented
              size="sm"
              label="How the coaches move"
              value={plan.mode}
              options={[
                { value: "auto", label: "Pick for me" },
                ...Object.entries(coachModes).map(([value, m]) => ({
                  value,
                  label: m.label,
                })),
              ]}
              onChange={(m) => onChange({ ...plan, mode: m })}
            />
          </>
        )
      }
    >
      <div className="pl-shapes">
        {shapes.map((x) => (
          <Card
            key={x.n}
            pad="md"
            className={`pl-shape ${x.n === crewShape ? "is-crew" : ""}`.trim()}
          >
            <span className="pl-shape-n">
              <Users size={16} aria-hidden="true" />{" "}
              {plural(x.n, "coach", "coaches")}
              {x.n === crewShape && (
                <Tag tone="info">This week&rsquo;s crew</Tag>
              )}
            </span>
            <b>{x.text}</b>
            <small>
              {x.n > 1 ? `${coachModes[x.mode].label} · ` : ""}
              {x.rounds > 1 ? `${x.rounds} times through · ` : ""}
              {x.time.used} of {length} min
              {x.time.over ? " · runs over" : ""}
            </small>
          </Card>
        ))}
      </div>
    </Section>
  );
}

// The warm-up, each station's slot in the class, to scale, then the free
// run at the end.
function RotationBar({ block, plan, length }) {
  const start = toMinutes(block.start) + plan.warmup;
  const used = plan.warmup + plan.stations.length * plan.minutes;
  return (
    <div
      className="pl-rot"
      role="img"
      aria-label={`Rotation: ${plan.warmup ? `warm-up ${plan.warmup} min, ` : ""}${plan.stations.map((s, i) => `${i + 1} ${stationLabel(s.station)}`).join(", ")}`}
    >
      {plan.warmup > 0 && (
        <span className="pl-rot-warm" style={{ flex: plan.warmup }}>
          <em>Warm-up</em>
          <small>{clockMin(toMinutes(block.start))}</small>
        </span>
      )}
      {plan.stations.map((s, i) => (
        <span
          key={i}
          style={{
            flex: plan.minutes,
            "--st": `var(--ds-station-${s.station})`,
          }}
        >
          <b>{i + 1}</b>
          <em>{stationLabel(s.station)}</em>
          <small>{clockMin(start + i * plan.minutes)}</small>
        </span>
      ))}
      {used < length && (
        <span className="pl-rot-free" style={{ flex: length - used }}>
          <em>Free run</em>
          <small>{clockMin(start + used)}</small>
        </span>
      )}
    </div>
  );
}

function CrewSection({ block, crew, canCrew, onChange }) {
  const isClass = block.kind === "class";
  const roles = isClass ? ["head", "station"] : ["attendant"];
  const free = coaches.filter((s) => !crew.some((c) => c.staffId === s.id));
  // One head per class: naming a new head moves the old one to a station.
  const setRole = (id, role) =>
    onChange(
      crew.map((c) =>
        c.staffId === id
          ? { ...c, role }
          : role === "head" && c.role === "head"
            ? { ...c, role: "station" }
            : c,
      ),
    );
  const noHead = isClass && !crew.some((c) => c.role === "head");
  return (
    <Section
      title="Crew"
      note={
        isClass
          ? "A class can run with one coach or several. The head coach takes attendance and builds the groups, and can add a coach who is helping on the day."
          : "Coaches on the floor for open gym."
      }
      actions={
        noHead ? (
          <Tag tone="warn" icon={AlertTriangle}>
            No head coach
          </Tag>
        ) : !canCrew ? (
          <Tag tone="outline" icon={Lock}>
            The gym manager sets the crew
          </Tag>
        ) : null
      }
    >
      <div className="pl-crew">
        {crew.map((c) => {
          const s = staff.find((x) => x.id === c.staffId);
          return (
            <Card key={c.staffId} pad="md" className="pl-coach">
              <CoachMark initials={s.initials} role={c.role} size={44} />
              <span className="pl-coach-name">
                <b>{firstName(s.name)}</b>
                <small>{roleNames[c.role]}</small>
              </span>
              {canCrew && (
                <span className="pl-coach-tools">
                  {roles.length > 1 && (
                    <Segmented
                      size="sm"
                      label={`${firstName(s.name)}'s role`}
                      value={c.role}
                      options={roles.map((r) => ({
                        value: r,
                        label: r === "head" ? "Head" : "Station",
                      }))}
                      onChange={(r) => setRole(c.staffId, r)}
                    />
                  )}
                  <IconButton
                    label={`Take ${firstName(s.name)} off this block`}
                    icon={X}
                    tone="danger"
                    onClick={() =>
                      onChange(crew.filter((x) => x.staffId !== c.staffId))
                    }
                  />
                </span>
              )}
            </Card>
          );
        })}
        {canCrew && free.length > 0 && (
          <div className="pl-add pl-add-coach">
            <UserPlus size={22} aria-hidden="true" />
            <Field label="Add a coach" hideLabel>
              <Select
                value=""
                options={[
                  { value: "", label: "Add a coach…" },
                  ...free.map((s) => ({
                    value: s.id,
                    label: firstName(s.name),
                  })),
                ]}
                onChange={(id) =>
                  id &&
                  onChange([
                    ...crew,
                    {
                      staffId: id,
                      role:
                        isClass && !crew.some((c) => c.role === "head")
                          ? "head"
                          : roles[roles.length - 1],
                    },
                  ])
                }
              />
            </Field>
          </div>
        )}
        {!crew.length && !canCrew && (
          <Empty icon={Users} title="No one on this block yet" />
        )}
      </div>
    </Section>
  );
}

function StationCard({ block, plan, i, canPlan, onChange }) {
  const [open, setOpen] = useState(false);
  const s = plan.stations[i];
  const info = stations.find((x) => x.id === s.station);
  const start = toMinutes(block.start) + plan.warmup + i * plan.minutes;
  const pool = catalog.filter(
    (k) => k.category === stationCategory[s.station] && !k.special,
  );
  const picked = pool.filter((k) => (s.skills ?? []).includes(k.id));
  const set = (patch) =>
    onChange({
      ...plan,
      stations: plan.stations.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    });
  const move = (to) => {
    const list = plan.stations.slice();
    [list[i], list[to]] = [list[to], list[i]];
    onChange({ ...plan, stations: list });
  };
  const toggle = (id) =>
    set({
      skills: (s.skills ?? []).includes(id)
        ? s.skills.filter((x) => x !== id)
        : [...(s.skills ?? []), id],
    });
  return (
    <article
      className="pl-station"
      style={{ "--st": `var(--ds-station-${s.station})` }}
    >
      <header className="pl-station-band">
        <span className="pl-station-n">{i + 1}</span>
        <span className="pl-station-when">
          <b aria-hidden="true">{info.icon}</b>
          {clockMin(start)}–{clockMin(start + plan.minutes)}
        </span>
        {canPlan && (
          <span className="pl-station-tools">
            <IconButton
              label={`Move station ${i + 1} earlier`}
              icon={ArrowLeft}
              disabled={i === 0}
              onClick={() => move(i - 1)}
              size={16}
            />
            <IconButton
              label={`Move station ${i + 1} later`}
              icon={ArrowRight}
              disabled={i === plan.stations.length - 1}
              onClick={() => move(i + 1)}
              size={16}
            />
            <IconButton
              label={`Remove station ${i + 1}`}
              icon={Trash2}
              tone="danger"
              disabled={plan.stations.length < 2}
              onClick={() =>
                onChange({
                  ...plan,
                  stations: plan.stations.filter((_, j) => j !== i),
                })
              }
              size={16}
            />
          </span>
        )}
      </header>
      <div className="pl-station-body">
        {canPlan ? (
          <>
            <Field label="Station">
              <Select
                aria-label={`Station ${i + 1}`}
                value={s.station}
                options={stations
                  .filter(
                    (x) =>
                      x.id === s.station ||
                      !plan.stations.some((p) => p.station === x.id),
                  )
                  .map((x) => ({ value: x.id, label: x.name }))}
                onChange={(id) =>
                  set({ station: id, focus: stationFocus[id], skills: [] })
                }
              />
            </Field>
            <Field label="What to work on">
              <TextArea
                aria-label={`What to work on at station ${i + 1}`}
                value={s.focus}
                rows={2}
                onChange={(v) => set({ focus: v })}
              />
            </Field>
          </>
        ) : (
          <>
            <h3 className="ds-h3">{info.name}</h3>
            <p className="pl-focus">{s.focus}</p>
          </>
        )}
        <div className="pl-skills">
          <span className="ds-field-label">Skills to push</span>
          <div className="pl-chips">
            {(open ? pool : picked).map((k) => (
              <Chip
                key={k.id}
                on={(s.skills ?? []).includes(k.id)}
                disabled={!canPlan}
                onClick={() => toggle(k.id)}
              >
                {k.title}
              </Chip>
            ))}
            {!open && !picked.length && (
              <small className="pl-none">
                {canPlan
                  ? "None picked. Coaches see each kid's next skill."
                  : "None picked"}
              </small>
            )}
          </div>
          {canPlan && (
            <button
              className="pl-more"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open
                ? "Done choosing"
                : `Choose skills · ${picked.length} of ${pool.length}`}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---------- Shell ---------- */

export default function CoachApp({
  state,
  setState,
  account,
  onSignOut,
  onExit,
}) {
  const now = useNow(1000);
  const me = withLevel(
    state,
    staff.find((s) => s.id === account?.staffId) ?? staff[0],
  );
  const actor = {
    role: "Coach",
    name: me.name,
    staffId: me.id,
    head: me.head,
    owner: me.owner,
  };
  const [view, setViewState] = useState(
    () => readDevice().view ?? { id: "day" },
  );
  const [kid, setKid] = useState(null);
  const [toast, setToast] = useState(null);
  const [menu, setMenu] = useState(false);
  const meButton = useRef(null);
  const [legacy, setLegacy] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [party, setParty] = useState(null);
  const clearParty = useCallback(() => setParty(null), []);
  const setView = (v) => {
    setViewState(v);
    setMenu(false);
    writeDevice({ view: v });
    window.scrollTo?.(0, 0);
  };
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.prev ? 6000 : 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback(
    (message, fn, opts = {}) => {
      try {
        const prev = latest.current;
        const next = fn(prev);
        latest.current = next;
        setState(next);
        if (opts.spark && !opts.quiet) sparkFrom(opts.spark);
        navigator.vibrate?.(12);
        if (message && !opts.quiet) setToast({ id: Date.now(), message, prev });
        return true;
      } catch (e) {
        setToast({ id: Date.now(), message: e.message, error: true });
        navigator.vibrate?.([40, 30, 40]);
        return false;
      }
    },
    [setState],
  );
  const block = view.session
    ? sessions(now, state).find((s) => s.id === view.session)
    : null;
  // A saved view from another day goes back to Today.
  useEffect(() => {
    if (view.session && !block) setView({ id: "day" });
  });
  const enter = (b, role) =>
    setView({
      id:
        role === "head"
          ? "class"
          : role === "station" || role === "helper"
            ? "station"
            : "open",
      session: b.id,
    });
  const ops = {
    state,
    actor,
    me,
    now,
    run,
    openKid: setKid,
    home: () => setView({ id: "day" }),
    enter,
    celebrate: (id, skill) => setParty({ id, skill, at: Date.now() }),
  };

  // "Floor" opens the coach's live or next block; with none, any live block.
  const mine = myBlocks(state, me.id, now);
  const floorBlock =
    mine.find((b) => sessionPhase(b, now) === "live") ??
    mine.find((b) => sessionPhase(b, now) === "upcoming") ??
    sessions(now, state).find((b) => sessionPhase(b, now) === "live") ??
    null;
  const floorRole = floorBlock
    ? (floorBlock.role ?? (floorBlock.kind === "class" ? "head" : "attendant"))
    : null;
  const onFloor = ["class", "station", "open"].includes(view.id);
  const nav = [
    {
      id: "day",
      label: "Today",
      icon: CalendarDays,
      go: () => setView({ id: "day" }),
      active: view.id === "day",
    },
    {
      id: "floor",
      label: onFloor
        ? view.id === "open"
          ? "Open gym"
          : view.id === "station"
            ? "Station"
            : "Class"
        : floorBlock?.kind === "open"
          ? "Open gym"
          : "Class",
      short: "Floor",
      icon: Timer,
      go: () =>
        onFloor
          ? undefined
          : floorBlock
            ? enter(floorBlock, floorRole)
            : setView({ id: "day" }),
      active: onFloor,
    },
    {
      id: "kids",
      label: "Kids",
      icon: Users,
      go: () => setView({ id: "kids" }),
      active: view.id === "kids",
    },
    {
      id: "staff",
      label: "Shifts",
      icon: Clock,
      badge: staffBadge(state, me),
      go: () => setView({ id: "staff", tab: staffTabs(me)[0][0] }),
      active: view.id === "staff",
    },
    {
      id: "manage",
      label: me.head ? "Insights" : "Plans",
      icon: BarChart3,
      go: () => setView({ id: "manage", tab: me.head ? "insights" : "plans" }),
      active: view.id === "manage",
    },
  ];

  const simulate = () => {
    // Demo only: front-desk arrivals over the last half hour.
    const here = hereNow(state, now).map((p) => p.childId);
    const target =
      block?.kind === "class"
        ? rosterFor(block.index).map((p) => p.id)
        : people.map((p) => p.id);
    const pick = target
      .filter((id) => !here.includes(id))
      .filter((_, i) => i % 4 !== 3)
      .slice(0, 14);
    let next = state;
    pick.forEach((id, i) => {
      next = applyFloor(
        next,
        { type: "checkIn", childIds: [id], by: "Front desk" },
        new Date(Date.now() - (pick.length - i) * 2 * 60000),
      );
    });
    setState(next);
    setMenu(false);
    setToast({
      id: Date.now(),
      message: `${pick.length} front-desk arrivals added (demo).`,
    });
  };

  if (view.id === "map")
    return (
      <Suspense fallback={<div className="cc-loading" />}>
        <FloorTV
          state={state}
          setState={setState}
          session={{ ...account, kind: "staff", owner: me.owner }}
          onExit={() => setView({ id: "staff", tab: staffTabs(me)[0][0] })}
        />
      </Suspense>
    );
  if (legacy)
    return (
      <CoachCenter
        state={state}
        setState={setState}
        account={account}
        onSignOut={onSignOut}
        onExit={() => setLegacy(false)}
      />
    );
  return (
    <div className="app cf">
      <header className={`appbar ${scrolled ? "is-scrolled" : ""}`.trim()}>
        <div className="appbar-inner">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              ops.home();
            }}
          >
            <img
              src={`${import.meta.env.BASE_URL}lab-white.svg`}
              alt="The LAB — Learn. Adapt. Build."
            />
          </a>
          <nav className="primary-nav" aria-label="Coach navigation">
            {nav.map((n) => {
              const Icon = n.icon;
              return (
                <button
                  key={n.id}
                  className={n.active ? "nav-item active" : "nav-item"}
                  aria-current={n.active ? "page" : undefined}
                  onClick={n.go}
                >
                  <span className="nav-icon">
                    <Icon size={18} />
                  </span>
                  <span className="nav-label">{n.label}</span>
                  {n.badge > 0 && (
                    <span
                      className="nav-count"
                      aria-label={`${n.badge} waiting`}
                    >
                      {n.badge}
                    </span>
                  )}
                  <span className="nav-short" aria-hidden="true">
                    {n.short ?? n.label}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="appbar-controls">
            <LivePill ops={ops} />
            <div className="cf-me-wrap">
              <button
                ref={meButton}
                className="chip-select cf-me"
                aria-label={`${me.name} menu`}
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <span className="avatar cf-me-mark">{me.initials}</span>
                <span className="cf-me-name">{me.name}</span>
                <ChevronDown size={14} />
              </button>
              {menu && (
                <Menu
                  label={`${me.name} menu`}
                  anchor={meButton}
                  onClose={() => setMenu(false)}
                  person={{
                    initials: me.initials,
                    name: me.name,
                    role: me.owner
                      ? "Owner"
                      : me.head
                        ? "Gym manager"
                        : "Coach",
                  }}
                  groups={[
                    {
                      items: [
                        {
                          label: me.owner
                            ? "Gym map and floor plan"
                            : "Gym map",
                          onSelect: () => setView({ id: "map" }),
                        },
                        {
                          label: "More tools",
                          onSelect: () => setLegacy(true),
                        },
                        { label: "Kid and parent views", onSelect: onExit },
                      ],
                    },
                    {
                      title: "Demo",
                      items: [
                        {
                          label: "Simulate front-desk arrivals",
                          onSelect: simulate,
                        },
                        {
                          label: "Front desk kiosk",
                          href: "?kiosk",
                          external: true,
                        },
                      ],
                    },
                    { items: [{ label: "Sign out", onSelect: onSignOut }] },
                  ]}
                />
              )}
            </div>
          </div>
        </div>
      </header>
      {view.id === "day" && <DayView ops={ops} />}
      {view.id === "open" && block && (
        <OpenGymView key={block.id} ops={ops} block={block} />
      )}
      {view.id === "class" && block && (
        <ClassView key={block.id} ops={ops} block={block} />
      )}
      {view.id === "station" && block && (
        <StationView key={block.id} ops={ops} block={block} />
      )}
      {view.id === "kids" && <KidsView ops={ops} />}
      {view.id === "staff" && (
        <StaffView
          ops={ops}
          tab={view.tab}
          setTab={(tab) => setView({ id: "staff", tab })}
        />
      )}
      {view.id === "manage" && (
        <ManageView
          ops={ops}
          tab={me.head ? (view.tab ?? "insights") : "plans"}
          setTab={(tab) => setView({ id: "manage", tab })}
        />
      )}
      <Celebration party={party} onDone={clearParty} />
      {kid && <KidSheet ops={ops} id={kid} onClose={() => setKid(null)} />}
      {toast && (
        <div
          className={`cc-toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
          key={toast.id}
        >
          <span>{toast.message}</span>
          {toast.prev && (
            <button
              className="cc-undo"
              onClick={() => {
                setState(toast.prev);
                setToast({ id: Date.now(), message: "Undone." });
              }}
            >
              Undo
            </button>
          )}
          <button aria-label="Dismiss" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
