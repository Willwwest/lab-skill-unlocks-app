import React, {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { clock, dayKey } from "./club.js";
import { gymClockTime, gymFullDay, gymLocalIso } from "./gym-time.js";
import { floorStatus, layoutOf } from "./layout.js";
import { createFloorScene } from "./floorScene.js";
import { stationLabel } from "./gym.js";
import "./ds/tokens.css";
import "./floortv.css";

const LayoutEditor = lazy(() => import("./LayoutEditor.jsx"));
// The public build leaves the gym photos out (they show kids); see
// scripts/publish-app.sh.
const FLOOR_PHOTOS = import.meta.env.VITE_FLOOR_PHOTOS !== "off";

const FEATURE_MS = 12000;
const HOLD_MS = 45000;
const VIEW_KEY = "lab-floor-view";
const reduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// "4:05" from milliseconds.
const countdown = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ?at=15:40 previews the board at that time today on the gym clock.
function previewOffset() {
  const at = new URLSearchParams(window.location.search).get("at");
  if (!/^\d{1,2}:\d{2}$/.test(at ?? "")) return 0;
  const [h, m] = at.split(":");
  const when = Date.parse(
    gymLocalIso(dayKey(new Date()), `${h.padStart(2, "0")}:${m}`),
  );
  return Number.isFinite(when) ? when - Date.now() : 0;
}

function useNow() {
  const offset = useMemo(previewOffset, []);
  const [now, setNow] = useState(() => new Date(Date.now() + offset));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    return () => clearInterval(id);
  }, [offset]);
  return { now, preview: offset !== 0 };
}

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

function zoneDetail(z) {
  if (z.status === "class") {
    const c = z.class;
    if (c.group)
      return `Group ${c.group} · ${c.kids} ${c.kids === 1 ? "kid" : "kids"} · moves in ${countdown(c.rotateIn)}`;
    return `${c.name}${c.ages ? ` · ages ${c.ages}` : ""} · until ${clock(c.end)}`;
  }
  if (z.status === "open")
    return z.soon
      ? `Free now · ${z.soon.name} at ${clock(z.soon.start)}`
      : "Free for open gym";
  if (z.status === "paused") return z.reason;
  return null;
}

// Which labels win a spot when two would overlap.
const rank = { class: 0, paused: 1, open: 2, amenity: 3, closed: 4 };

function Label({ zone, selected, innerRef }) {
  const minor = !zone.station;
  const line = minor ? null : stateLine(zone);
  return (
    <div
      ref={innerRef}
      className={`ftv-label is-${zone.status}${minor ? " is-minor" : ""}${selected ? " is-selected" : ""}`}
      aria-hidden="true"
    >
      <span className="ftv-label-name">{zone.name}</span>
      {line && <span className="ftv-label-state">{line}</span>}
    </div>
  );
}

