import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ClipboardCheck,
  Lock,
  MapPin,
  ScanLine,
  Search,
  Settings,
  Users,
  X,
  Zap,
} from "lucide-react";
import { apply, catalog, people, tiers } from "./domain.js";
import {
  clock,
  dayKey,
  isHere,
  prizes,
  sessionPhase,
  sessions,
  shoutouts,
  stations,
} from "./club.js";
import {
  applyFloor,
  arrival,
  birthdayIn,
  emptyFloor,
  eventsToday,
  hereNow,
  matchKid,
  readySkills,
  rosterFor,
  shirtGap,
  shirtsToHandOut,
  stationFor,
} from "./floor.js";
import { families, kidInfo, parsePass, staff } from "./roster.js";
import { savePhoto } from "./media.js";
import { CameraSheet, Scanner } from "./camera.jsx";
import { Avatar } from "./photos.jsx";
import { gymFullDay, gymHour } from "./gym-time.js";
import { sparkFrom } from "./motion.jsx";
import {
  KidTile,
  clockTime,
  coachAct,
  describeEvent,
  ensurePresent,
  points,
  recordAt,
  stationName,
} from "./coachkit.jsx";
import { AssessSheet, Celebrate, KidPanel } from "./CoachKid.jsx";
import "./coach.css";

const DEVICE = "lab-coach-device";
const LOCK_AFTER = 10 * 60 * 1000;
const readDevice = () => {
  try {
    return JSON.parse(localStorage.getItem(DEVICE)) ?? {};
  } catch {
    return {};
  }
};
const writeDevice = (patch) => {
  try {
    localStorage.setItem(DEVICE, JSON.stringify({ ...readDevice(), ...patch }));
  } catch {
    // A locked-down browser just forgets device preferences.
  }
};

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const byStart = (a, b) => a.start.localeCompare(b.start);
function defaultBlock(now) {
  const list = sessions(now).slice().sort(byStart);
  return (
    list.find((s) => sessionPhase(s, now) === "live") ??
    list.find((s) => sessionPhase(s, now) === "upcoming") ??
    list[list.length - 1]
  );
}

const tabs = [
  { id: "now", label: "Now", icon: Zap },
  { id: "class", label: "Class", icon: Users },
  { id: "station", label: "Station", icon: MapPin },
  { id: "kids", label: "Kids", icon: Search },
  { id: "wrap", label: "Wrap-up", icon: ClipboardCheck },
  {
    id: "admin",
    label: "Head coach",
    short: "Admin",
    icon: Settings,
    head: true,
  },
];

/* ---------- Sign-in and lock ---------- */

function PinPad({ onDone, locked, current }) {
  const [who, setWho] = useState(locked ? current : null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const press = (d) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setError("");
    if (next.length === 4) {
      if (next === who.pin) onDone(who);
      else {
        setError("That PIN doesn’t match.");
        setPin("");
        navigator.vibrate?.([40, 30, 40]);
      }
    }
  };
  return (
    <div className="cc-lock">
      <div className="cc-lock-inner">
        <img
          src={`${import.meta.env.BASE_URL}lab-white.svg`}
          alt="The LAB"
          className="cc-lock-logo"
        />
        {!who ? (
          <>
            <h1>Who’s coaching?</h1>
            <div className="cc-staff">
              {staff.map((s) => (
                <button key={s.id} onClick={() => setWho(s)}>
                  <span className="cc-staff-mark">{s.initials}</span>
                  <b>{s.name}</b>
                  {s.head && <small>Head coach</small>}
                </button>
              ))}
            </div>
            <p className="cc-lock-hint">
              Demo PINs: Jordan 1111 · Sam 2222 · Priya 3333 · Riley 4444 ·
              Morgan 5555 · Dev 6666 · Alex 9999
            </p>
          </>
        ) : (
          <>
            <h1>{locked ? "Locked" : who.name}</h1>
            <p className="cc-lock-sub">
              {locked ? `${who.name}, enter your PIN.` : "Enter your PIN."}
            </p>
            <div
              className="cc-pin-dots"
              aria-label={`${pin.length} of 4 digits`}
            >
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i < pin.length ? "on" : ""} />
              ))}
            </div>
            <p className="cc-pin-error" role="alert">
              {error}
            </p>
            <div className="cc-keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} onClick={() => press(d)}>
                  {d}
                </button>
              ))}
              <button
                className="cc-key-text"
                onClick={() => {
                  setWho(null);
                  setPin("");
                }}
              >
                {locked ? "Switch" : "Back"}
              </button>
              <button onClick={() => press("0")}>0</button>
              <button
                className="cc-key-text"
                aria-label="Delete digit"
                onClick={() => setPin(pin.slice(0, -1))}
              >
                ⌫
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Views ---------- */

function Stat({ value, label, onClick, tone = "" }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`cc-stat ${tone}`.trim()} onClick={onClick}>
      <strong>{value}</strong>
      <span>{label}</span>
    </Tag>
  );
}

