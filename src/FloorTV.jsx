import React, {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { clock, sessions } from "./club.js";
import { gymClockTime, gymFullDay } from "./gym-time.js";
import { floorStatus, layoutOf } from "./layout.js";
import { stationLabel } from "./gym.js";
import FloorMap, { rank } from "./FloorMap.jsx";
import { countdown, photoUrl, useNow } from "./tvkit.js";
import { demoState } from "./demoday.js";
import DemoBar from "./DemoBar.jsx";
import { canMarkUse } from "./flooruse.js";
import { scheduleOf } from "./schedule.js";
import { nextOpening, openAgain } from "./tvs.js";
import "./ds/tokens.css";
import "./floortv.css";

const LayoutEditor = lazy(() => import("./LayoutEditor.jsx"));
const FloorUseEditor = lazy(() => import("./FloorUseEditor.jsx"));

const FEATURE_MS = 12000;
const HOLD_MS = 45000;
const VIEW_KEY = "lab-floor-view";

// ?view=top on a TV's URL, else this screen's last choice, else 3D.
function startView() {
  const asked = new URLSearchParams(window.location.search).get("view");
  if (asked === "top" || asked === "3d") return asked;
  try {
    return localStorage.getItem(VIEW_KEY) === "top" ? "top" : "3d";
  } catch {
    return "3d";
  }
}

// One short line for what a zone is doing.
function stateLine(z) {
  if (z.status === "class") return z.class.name;
  if (z.status === "paused") return "Paused";
  if (z.status === "open")
    return z.soon ? `Open · class at ${clock(z.soon.start)}` : "Open";
  return null;
}

// When the group at a zone moves: on hold, warming up, or a countdown.
function groupClock(c) {
  if (c.paused) return "on hold";
  if (c.warmup) return `warm-up · starts in ${countdown(c.rotateIn)}`;
  return `moves in ${countdown(c.rotateIn)}`;
}

function zoneDetail(z) {
  if (z.status === "class") {
    const c = z.class;
    if (c.group)
      return `Group ${c.group} · ${c.kids} ${c.kids === 1 ? "kid" : "kids"}${c.coach ? ` · ${c.coach}` : ""} · ${groupClock(c)}`;
    return `${c.name}${c.ages ? ` · ages ${c.ages}` : ""} · until ${clock(c.end)}`;
  }
  if (z.status === "open")
    return z.soon
      ? `Free now · ${z.soon.name} at ${clock(z.soon.start)}`
      : "Free for open gym";
  if (z.status === "paused") return z.reason;
  return null;
}

function Featured({ zone }) {
  if (!zone) return null;
  const photo = photoUrl(zone);
  const detail = zoneDetail(zone);
  return (
    <figure className={`ftv-feature is-${zone.status}`} key={zone.id}>
      {photo && <img src={photo} alt="" />}
      <figcaption>
        <strong>
          {zone.name}
          {zone.code && <small>{zone.code}</small>}
        </strong>
        {detail && <span>{detail}</span>}
        {zone.note && <span>{zone.note}</span>}
        {!detail &&
          !zone.note &&
          zone.station &&
          stationLabel(zone.station) !== zone.name && (
            <span>{stationLabel(zone.station)}</span>
          )}
      </figcaption>
    </figure>
  );
}

function Rail({ status, now, featured, reopen }) {
  const stationZones = status.zones.filter((z) => z.station);
  const open = stationZones.filter((z) => z.status === "open");
  const paused = stationZones.filter((z) => z.status === "paused");
  const openBlock = status.live.find((b) => b.kind === "open");
  return (
    <section className="ftv-rail" aria-label="What's happening on the floor">
      <header className="ftv-head">
        <img src={`${import.meta.env.BASE_URL}lab-white.svg`} alt="The LAB" />
        <time>{gymClockTime(now)}</time>
        <span>{gymFullDay(now)}</span>
      </header>

      {!status.hours.open && (
        <div className="ftv-block">
          <h2 className="ftv-eyebrow">Now</h2>
          <h3>{status.hours.closedToday ? "Closed today" : "Closed"}</h3>
          <p>
            {status.next[0]
              ? `Doors open at ${clock(status.next[0].start)}.`
              : reopen}
          </p>
        </div>
      )}

      {status.liveClasses.map((b) => {
        const zones = status.zones.filter(
          (z) => z.status === "class" && z.class.session === b.id,
        );
        return (
          <div className="ftv-block is-class" key={b.id}>
            <h2 className="ftv-eyebrow">In class</h2>
            <h3>{b.name}</h3>
            <p>
              {[b.ages && `Ages ${b.ages}`, b.lead, `until ${clock(b.end)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <ul className={`ftv-rows${zones.length > 4 ? " is-cols" : ""}`}>
              {zones.map((z) => (
                <li key={z.id}>
                  <span>{z.name}</span>
                  {z.class.group && (
                    <small>
                      Group {z.class.group} · {groupClock(z.class)}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {status.hours.open && (
        <div className="ftv-block is-open">
          <h2 className="ftv-eyebrow">
            {openBlock
              ? `${openBlock.name} · until ${clock(openBlock.end)}`
              : "Open gym"}
          </h2>
          <h3>
            {open.length} {open.length === 1 ? "zone" : "zones"} free
          </h3>
          <ul className={`ftv-rows${open.length > 4 ? " is-cols" : ""}`}>
            {open.map((z) => (
              <li key={z.id}>
                <span>{z.name}</span>
                {z.soon && <small>Class {clock(z.soon.start)}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {paused.length > 0 && (
        <div className="ftv-block is-paused">
          <h2 className="ftv-eyebrow">Paused</h2>
          <ul className="ftv-rows">
            {paused.map((z) => (
              <li key={z.id}>
                <span>{z.name}</span>
                <small>{z.reason}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status.next.length > 0 && (
        <div className="ftv-block">
          <h2 className="ftv-eyebrow">Later today</h2>
          <ol className="ftv-rows ftv-later">
            {status.next.slice(0, 3).map((b) => (
              <li key={b.id}>
                <time>{clock(b.start)}</time>
                <span>{b.name}</span>
                <small>
                  {b.kind === "class" ? `Ages ${b.ages}` : "Open gym"}
                </small>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Featured zone={featured} />
    </section>
  );
}

/*
 * The gym-floor board for the TVs: a model of the building where each
 * zone's floor shows what it's doing (gold for a class, mint for open gym,
 * red when paused), in 3D or as an overhead plan, beside a rail with the
 * classes running, what's free and what's next. Opens at ?tv (?view=top
 * starts overhead), or from the coach app with `onExit`. The owners
 * reshape the floor at ?tv&edit.
 */
export default function FloorTV({ state: stored, setState, session, onExit }) {
  const owner = session?.kind === "staff" && !!session.owner;
  const map = useRef(null);
  const { now, preview, demo } = useNow(stored);
  // ?demo shows the scripted day, built in memory; nothing is saved.
  const state = useMemo(
    () => (demo ? demoState(stored, demo.day, demo.minute) : stored),
    [stored, demo?.day, demo?.minute],
  );
  // "plan" (the owners' floor plan), "use" (class floor use) or false.
  // ?tv&edit opens the plan, ?tv&edit=use the class floor use.
  const [editing, setEditing] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get("edit") === "use" ? "use" : q.has("edit") ? "plan" : false;
  });
  const actor = {
    role: "Coach",
    name: session?.name,
    staffId: session?.staffId,
    head: !!session?.head,
    owner: !!session?.owner,
  };
  // Owners, the gym manager and each class's head coach mark floor use.
  const marksUse =
    session?.kind === "staff" &&
    scheduleOf(stored).blocks.some(
      (b) => b.kind === "class" && canMarkUse(stored, actor, b.id),
    );
  const [view, setView] = useState(startView);
  const [feature, setFeature] = useState(0);
  const [held, setHeld] = useState(null);
  const [chrome, setChrome] = useState(true);
  // A new object each render would rebuild the scene every second.
  const layout = useMemo(() => layoutOf(state), [state.layout]);
  const status = floorStatus(state, now);
  const signature = status.zones.map((z) => `${z.id}:${z.status}`).join("|");

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Private window or blocked storage: the choice lasts this visit.
    }
  }, [view]);

  // The rail's photo cycles through zones worth showing, classes first.
  const showcase = useMemo(
    () =>
      status.zones
        .filter((z) => z.photo || z.note)
        .sort(
          (a, b) => rank[a.status] - rank[b.status] || !a.station - !b.station,
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );
  useEffect(() => {
    if (held || editing) return;
    const id = setInterval(() => setFeature((i) => i + 1), FEATURE_MS);
    return () => clearInterval(id);
  }, [held, editing]);
  useEffect(() => {
    if (!held) return;
    const id = setTimeout(() => setHeld(null), HOLD_MS);
    return () => clearTimeout(id);
  }, [held]);
  const featuredId =
    held ?? showcase[feature % Math.max(1, showcase.length)]?.id ?? null;
  const featured = status.zones.find((z) => z.id === featuredId) ?? null;

  // The toolbar shows on load and on mouse movement, then gets out of the
  // way on a TV. Opened from the coach app it stays.
  useEffect(() => {
    let id = setTimeout(() => setChrome(false), 5000);
    const show = () => {
      setChrome(true);
      clearTimeout(id);
      id = setTimeout(() => setChrome(false), 4000);
    };
    const key = (e) => {
      if (e.key === "v" || e.key === "V")
        setView((v) => (v === "top" ? "3d" : "top"));
    };
    window.addEventListener("pointermove", show);
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointermove", show);
      window.removeEventListener("keydown", key);
    };
  }, []);

  if (editing === "use")
    return (
      <Suspense fallback={<div className="ftv-loading" />}>
        <FloorUseEditor
          state={stored}
          setState={setState}
          session={session}
          onClose={() => setEditing(false)}
        />
      </Suspense>
    );
  if (editing)
    return (
      <Suspense fallback={<div className="ftv-loading" />}>
        <LayoutEditor
          state={stored}
          setState={setState}
          session={session}
          onClose={() => setEditing(false)}
        />
      </Suspense>
    );

  return (
    <main className={`ftv is-${view}`}>
      <FloorMap
        layout={layout}
        status={status}
        view={view}
        held={held}
        onPick={setHeld}
        apiRef={map}
      >
        {demo && (
          <DemoBar
            demo={demo}
            status={status}
            now={now}
            blocks={sessions(now, state)}
          />
        )}
        <div
          className={`ftv-tools${chrome || onExit ? " is-on" : ""}${onExit ? " is-embedded" : ""}`}
        >
          {preview && (
            <span className="ftv-preview">Preview {gymClockTime(now)}</span>
          )}
          <div className="ftv-switch" role="radiogroup" aria-label="View">
            {[
              ["3d", "3D"],
              ["top", "Overhead"],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ftv-tool"
            onClick={() => {
              setHeld(null);
              map.current?.home();
            }}
          >
            Reset view
          </button>
          {owner && !demo && (
            <button
              type="button"
              className="ftv-tool"
              onClick={() => setEditing("plan")}
            >
              Edit floor
            </button>
          )}
          {marksUse && !demo && (
            <button
              type="button"
              className="ftv-tool"
              onClick={() => setEditing("use")}
            >
              Class floor use
            </button>
          )}
          {onExit && (
            <button type="button" className="ftv-tool" onClick={onExit}>
              Back to the app
            </button>
          )}
        </div>
      </FloorMap>
      <Rail
        status={status}
        now={now}
        featured={featured}
        reopen={openAgain(nextOpening(state, now))}
      />
      <div className="sr-only" aria-live="polite">
        {status.zones
          .filter((z) => z.station)
          .map((z) => `${z.name}: ${stateLine(z) ?? "closed"}`)
          .join(". ")}
      </div>
    </main>
  );
}