function Featured({ zone }) {
  if (!zone) return null;
  const photo =
    zone.photo && FLOOR_PHOTOS
      ? `${import.meta.env.BASE_URL}floor/${zone.photo}.webp`
      : null;
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

function Rail({ status, now, featured }) {
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
          <h3>Closed</h3>
          <p>
            {status.next[0]
              ? `Doors open at ${clock(status.next[0].start)}.`
              : "See you tomorrow."}
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
            <ul className="ftv-rows">
              {zones.map((z) => (
                <li key={z.id}>
                  <span>{z.name}</span>
                  {z.class.group && (
                    <small>
                      Group {z.class.group} · {countdown(z.class.rotateIn)}
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
          <ul className="ftv-rows">
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
export default function FloorTV({ state, setState, session, onExit }) {
  const owner = session?.kind === "staff" && !!session.owner;
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const labels = useRef({});
  const sizes = useRef({});
  const order = useRef({});
  const { now, preview } = useNow();
  const [editing, setEditing] = useState(() =>
    new URLSearchParams(window.location.search).has("edit"),
  );
  const [view, setView] = useState(startView);
  const [error, setError] = useState("");
  const [feature, setFeature] = useState(0);
  const [held, setHeld] = useState(null);
  const [chrome, setChrome] = useState(true);
  // A new object each render would rebuild the scene every second.
  const layout = useMemo(() => layoutOf(state), [state.layout]);
  const status = floorStatus(state, now);
  const signature = status.zones.map((z) => `${z.id}:${z.status}`).join("|");

  // Label sizes and priority change only with their text; refresh after
  // each render so the frame loop reads them without touching layout.
  useLayoutEffect(() => {
    for (const [id, el] of Object.entries(labels.current))
      if (el) sizes.current[id] = { w: el.offsetWidth, h: el.offsetHeight };
    order.current = Object.fromEntries(
      [...status.zones]
        .sort(
          (a, b) =>
            rank[a.status] - rank[b.status] ||
            !a.station - !b.station ||
            b.w * b.d - a.w * a.d,
        )
        .map((z, i) => [z.id, i]),
    );
  });

  useEffect(() => {
    if (editing) return;
    let scene;
    try {
      scene = createFloorScene(canvasRef.current, { reducedMotion: reduced() });
    } catch {
      setError("This screen can't draw the floor (WebGL is off).");
      return;
    }
    sceneRef.current = scene;
    // Place labels, then hide any that would overlap a more important one.
    scene.onFrame = (pos, mode) => {
      const placed = [];
      const rankOf = order.current;
      const ids = Object.keys(pos).sort(
        (a, b) => (rankOf[a] ?? 99) - (rankOf[b] ?? 99),
      );
      for (const id of ids) {
        const el = labels.current[id];
        const s = sizes.current[id];
        const p = pos[id];
        if (!el || !s) continue;
        const left = p.x - s.w / 2;
        const top = mode === "top" ? p.y - s.h / 2 : p.y - s.h - 6;
        const box = {
          l: left - 8,
          t: top - 4,
          r: left + s.w + 8,
          b: top + s.h + 4,
        };
        const clash = placed.some(
          (o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t,
        );
        const show = !p.behind && !clash && top > 8;
        el.style.transform = `translate(${left}px, ${top}px)`;
        el.style.opacity = show ? "" : 0;
        if (show) placed.push(box);
      }
    };
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [editing]);

  useEffect(() => {
    sceneRef.current?.setZones(layout.zones);
    sceneRef.current?.setStatus(status.zones);
    sceneRef.current?.setView(view);
    // Rebuild only when the plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, editing]);
  useEffect(() => {
    sceneRef.current?.setStatus(status.zones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, editing]);
  useEffect(() => {
    sceneRef.current?.setView(view);
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
    sceneRef.current?.focus(held);
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

  const down = useRef(null);
  const onPointerDown = (e) => (down.current = { x: e.clientX, y: e.clientY });
  const onPointerUp = (e) => {
    const d = down.current;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    setHeld(sceneRef.current?.pick(e.clientX, e.clientY) ?? null);
  };

  if (editing)
    return (
      <Suspense fallback={<div className="ftv-loading" />}>
        <LayoutEditor
          state={state}
          setState={setState}
          session={session}
          onClose={() => setEditing(false)}
        />
      </Suspense>
    );

  return (
    <main className={`ftv is-${view}`}>
      <div className="ftv-stage">
        <canvas
          ref={canvasRef}
          className="ftv-canvas"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          aria-label={
            view === "top"
              ? "Overhead plan of the gym floor"
              : "3D model of the gym floor"
          }
          role="img"
        />
        <div className="ftv-labels">
          {status.zones.map((z) => (
            <Label
              key={z.id}
              zone={z}
              selected={z.id === held}
              innerRef={(el) => (labels.current[z.id] = el)}
            />
          ))}
        </div>
        <ul className="ftv-legend" aria-label="Legend">
          <li className="is-class">Class</li>
          <li className="is-open">Open gym</li>
          <li className="is-paused">Paused</li>
          <li className="is-amenity">Shared space</li>
        </ul>
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
              sceneRef.current?.home();
            }}
          >
            Reset view
          </button>
          {owner && (
            <button
              type="button"
              className="ftv-tool"
              onClick={() => setEditing(true)}
            >
              Edit floor
            </button>
          )}
          {onExit && (
            <button type="button" className="ftv-tool" onClick={onExit}>
              Back to the app
            </button>
          )}
        </div>
        {error && <p className="ftv-error">{error}</p>}
      </div>
      <Rail status={status} now={now} featured={featured} />
      <div className="sr-only" aria-live="polite">
        {status.zones
          .filter((z) => z.station)
          .map((z) => `${z.name}: ${stateLine(z) ?? "closed"}`)
          .join(". ")}
      </div>
    </main>
  );
}