function NowView({ ops, now, go }) {
  const { state, actor, block } = ops;
  const here = hereNow(state, now);
  const hereKids = here
    .map((p) => people.find((k) => k.id === p.childId))
    .filter(Boolean);
  const pending = (state.club?.events ?? []).filter(
    (e) => e.status === "pending" && dayKey(e.at) === dayKey(now),
  );
  const followUps = (state.floor?.notes ?? []).filter(
    (n) => n.followUp && !n.done,
  );
  const handouts = hereKids.flatMap((k) =>
    shirtsToHandOut(state, k.id).map((r) => ({
      kid: k,
      label: `${tiers[r.tier - 1].name} tee · ${r.size}`,
    })),
  );
  const prizeHandouts = hereKids.flatMap((k) =>
    (state.club?.claims ?? [])
      .filter((r) => r.childId === k.id && r.status === "Requested")
      .map((r) => ({
        kid: k,
        label: prizes.find((p) => p.id === r.prizeId)?.name,
      })),
  );
  const close = hereKids
    .map((k) => ({ kid: k, gap: shirtGap(state, k.id) }))
    .filter(({ gap }) => !gap.complete && gap.left.length <= 2);
  const care = hereKids.filter((k) => kidInfo[k.id]?.care);
  const birthdays = people
    .map((k) => ({ kid: k, days: birthdayIn(k.id, now) }))
    .filter(({ days }) => days !== null && days <= 7)
    .sort((a, b) => a.days - b.days);
  const blocks = sessions(now).slice().sort(byStart);
  const hour = gymHour(now);
  return (
    <div className="cc-view">
      <div className="cc-hello">
        <h1>
          Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"},{" "}
          {actor.name.replace("Coach ", "")}.
        </h1>
        <p>
          {clockTime(now)} · {gymFullDay(now)}
        </p>
      </div>
      <div className="cc-stats">
        <Stat
          value={here.length}
          label="in the building"
          onClick={() => go("kids", { filter: "here" })}
        />
        <Stat
          value={pending.length}
          label="check-ins to confirm"
          onClick={() => go("wrap")}
          tone={pending.length ? "warn" : ""}
        />
        <Stat
          value={handouts.length + prizeHandouts.length}
          label="rewards to hand out"
          tone={handouts.length + prizeHandouts.length ? "gold" : ""}
        />
        <Stat
          value={followUps.length}
          label="follow-ups"
          onClick={() => go("wrap")}
        />
      </div>
      <section className="cc-card">
        <h2>Today’s schedule</h2>
        <div className="cc-blocks">
          {blocks.map((s) => {
            const phase = sessionPhase(s, now);
            const roster = s.kind === "class" ? rosterFor(s.index) : null;
            const count = roster
              ? roster.filter((k) => isHere(state, k.id, now)).length
              : here.length;
            return (
              <article
                key={s.id}
                className={`cc-block phase-${phase} ${block.id === s.id ? "is-current" : ""}`}
              >
                <span className="cc-block-time">
                  {clock(s.start)}–{clock(s.end)}
                </span>
                <div>
                  <b>{s.name}</b>
                  <small>
                    {s.kind === "class"
                      ? `Class · ${s.ages} · ${s.lead}`
                      : "Open gym · staffed stations"}
                    {phase === "live"
                      ? " · Live"
                      : phase === "done"
                        ? " · Done"
                        : ""}
                  </small>
                </div>
                <span className="cc-block-count">
                  {roster ? `${count}/${roster.length}` : count} here
                </span>
                <button
                  className="button compact navy"
                  onClick={() => {
                    ops.setBlock(s.id);
                    go(s.kind === "class" ? "class" : "station");
                  }}
                >
                  {s.kind === "class" ? "Run class" : "Staff a station"}
                </button>
              </article>
            );
          })}
        </div>
      </section>
      {(handouts.length > 0 || prizeHandouts.length > 0) && (
        <section className="cc-card">
          <h2>Hand these out while they’re here</h2>
          {[...handouts, ...prizeHandouts].map((h, i) => (
            <button
              key={i}
              className="cc-alert gold"
              onClick={() => ops.openKid(h.kid.id)}
            >
              <Avatar
                child={h.kid}
                photoId={state.floor?.avatars?.[h.kid.id]}
                size={40}
              />
              <span>
                <b>{h.kid.first}</b> · {h.label}
              </span>
            </button>
          ))}
        </section>
      )}
      {care.length > 0 && (
        <section className="cc-card">
          <h2>Care notes for kids here</h2>
          {care.map((k) => (
            <button
              key={k.id}
              className="cc-alert care"
              onClick={() => ops.openKid(k.id)}
            >
              <Avatar
                child={k}
                photoId={state.floor?.avatars?.[k.id]}
                size={40}
              />
              <span>
                <b>{k.first}</b> · {kidInfo[k.id].care}
              </span>
            </button>
          ))}
        </section>
      )}
      {close.length > 0 && (
        <section className="cc-card">
          <h2>Close to a shirt</h2>
          {close.map(({ kid, gap }) => (
            <button
              key={kid.id}
              className="cc-alert"
              onClick={() => ops.openKid(kid.id)}
            >
              <Avatar
                child={kid}
                photoId={state.floor?.avatars?.[kid.id]}
                size={40}
              />
              <span>
                <b>{kid.first}</b> · {gap.left.length} left for the{" "}
                {gap.tier.name} tee:{" "}
                {gap.left
                  .map((s) => `${s.title} (${stationName(stationFor(s))})`)
                  .join(", ")}
              </span>
            </button>
          ))}
        </section>
      )}
      {birthdays.length > 0 && (
        <section className="cc-card">
          <h2>Birthdays this week</h2>
          <div className="cc-chips">
            {birthdays.map(({ kid, days }) => (
              <button
                key={kid.id}
                className="chip"
                onClick={() => ops.openKid(kid.id)}
              >
                {kid.first} ·{" "}
                {days === 0
                  ? "today"
                  : days === 1
                    ? "tomorrow"
                    : `in ${days} days`}
                {isHere(state, kid.id, now) ? " · here" : ""}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="cc-card">
        <h2>Latest arrivals</h2>
        {!here.length ? (
          <div className="cc-empty">
            <p>No one has checked in at the front desk yet today.</p>
            <div className="cc-empty-actions">
              <a
                className="button cyan compact"
                href="?kiosk"
                target="_blank"
                rel="noreferrer"
              >
                Open front desk kiosk
              </a>
              <button className="button outline compact" onClick={ops.simulate}>
                Simulate arrivals (demo)
              </button>
            </div>
          </div>
        ) : (
          <div className="cc-arrivals">
            {here.slice(0, 10).map((p) => {
              const kid = people.find((k) => k.id === p.childId);
              return (
                <button key={p.id} onClick={() => ops.openKid(kid.id)}>
                  <Avatar
                    child={kid}
                    photoId={state.floor?.avatars?.[kid.id]}
                    size={44}
                  />
                  <b>{kid.first}</b>
                  <small>{clockTime(p.in)}</small>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function BlockPicker({ ops, now, kinds }) {
  const list = sessions(now)
    .filter((s) => !kinds || kinds.includes(s.kind))
    .sort(byStart);
  return (
    <label className="cc-select">
      <span className="sr-only">Session</span>
      <select
        value={ops.block.id}
        onChange={(e) => ops.setBlock(e.target.value)}
      >
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {clock(s.start)}–{clock(s.end)}
            {sessionPhase(s, now) === "live" ? " · Live" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

// Station rotation timer for classes. Lives on this device only.
function RotationTimer({ now }) {
  const [cfg, setCfg] = useState(
    () =>
      readDevice().rotation ?? {
        minutes: 8,
        stations: stations.map((s) => s.id),
        start: null,
      },
  );
  const [, tick] = useState(0);
  useEffect(() => writeDevice({ rotation: cfg }), [cfg]);
  useEffect(() => {
    if (!cfg.start) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [cfg.start]);
  const lastIdx = useRef(-1);
  const span = cfg.minutes * 60000;
  const elapsed = cfg.start ? Date.now() - cfg.start : 0;
  const idx = Math.floor(elapsed / span);
  const done = cfg.start && idx >= cfg.stations.length;
  const left = span - (elapsed % span);
  useEffect(() => {
    if (cfg.start && idx !== lastIdx.current) {
      if (lastIdx.current >= 0) navigator.vibrate?.([200, 100, 200]);
      lastIdx.current = idx;
    }
  }, [idx, cfg.start]);
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  return (
    <section className="cc-card cc-rotation">
      <div className="cc-card-head">
        <h2>Rotation timer</h2>
        {cfg.start ? (
          <button
            className="button outline compact"
            onClick={() => setCfg({ ...cfg, start: null })}
          >
            Stop
          </button>
        ) : (
          <button
            className="button cyan compact"
            disabled={!cfg.stations.length}
            onClick={() => {
              lastIdx.current = -1;
              setCfg({ ...cfg, start: Date.now() });
            }}
          >
            Start
          </button>
        )}
      </div>
      {cfg.start && !done ? (
        <div className="cc-rotation-live">
          <span className="eyebrow">
            Rotation {idx + 1} of {cfg.stations.length}
          </span>
          <strong>{stationName(cfg.stations[idx])}</strong>
          <output>
            {mm}:{ss}
          </output>
          {cfg.stations[idx + 1] && (
            <small>Next: {stationName(cfg.stations[idx + 1])}</small>
          )}
          <button
            className="text-button"
            onClick={() => setCfg({ ...cfg, start: cfg.start - left })}
          >
            Rotate now
          </button>
        </div>
      ) : done ? (
        <p className="cc-muted">All rotations done.</p>
      ) : (
        <div className="cc-rotation-setup">
          <div className="cc-chips">
            {stations.map((s) => {
              const on = cfg.stations.includes(s.id);
              return (
                <button
                  key={s.id}
                  className={`chip ${on ? "is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    setCfg({
                      ...cfg,
                      stations: on
                        ? cfg.stations.filter((x) => x !== s.id)
                        : [...cfg.stations, s.id],
                    })
                  }
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          <label className="cc-inline">
            Minutes each
            <select
              value={cfg.minutes}
              onChange={(e) =>
                setCfg({ ...cfg, minutes: Number(e.target.value) })
              }
            >
              {[4, 5, 6, 8, 10, 12, 15].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

function ClassView({ ops, now }) {
  const { state, actor, block } = ops;
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState([]);
  if (block.kind !== "class")
    return (
      <div className="cc-view">
        <div className="cc-view-head">
          <h1>Run a class</h1>
          <BlockPicker ops={ops} now={now} kinds={["class"]} />
        </div>
        <div className="cc-chips">
          {sessions(now)
            .filter((s) => s.kind === "class")
            .map((s) => (
              <button
                key={s.id}
                className="chip"
                onClick={() => ops.setBlock(s.id)}
              >
                {s.name} · {clock(s.start)}
              </button>
            ))}
        </div>
      </div>
    );
  const events = state.club?.events ?? [];
  const attendance = (id) =>
    events.find(
      (e) =>
        e.childId === id &&
        e.kind === "class" &&
        e.session === block.id &&
        ["pending", "approved"].includes(e.status),
    );
  const walkIns = events
    .filter(
      (e) =>
        e.kind === "class" &&
        e.session === block.id &&
        ["pending", "approved"].includes(e.status),
    )
    .map((e) => e.childId);
  const roster = [
    ...rosterFor(block.index),
    ...people.filter(
      (p) =>
        walkIns.includes(p.id) && !kidInfo[p.id]?.classes.includes(block.index),
    ),
  ];
  const confirmed = roster.filter(
    (k) => attendance(k.id)?.status === "approved",
  );
  const waiting = roster.filter((k) => {
    const a = attendance(k.id);
    return a?.status === "pending" || (!a && isHere(state, k.id, now));
  });
  const confirm = (ids, el) =>
    ops.run(
      ids.length === 1
        ? `${people.find((p) => p.id === ids[0]).first} is in. +5 stars`
        : `${ids.length} kids confirmed. +5 stars each`,
      (s) => ids.reduce((n, id) => ensurePresent(n, actor, id, block), s),
      { spark: el },
    );
  const phase = sessionPhase(block, now);
  return (
    <div className="cc-view">
      <div className="cc-view-head">
        <div>
          <h1>{block.name}</h1>
          <p>
            {clock(block.start)}–{clock(block.end)} · {block.ages} · Lead{" "}
            {block.lead}
            {phase === "live"
              ? " · Live"
              : phase === "done"
                ? " · Finished"
                : " · Upcoming"}
          </p>
        </div>
        <BlockPicker ops={ops} now={now} kinds={["class"]} />
      </div>
      <div className="cc-stats cc-stats-3">
        <Stat
          value={`${confirmed.length}/${roster.length}`}
          label="confirmed"
        />
        <Stat
          value={waiting.length}
          label="checked in"
          tone={waiting.length ? "warn" : ""}
        />
        <Stat
          value={roster.length - confirmed.length - waiting.length}
          label="not here yet"
        />
      </div>
      <div className="cc-toolbar">
        <button
          className="button navy"
          disabled={!waiting.length}
          onClick={(e) =>
            confirm(
              waiting.map((k) => k.id),
              e.currentTarget,
            )
          }
        >
          Confirm everyone checked in ({waiting.length})
        </button>
        <button
          className={`button ${selecting ? "cyan" : "outline"}`}
          onClick={() => {
            setSelecting(!selecting);
            setPicked([]);
          }}
        >
          {selecting ? "Done selecting" : "Select kids"}
        </button>
        <button className="button outline" onClick={() => setAddOpen(!addOpen)}>
          Add a walk-in
        </button>
      </div>
      {addOpen && (
        <section className="cc-card">
          <input
            className="cc-search"
            placeholder="Search any athlete"
            aria-label="Search any athlete"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="cc-chips">
            {people
              .filter(
                (p) =>
                  !roster.some((r) => r.id === p.id) &&
                  query &&
                  matchKid(p, query),
              )
              .slice(0, 8)
              .map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  onClick={(e) => {
                    if (confirm([p.id], e.currentTarget)) {
                      setQuery("");
                      setAddOpen(false);
                    }
                  }}
                >
                  {p.name} · {p.age}
                </button>
              ))}
          </div>
        </section>
      )}
      {selecting && picked.length > 0 && (
        <GroupBar ops={ops} ids={picked} onDone={() => setPicked([])} />
      )}
      <div className="cc-grid">
        {roster.map((k) => {
          const a = attendance(k.id);
          const here = arrival(state, k.id, now);
          const state_ =
            a?.status === "approved"
              ? "in"
              : a?.status === "pending" || here
                ? "waiting"
                : "out";
          return (
            <KidTile
              key={k.id}
              child={k}
              state={state}
              now={now}
              onOpen={ops.openKid}
              selected={picked.includes(k.id)}
              onSelect={
                selecting
                  ? (id) =>
                      setPicked(
                        picked.includes(id)
                          ? picked.filter((x) => x !== id)
                          : [...picked, id],
                      )
                  : null
              }
              badge={
                <em className={`att att-${state_}`}>
                  {state_ === "in"
                    ? "Confirmed"
                    : state_ === "waiting"
                      ? "Checked in"
                      : "Not here"}
                </em>
              }
            >
              {state_ !== "in" && !selecting && (
                <button
                  className="tile-btn"
                  onClick={(e) => confirm([k.id], e.currentTarget)}
                  aria-label={`Confirm ${k.first} is in class`}
                >
                  {state_ === "waiting" ? "Confirm" : "Mark here"}
                </button>
              )}
            </KidTile>
          );
        })}
      </div>
      <RotationTimer now={now} />
    </div>
  );
}

// Bulk actions for several selected kids.
function GroupBar({ ops, ids, onDone }) {
  const { actor, block, station } = ops;
  const [praise, setPraise] = useState(false);
  const skipErrors = (kind, extra) => (s) => {
    let next = s;
    let count = 0;
    for (const id of ids) {
      try {
        next = recordAt(next, actor, block, id, kind, { station, ...extra });
        count += 1;
      } catch {
        // Already recorded or over a limit: skip this kid.
      }
    }
    if (!count) throw Error("Already recorded for everyone selected.");
    return next;
  };
  return (
    <div className="cc-groupbar" role="region" aria-label="Group actions">
      <b>{ids.length} selected</b>
      <button
        className="button cyan compact"
        onClick={(e) => {
          if (
            ops.run(
              `Everyone tried ${stationName(station)}. +2 stars each`,
              skipErrors("visit"),
              { spark: e.currentTarget },
            )
          )
            onDone();
        }}
      >
        All tried {stationName(station)}
      </button>
      <button
        className="button outline compact"
        onClick={() => setPraise(!praise)}
      >
        Shoutout…
      </button>
      {praise && (
        <div className="cc-chips">
          {shoutouts.map((c) => (
            <button
              key={c}
              className="chip"
              onClick={(e) => {
                if (
                  ops.run(
                    `${c} for ${ids.length} kids. +3 stars each`,
                    skipErrors("praise", { category: c }),
                    { spark: e.currentTarget },
                  )
                )
                  onDone();
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StationView({ ops, now }) {
  const { state, actor, block, station } = ops;
  const [filter, setFilter] = useState("here");
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState([]);
  const outage = state.floor?.outages?.[station];
  const here = hereNow(state, now).map((p) => p.childId);
  const today = (id) => eventsToday(state, id, now);
  const pool = people.filter((p) =>
    query
      ? matchKid(p, query)
      : filter === "here"
        ? here.includes(p.id)
        : filter === "class" && block.kind === "class"
          ? kidInfo[p.id]?.classes.includes(block.index)
          : true,
  );
  const goalHere = (id) =>
    readySkills(state, id, station).filter((s) =>
      (state.goals?.[id] ?? []).includes(s.id),
    );
  const list = pool
    .map((p) => ({
      kid: p,
      goals: goalHere(p.id),
      tried: today(p.id).some(
        (e) =>
          e.kind === "visit" && e.station === station && e.session === block.id,
      ),
      done: today(p.id).some(
        (e) =>
          e.kind === "complete" &&
          e.station === station &&
          e.session === block.id,
      ),
      at: arrival(state, p.id, now)?.in ?? "",
    }))
    .sort(
      (a, b) =>
        b.goals.length - a.goals.length ||
        Number(a.tried) - Number(b.tried) ||
        b.at.localeCompare(a.at),
    );
  return (
    <div className="cc-view">
      <div className="cc-view-head">
        <div>
          <h1>{stationName(station)}</h1>
        </div>
        <BlockPicker ops={ops} now={now} />
      </div>
      <div className="cc-station-pick" role="group" aria-label="My station">
        {stations.map((s) => (
          <button
            key={s.id}
            aria-pressed={station === s.id}
            className={state.floor?.outages?.[s.id] ? "is-paused" : ""}
            onClick={() => ops.setStation(s.id)}
          >
            {s.name}
            {state.floor?.outages?.[s.id] && <small>Paused</small>}
          </button>
        ))}
      </div>
      {outage && (
        <p className="cc-banner" role="alert">
          Paused by {outage.by}: {outage.reason}
        </p>
      )}
      <div className="cc-toolbar">
        <div className="cc-search-wrap">
          <Search size={18} />
          <input
            className="cc-search"
            placeholder="Find a kid"
            aria-label="Find a kid"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="button navy cc-scan"
          onClick={ops.scan}
          aria-label="Scan pass"
        >
          <ScanLine size={18} /> <span>Scan pass</span>
        </button>
        <button
          className={`button ${selecting ? "cyan" : "outline"}`}
          onClick={() => {
            setSelecting(!selecting);
            setPicked([]);
          }}
        >
          {selecting ? "Done" : "Select"}
        </button>
      </div>
      {!query && (
        <div className="cc-filter" role="group" aria-label="Show">
          {[
            ["here", `Here now (${here.length})`],
            ...(block.kind === "class" ? [["class", "This class"]] : []),
            ["all", "Everyone"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {selecting && picked.length > 0 && (
        <GroupBar ops={ops} ids={picked} onDone={() => setPicked([])} />
      )}
      {!list.length && (
        <div className="cc-empty">
          <p>
            {filter === "here" && !query
              ? "No one is checked in yet."
              : "No kids match."}
          </p>
          {filter === "here" && !query && (
            <button
              className="button outline compact"
              onClick={() => setFilter("all")}
            >
              Show everyone
            </button>
          )}
        </div>
      )}
      <div className="cc-grid">
        {list.map(({ kid, goals, tried, done }) => (
          <KidTile
            key={kid.id}
            child={kid}
            state={state}
            now={now}
            onOpen={ops.openKid}
            selected={picked.includes(kid.id)}
            onSelect={
              selecting
                ? (id) =>
                    setPicked(
                      picked.includes(id)
                        ? picked.filter((x) => x !== id)
                        : [...picked, id],
                    )
                : null
            }
            badge={
              <>
                {goals.length > 0 && (
                  <em className="goal-tag">Goal: {goals[0].title}</em>
                )}
                {(tried || done) && (
                  <em className="att att-in">
                    {done ? "Completed" : "Tried"} today
                  </em>
                )}
              </>
            }
          >
            {!selecting && (
              <button
                className="tile-btn"
                disabled={tried || !!outage}
                onClick={(e) =>
                  ops.run(
                    `${kid.first} tried ${stationName(station)}. +2 stars`,
                    (s) =>
                      recordAt(s, actor, block, kid.id, "visit", { station }),
                    { spark: e.currentTarget },
                  )
                }
              >
                {tried ? "Tried ✓" : "Tried +2"}
              </button>
            )}
          </KidTile>
        ))}
      </div>
    </div>
  );
}

function KidsView({ ops, now, initial }) {
  const { state } = ops;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(initial?.filter ?? "all");
  const here = hereNow(state, now).map((p) => p.childId);
  const recent = (readDevice().recent ?? [])
    .map((id) => people.find((p) => p.id === id))
    .filter(Boolean);
  const list = people
    .filter(
      (p) => matchKid(p, query) && (filter === "all" || here.includes(p.id)),
    )
    .sort((a, b) => a.first.localeCompare(b.first));
  return (
    <div className="cc-view">
      <div className="cc-view-head">
        <h1>Find a kid</h1>
        <button className="button navy" onClick={ops.scan}>
          <ScanLine size={18} /> Scan pass
        </button>
      </div>
      <div className="cc-search-wrap big">
        <Search size={22} />
        <input
          className="cc-search"
          placeholder="Name, last name, parent or family PIN"
          aria-label="Search kids"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className="cc-filter" role="group" aria-label="Show">
        <button
          aria-pressed={filter === "here"}
          onClick={() => setFilter("here")}
        >
          Here now ({here.length})
        </button>
        <button
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          Everyone ({people.length})
        </button>
      </div>
      {!query && recent.length > 0 && (
        <>
          <h2 className="cc-subhead">Recently opened</h2>
          <div className="cc-arrivals">
            {recent.map((kid) => (
              <button key={kid.id} onClick={() => ops.openKid(kid.id)}>
                <Avatar
                  child={kid}
                  photoId={state.floor?.avatars?.[kid.id]}
                  size={44}
                />
                <b>{kid.first}</b>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="cc-grid">
        {list.map((kid) => (
          <KidTile
            key={kid.id}
            child={kid}
            state={state}
            now={now}
            onOpen={ops.openKid}
          />
        ))}
      </div>
      {!list.length && <p className="cc-muted">No kids match “{query}”.</p>}
    </div>
  );
}

function WrapView({ ops, now }) {
  const { state, actor } = ops;
  const events = state.club?.events ?? [];
  const pending = events
    .filter((e) => e.status === "pending")
    .sort(
      (a, b) =>
        (a.kind === "class" ? 0 : 1) - (b.kind === "class" ? 0 : 1) ||
        a.at.localeCompare(b.at),
    );
  const seenToday = [
    ...new Set([
      ...hereNow(state, now).map((p) => p.childId),
      ...events
        .filter((e) => e.status === "approved" && dayKey(e.at) === dayKey(now))
        .map((e) => e.childId),
    ]),
  ];
  const noShoutout = seenToday.filter(
    (id) =>
      !eventsToday(state, id, now).some(
        (e) => e.kind === "praise" && e.status === "approved",
      ),
  );
  const followUps = (state.floor?.notes ?? []).filter(
    (n) => n.followUp && !n.done,
  );
  const mine = events.filter(
    (e) =>
      e.coach === actor.name &&
      e.status === "approved" &&
      dayKey(e.reviewedAt ?? e.at) === dayKey(now),
  );
  const myAwards = state.awards.filter(
    (a) => a.coach === actor.name && !a.revoked && dayKey(a.at) === dayKey(now),
  );
  const myPhotos = (state.floor?.moments ?? []).filter(
    (m) => m.coach === actor.name && dayKey(m.at) === dayKey(now),
  );
  const kid = (id) => people.find((p) => p.id === id);
  // Pending requests grouped by session, earliest session first.
  const groups = [...new Set(pending.map((e) => e.session))]
    .map((id) => ({
      id,
      block: sessions(`${id.slice(0, 10)}T12:00:00Z`).find((s) => s.id === id),
      items: pending.filter((e) => e.session === id),
    }))
    .sort(
      (a, b) =>
        a.id.slice(0, 10).localeCompare(b.id.slice(0, 10)) ||
        (a.block?.start ?? "").localeCompare(b.block?.start ?? ""),
    );
  return (
    <div className="cc-view">
      <div className="cc-view-head">
        <h1>Wrap-up</h1>
      </div>
      <div className="cc-stats">
        <Stat
          value={
            mine.reduce((n, e) => n + points[e.kind], 0) +
            myAwards.reduce(
              (n, a) =>
                n + 10 + catalog.find((s) => s.id === a.skillId).tier * 10,
              0,
            )
          }
          label="stars you gave today"
          tone="gold"
        />
        <Stat
          value={new Set([...mine, ...myAwards].map((e) => e.childId)).size}
          label="kids you recognized"
        />
        <Stat value={myAwards.length} label="skills you verified" />
        <Stat value={myPhotos.length} label="photos you took" />
      </div>
      <section className="cc-card">
        <h2>Check-ins to confirm · {pending.length}</h2>
        {!pending.length && <p className="cc-muted">All caught up.</p>}
        {groups.map(({ id, block, items }) => (
          <div className="cc-pend-group" key={id}>
            <div className="cc-pend-head">
              <span>
                <b>{block?.name ?? "Earlier session"}</b>
                <small>
                  {block ? `${clock(block.start)}–${clock(block.end)}` : ""}
                  {id.slice(0, 10) !== dayKey(now)
                    ? ` · ${id.slice(5, 10).replace("-", "/")}`
                    : ""}
                  {" · "}
                  {items.length} waiting
                </small>
              </span>
              <button
                className="button navy compact"
                onClick={(e) =>
                  ops.run(
                    `${items.length} confirmed.`,
                    (s) =>
                      items.reduce(
                        (n, p) =>
                          coachAct(n, actor, {
                            type: "approve",
                            id: p.id,
                            childId: p.childId,
                          }),
                        s,
                      ),
                    { spark: e.currentTarget },
                  )
                }
              >
                Confirm all {items.length}
              </button>
            </div>
            <div className="cc-pend-list">
              {items.map((e) => (
                <div className="cc-pend" key={e.id}>
                  <button
                    className="cc-pend-kid"
                    onClick={() => ops.openKid(e.childId)}
                  >
                    <Avatar
                      child={kid(e.childId)}
                      photoId={state.floor?.avatars?.[e.childId]}
                      size={40}
                    />
                    <span>
                      <b>{kid(e.childId).first}</b>
                      <small>
                        {e.kind === "class" ? "Arrived" : describeEvent(e)} ·{" "}
                        {clockTime(e.at)}
                      </small>
                    </span>
                  </button>
                  <button
                    className="cc-round confirm"
                    aria-label={`Confirm ${kid(e.childId).first}`}
                    onClick={() =>
                      ops.run(`${kid(e.childId).first} confirmed.`, (s) =>
                        coachAct(s, actor, {
                          type: "approve",
                          id: e.id,
                          childId: e.childId,
                        }),
                      )
                    }
                  >
                    <Check size={20} />
                  </button>
                  <button
                    className="cc-round dismiss"
                    aria-label={`Dismiss ${kid(e.childId).first}`}
                    onClick={() =>
                      ops.run("Dismissed.", (s) =>
                        coachAct(s, actor, {
                          type: "reject",
                          id: e.id,
                          childId: e.childId,
                        }),
                      )
                    }
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="cc-card">
        <h2>No shoutout yet today · {noShoutout.length}</h2>
        {!noShoutout.length && (
          <p className="cc-muted">Everyone seen today got recognized.</p>
        )}
        <div className="cc-chips">
          {noShoutout.map((id) => (
            <button key={id} className="chip" onClick={() => ops.openKid(id)}>
              {kid(id).first}
            </button>
          ))}
        </div>
      </section>
      <section className="cc-card">
        <h2>Follow-ups · {followUps.length}</h2>
        {!followUps.length && <p className="cc-muted">Nothing to follow up.</p>}
        {followUps.map((n) => (
          <div className="cc-row" key={n.id}>
            <Avatar
              child={kid(n.childId)}
              photoId={state.floor?.avatars?.[n.childId]}
              size={40}
            />
            <button
              className="cc-row-text"
              onClick={() => ops.openKid(n.childId)}
            >
              <b>{kid(n.childId).first}</b> · {n.text}
              <small>
                {n.coach} · {clockTime(n.at)}
              </small>
            </button>
            <button
              className="button outline compact"
              onClick={() =>
                ops.run("Follow-up done.", (s) =>
                  applyFloor(s, { type: "resolveNote", id: n.id, actor }),
                )
              }
            >
              Done
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

function AdminView({ ops, now }) {
  const { state, actor } = ops;
  const [reasons, setReasons] = useState({});
  const events = (state.club?.events ?? []).filter(
    (e) => e.status === "approved",
  );
  const weekAgo = Date.now() - 7 * 86400000;
  const week = events.filter((e) => Date.parse(e.at) >= weekAgo);
  const byCoach = staff.map((s) => {
    const mine = week.filter((e) => e.coach === s.name);
    return {
      s,
      stars: mine.reduce((n, e) => n + points[e.kind], 0),
      praise: mine.filter((e) => e.kind === "praise").length,
      kids: new Set(mine.map((e) => e.childId)).size,
    };
  });
  const reserved = state.rewards.filter((r) => r.status === "Reserved");
  const sizeNeeded = state.rewards.filter((r) => r.status === "Choose size");
  const noConsent = people.filter(
    (p) => !(state.floor?.consent?.[p.id] ?? kidInfo[p.id]?.photoDefault),
  );
  const hidden = (state.floor?.moments ?? []).filter((m) => m.hidden).length;
  const kid = (id) => people.find((p) => p.id === id);
  return (
    <div className="cc-view">
      <div className="cc-view-head">
        <h1>Head coach</h1>
      </div>
      <section className="cc-card">
        <h2>Stations</h2>
        <p className="cc-muted">
          Pausing a station blocks tries and completions there until you reopen
          it.
        </p>
        {stations.map((s) => {
          const out = state.floor?.outages?.[s.id];
          return (
            <div className="cc-row" key={s.id}>
              <span>
                <b>{s.name}</b>
                <small>
                  {out ? `Paused by ${out.by} · ${out.reason}` : "Open"}
                </small>
              </span>
              {out ? (
                <button
                  className="button mint compact"
                  onClick={() =>
                    ops.run(`${s.name} reopened.`, (x) =>
                      applyFloor(x, {
                        type: "outage",
                        station: s.id,
                        reason: null,
                        actor,
                      }),
                    )
                  }
                >
                  Reopen
                </button>
              ) : (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      ops.run(`${s.name} paused.`, (x) =>
                        applyFloor(x, {
                          type: "outage",
                          station: s.id,
                          reason: reasons[s.id],
                          actor,
                        }),
                      )
                    )
                      setReasons({ ...reasons, [s.id]: "" });
                  }}
                >
                  <input
                    aria-label={`Reason to pause ${s.name}`}
                    placeholder="Reason, e.g. loose rung"
                    value={reasons[s.id] ?? ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [s.id]: e.target.value })
                    }
                  />
                  <button
                    className="button outline compact"
                    disabled={!reasons[s.id]?.trim()}
                  >
                    Pause
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </section>
      <section className="cc-card">
        <h2>Shirt orders</h2>
        {!reserved.length && !sizeNeeded.length && (
          <p className="cc-muted">No open shirt orders.</p>
        )}
        {reserved.map((r) => (
          <div className="cc-row" key={r.id}>
            <span>
              <b>{kid(r.childId).name}</b> · {tiers[r.tier - 1].name} tee ·{" "}
              {r.size}
            </span>
            <button
              className="button navy compact"
              onClick={() =>
                ops.run("Marked ready for pickup.", (s) =>
                  apply(s, { type: "reward", id: r.id, status: "Ready" }),
                )
              }
            >
              In stock · ready
            </button>
          </div>
        ))}
        {sizeNeeded.map((r) => (
          <div className="cc-row" key={r.id}>
            <span>
              <b>{kid(r.childId).name}</b> · {tiers[r.tier - 1].name} tee
              <small>Waiting for the family to choose a size</small>
            </span>
          </div>
        ))}
      </section>
      <section className="cc-card">
        <h2>Recognition this week</h2>
        <p className="cc-muted">
          Stars spread across kids, by coach. Watch for one coach carrying it
          all or a few kids getting most of it.
        </p>
        <div className="cc-table" role="table">
          <div role="row" className="cc-tr cc-th">
            <span role="columnheader">Coach</span>
            <span role="columnheader">Stars</span>
            <span role="columnheader">Shoutouts</span>
            <span role="columnheader">Kids</span>
          </div>
          {byCoach.map(({ s, stars, praise, kids }) => (
            <div role="row" className="cc-tr" key={s.id}>
              <span role="cell">{s.name}</span>
              <span role="cell">{stars}</span>
              <span role="cell">{praise}</span>
              <span role="cell">{kids}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="cc-card">
        <h2>Photos</h2>
        <p className="cc-muted">
          {(state.floor?.moments ?? []).length} photos · {hidden} hidden by
          families · {noConsent.length} kids without photo consent
        </p>
        <div className="cc-chips">
          {noConsent.map((k) => (
            <button
              key={k.id}
              className="chip"
              onClick={() => ops.openKid(k.id)}
            >
              {k.name}
            </button>
          ))}
        </div>
      </section>
      <section className="cc-card">
        <div className="cc-card-head">
          <h2>Shared gym iPad</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={ops.shared}
              onChange={(e) => ops.setShared(e.target.checked)}
            />
            Use this device as a shared iPad
          </label>
        </div>
        <p className="cc-muted">
          {ops.shared
            ? `Signed in as ${ops.owner?.name}. Coaches switch with their 4-digit PIN, and it locks after 10 idle minutes.`
            : "This device uses your own sign-in. Turn this on for an iPad that several coaches share."}
        </p>
      </section>
      <section className="cc-card">
        <h2>Front desk</h2>
        <div className="cc-empty-actions">
          <a
            className="button cyan compact"
            href="?kiosk"
            target="_blank"
            rel="noreferrer"
          >
            Open kiosk in a new tab
          </a>
          <button className="button outline compact" onClick={ops.simulate}>
            Simulate arrivals (demo)
          </button>
          <button
            className="button outline compact"
            disabled={!hereNow(state, now).length}
            onClick={() =>
              ops.run("Everyone checked out.", (s) =>
                applyFloor(s, {
                  type: "checkOut",
                  childIds: hereNow(s, now).map((p) => p.childId),
                  actor,
                }),
              )
            }
          >
            Check everyone out
          </button>
        </div>
      </section>
    </div>
  );
}

/* ---------- Shell ---------- */

export default function CoachCenter({
  state: rawState,
  setState,
  onExit,
  account,
  onSignOut,
}) {
  const state = useMemo(
    () => ({ ...rawState, floor: rawState.floor ?? emptyFloor() }),
    [rawState],
  );
  const now = useNow();
  // A coach's own phone uses their sign-in. A shared gym iPad is signed in
  // once by the head coach; coaches then switch with their 4-digit PIN.
  const owner = staff.find((s) => s.id === account?.staffId) ?? null;
  const [shared, setSharedState] = useState(() => !!readDevice().shared);
  const [deviceCoach, setCoach] = useState(
    () => staff.find((s) => s.id === readDevice().staffId) ?? null,
  );
  const [lockedState, setLocked] = useState(() => {
    const d = readDevice();
    return !d.staffId || !d.active || Date.now() - d.active > LOCK_AFTER;
  });
  const coach = shared ? deviceCoach : owner;
  const locked = shared ? lockedState : false;
  const setShared = (on) => {
    setSharedState(on);
    writeDevice({ shared: on, staffId: owner?.id ?? null, active: Date.now() });
    setCoach(owner);
    setLocked(false);
  };
  const [tab, setTab] = useState("now");
  const [tabArg, setTabArg] = useState(null);
  const [blockId, setBlockId] = useState(() => defaultBlock(new Date()).id);
  const [station, setStationState] = useState(
    () => readDevice().station ?? "grip",
  );
  const [kid, setKid] = useState(null);
  const [assess, setAssess] = useState(null);
  const [camera, setCamera] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [celebrate, setCelebrate] = useState(null);
  const [toast, setToast] = useState(null);
  const [menu, setMenu] = useState(false);
  const [famPick, setFamPick] = useState(null);
  const block =
    sessions(now).find((s) => s.id === blockId) ?? defaultBlock(now);
  // Keep the chosen block on today's date after midnight.
  useEffect(() => {
    if (!sessions(now).some((s) => s.id === blockId))
      setBlockId(defaultBlock(now).id);
  }, [now, blockId]);
  // Lock after inactivity on a shared device.
  useEffect(() => {
    if (locked || !coach) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const save = setInterval(() => {
      writeDevice({ active: last });
      if (Date.now() - last > LOCK_AFTER) setLocked(true);
    }, 15000);
    ["pointerdown", "keydown"].forEach((e) =>
      window.addEventListener(e, bump, { passive: true }),
    );
    writeDevice({ active: last });
    return () => {
      clearInterval(save);
      ["pointerdown", "keydown"].forEach((e) =>
        window.removeEventListener(e, bump),
      );
    };
  }, [locked, coach]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.prev ? 7000 : 4500);
    return () => clearTimeout(id);
  }, [toast]);
  const actor = coach
    ? { role: "Coach", name: coach.name, head: coach.head }
    : null;
  const notify = (message, error = false) =>
    setToast({ id: Date.now(), message, error });
  const run = useCallback(
    (message, fn, opts = {}) => {
      try {
        const next = fn(state);
        setState(next);
        if (opts.spark) sparkFrom(opts.spark);
        navigator.vibrate?.(12);
        if (message) setToast({ id: Date.now(), message, prev: rawState });
        return true;
      } catch (e) {
        setToast({ id: Date.now(), message: e.message, error: true });
        navigator.vibrate?.([40, 30, 40]);
        return false;
      }
    },
    [state, rawState, setState],
  );
  const openKid = (id) => {
    setKid(id);
    const recent = [
      id,
      ...(readDevice().recent ?? []).filter((x) => x !== id),
    ].slice(0, 8);
    writeDevice({ recent });
  };
  const setStation = (id) => {
    setStationState(id);
    writeDevice({ station: id });
  };
  const go = (id, arg = null) => {
    // Class tools need a class; jump to the live, next or last one.
    if (id === "class" && block.kind !== "class") {
      const classes = sessions(now)
        .filter((s) => s.kind === "class")
        .sort(byStart);
      const pick =
        classes.find((s) => sessionPhase(s, now) === "live") ??
        classes.find((s) => sessionPhase(s, now) === "upcoming") ??
        classes[classes.length - 1];
      setBlockId(pick.id);
    }
    setTab(id);
    setTabArg(arg);
    window.scrollTo?.(0, 0);
  };
  const onScan = (code) => {
    const hit = parsePass(code);
    if (!hit) return notify("That code isn’t a LAB pass.", true);
    setScanning(false);
    if (hit.childId) return openKid(hit.childId);
    const fam = families.find((f) => f.id === hit.familyId);
    if (fam.kids.length === 1) openKid(fam.kids[0]);
    else setFamPick(fam);
  };
  const simulate = () => {
    // Demo only: a run of front-desk arrivals over the last hour.
    const pool = people.filter((p) => !isHere(state, p.id, now));
    const pick = pool.filter((_, i) => i % 3 !== 2).slice(0, 14);
    let next = state;
    pick.forEach((p, i) => {
      const at = new Date(Date.now() - (pick.length - i) * 4 * 60000);
      next = applyFloor(
        next,
        { type: "checkIn", childIds: [p.id], by: "Front desk" },
        at,
      );
    });
    setState(next);
    notify(`${pick.length} demo arrivals added.`);
  };
  const ops = {
    state,
    actor,
    block,
    setBlock: setBlockId,
    station,
    setStation,
    run,
    notify,
    openKid,
    scan: () => setScanning(true),
    simulate,
    assess: (childId, skillId) => setAssess({ childId, skillId }),
    camera: (opts) => setCamera(opts),
    shared,
    setShared,
    owner,
  };
  if (!coach || locked)
    return (
      <PinPad
        locked={!!coach && locked}
        current={coach}
        onDone={(s) => {
          setCoach(s);
          setLocked(false);
          writeDevice({ staffId: s.id, active: Date.now() });
        }}
      />
    );
  const visibleTabs = tabs.filter((t) => !t.head || coach.head);
  const pendingCount = (state.club?.events ?? []).filter(
    (e) => e.status === "pending",
  ).length;
  return (
    <div className={`cc ${kid ? "has-kid" : ""}`}>
      <header className="cc-bar">
        <img
          className="cc-logo"
          src={`${import.meta.env.BASE_URL}lab-white.svg`}
          alt="The LAB"
        />
        <span className="cc-title">Coach</span>
        <span className={`cc-live phase-${sessionPhase(block, now)}`}>
          {block.name}
          <small>
            {sessionPhase(block, now) === "live"
              ? "Live"
              : `${clock(block.start)}–${clock(block.end)}`}
          </small>
        </span>
        <div className="cc-bar-actions">
          <button
            className="cc-icon-btn"
            aria-label="Scan a pass"
            onClick={() => setScanning(true)}
          >
            <ScanLine size={22} />
          </button>
          <button
            className="cc-me"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <span className="cc-staff-mark">{coach.initials}</span>
            <span className="cc-me-name">{coach.name}</span>
          </button>
          {menu && (
            <div className="cc-menu" role="menu">
              {shared && (
                <>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setLocked(true);
                      setMenu(false);
                    }}
                  >
                    <Lock size={16} /> Lock
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setCoach(null);
                      setLocked(true);
                      setMenu(false);
                      writeDevice({ staffId: null });
                    }}
                  >
                    Switch coach
                  </button>
                </>
              )}
              <a
                role="menuitem"
                href="?kiosk"
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenu(false)}
              >
                Front desk kiosk
              </a>
              <button role="menuitem" onClick={onExit}>
                Leave coach center
              </button>
              <button role="menuitem" onClick={onSignOut}>
                Sign out of this device
              </button>
            </div>
          )}
        </div>
      </header>
      <nav className="cc-nav" aria-label="Coach sections">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => go(t.id)}
            >
              <Icon size={22} />
              <span className="cc-nav-label">{t.label}</span>
              <span className="cc-nav-short" aria-hidden="true">
                {t.short ?? t.label}
              </span>
              {t.id === "wrap" && pendingCount > 0 && (
                <em className="cc-dot">{pendingCount}</em>
              )}
            </button>
          );
        })}
      </nav>
      <main className="cc-main">
        {tab === "now" && <NowView ops={ops} now={now} go={go} />}
        {tab === "class" && <ClassView ops={ops} now={now} />}
        {tab === "station" && <StationView ops={ops} now={now} />}
        {tab === "kids" && (
          <KidsView
            ops={ops}
            now={now}
            initial={tabArg}
            key={JSON.stringify(tabArg)}
          />
        )}
        {tab === "wrap" && <WrapView ops={ops} now={now} />}
        {tab === "admin" && coach.head && <AdminView ops={ops} now={now} />}
      </main>
      {kid && (
        <div
          className="cc-kid-backdrop"
          onClick={() => setKid(null)}
          aria-hidden="true"
        />
      )}
      {kid && (
        <aside className="cc-kid" aria-label="Kid profile">
          <KidPanel
            childId={kid}
            ops={ops}
            now={now}
            onClose={() => setKid(null)}
          />
        </aside>
      )}
      {assess && (
        <AssessSheet
          childId={assess.childId}
          skillId={assess.skillId}
          ops={ops}
          onClose={() => setAssess(null)}
          onUnlocked={(info) => {
            setAssess(null);
            setCelebrate(info);
          }}
        />
      )}
      {celebrate && (
        <Celebrate
          info={celebrate}
          ops={ops}
          onClose={() => setCelebrate(null)}
        />
      )}
      {camera && (
        <CameraSheet
          title={camera.purpose === "avatar" ? "Profile photo" : "Moment photo"}
          subtitle={camera.caption}
          initialFacing={camera.facing ?? "environment"}
          onClose={() => setCamera(null)}
          onCapture={async (blob) => {
            try {
              const photoId = await savePhoto(blob);
              const child = people.find((p) => p.id === camera.childId);
              const ok = run(
                camera.purpose === "avatar"
                  ? `Profile photo saved for ${child.first}.`
                  : `Photo saved. ${child.first}’s family can see it.`,
                (s) =>
                  applyFloor(
                    s,
                    camera.purpose === "avatar"
                      ? {
                          type: "avatar",
                          childId: camera.childId,
                          photoId,
                          actor,
                        }
                      : {
                          type: "moment",
                          childId: camera.childId,
                          photoId,
                          caption: camera.caption,
                          link: camera.link,
                          actor,
                        },
                  ),
              );
              if (ok) setCamera(null);
            } catch (e) {
              notify(e.message || "The photo could not be saved.", true);
            }
          }}
        />
      )}
      {scanning && (
        <div
          className="sheet-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setScanning(false)
          }
        >
          <section
            className="sheet scan-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Scan a pass"
          >
            <header className="sheet-head">
              <span className="eyebrow">Scan a family or kid pass</span>
              <button
                className="kp-close"
                aria-label="Close"
                onClick={() => setScanning(false)}
              >
                <X size={22} />
              </button>
            </header>
            <Scanner
              onCode={onScan}
              hint="Hold the pass QR inside the frame."
            />
          </section>
        </div>
      )}
      {famPick && (
        <div
          className="sheet-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setFamPick(null)}
        >
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={famPick.name}
          >
            <header className="sheet-head">
              <span className="eyebrow">{famPick.name}</span>
              <button
                className="kp-close"
                aria-label="Close"
                onClick={() => setFamPick(null)}
              >
                <X size={22} />
              </button>
            </header>
            <h2>Which kid?</h2>
            <div className="cc-grid">
              {famPick.kids.map((id) => (
                <KidTile
                  key={id}
                  child={people.find((p) => p.id === id)}
                  state={state}
                  now={now}
                  onOpen={(x) => {
                    setFamPick(null);
                    openKid(x);
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      )}
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
