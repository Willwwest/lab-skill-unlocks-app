import React, { useEffect, useMemo, useState } from "react";
import { clock, sessions } from "./club.js";
import { GYM_TIME_ZONE, gymClockTime, gymFullDay } from "./gym-time.js";
import { floorStatus, layoutOf } from "./layout.js";
import { plain } from "./skillcopy.js";
import { MoveArt } from "./moves.jsx";
import FloorMap from "./FloorMap.jsx";
import { useNow } from "./tvkit.js";
import { demoState } from "./demoday.js";
import DemoBar from "./DemoBar.jsx";
import {
  nextOpening,
  openAgain,
  earnNow,
  todaySchedule,
  weeklyCrowns,
  weeklyShoutouts,
} from "./tvs.js";
import "./ds/tokens.css";
import "./floortv.css";
import "./desktv.css";

const PANEL_MS = 15000;
const weekday = new Intl.DateTimeFormat("en-US", {
  timeZone: GYM_TIME_ZONE,
  weekday: "short",
});

function Schedule({ blocks, closed }) {
  const next = blocks.find((b) => b.phase === "upcoming");
  if (closed)
    return (
      <div className="dtv-closed">
        <strong>Closed today</strong>
        <span>{closed}</span>
      </div>
    );
  return (
    <ol className="dtv-schedule">
      {blocks.map((b) => {
        const tone = b.kind === "class" ? "is-class" : "is-open";
        const tag =
          b.phase === "live" ? "Now" : b.id === next?.id ? "Next" : null;
        return (
          <li key={b.id} className={`${tone} is-${b.phase}`}>
            <time>
              {clock(b.start)}–{clock(b.end)}
            </time>
            <strong>
              {b.name}
              {tag && <em>{tag}</em>}
            </strong>
            <span>
              {[
                b.kind === "class" ? `Class · ages ${b.ages}` : "Open gym",
                b.lead,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Moves({ items, status }) {
  if (!items.length) {
    const nextOpen = status.next.find((b) => b.kind === "open");
    return (
      <p className="dtv-empty">
        {status.hours.closedToday
          ? "The gym is closed today."
          : !status.hours.open
            ? "Points open up when the gym does."
            : nextOpen
              ? `Everything is in class right now. Open gym starts at ${clock(nextOpen.start)}.`
              : "Everything is in class right now."}
      </p>
    );
  }
  return (
    <ul className="dtv-cards">
      {items.map((m) => (
        <li key={m.skill.id} className="dtv-move">
          <MoveArt skillId={m.skill.id} />
          <strong>{m.skill.title}</strong>
          <p>{plain[m.skill.id] ?? m.skill.criteria}</p>
          <footer>
            <span>
              {m.zone.name}
              {m.soon && <small> · until {clock(m.soon.start)}</small>}
            </span>
            <b>+{m.points}</b>
          </footer>
        </li>
      ))}
    </ul>
  );
}

function Crowns({ crowns }) {
  return (
    <ul className="dtv-cards">
      {crowns.map((c) => (
        <li key={c.station} className="dtv-crown">
          <span className="dtv-kicker">{c.stationName}</span>
          <strong>{c.holders.map((h) => h.name).join(" & ")}</strong>
          <p>
            {c.days} {c.days === 1 ? "day" : "days"} this week
          </p>
        </li>
      ))}
    </ul>
  );
}

function Shoutouts({ list }) {
  return (
    <ul className="dtv-cards">
      {list.map((s) => (
        <li key={s.id} className="dtv-shout">
          <span className="dtv-kicker">{s.category}</span>
          <strong>{s.name}</strong>
          <p>
            {[s.coach, weekday.format(new Date(s.at))]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

/*
 * The TV behind the front desk (?tv=desk): the live gym map, today's class
 * schedule down the right, and a strip along the bottom that rotates
 * between the movements kids can earn points on right now (on equipment
 * no class is using), this week's crowns and coach shoutouts. Crowns and
 * shoutouts appear only when there are some, and name only kids whose
 * families opted in. ?view=top shows the map overhead; ?at=15:40 previews.
 */
export default function DeskTV({ state: stored }) {
  const { now, preview, demo } = useNow(stored);
  // ?demo shows the scripted day, built in memory; nothing is saved.
  const state = useMemo(
    () => (demo ? demoState(stored, demo.day, demo.minute) : stored),
    [stored, demo?.day, demo?.minute],
  );
  const [turn, setTurn] = useState(0);
  const layout = useMemo(() => layoutOf(state), [state.layout]);
  const status = floorStatus(state, now);
  const view =
    new URLSearchParams(window.location.search).get("view") === "top"
      ? "top"
      : "3d";
  const moves = earnNow(state, now);
  const crowns = weeklyCrowns(state, now);
  const shouts = weeklyShoutouts(state, now);
  const panels = [
    {
      id: "moves",
      title: "Earn points now",
      body: <Moves items={moves} status={status} />,
    },
    crowns.length && {
      id: "crowns",
      title: "This week's crowns",
      body: <Crowns crowns={crowns} />,
    },
    shouts.length && {
      id: "shouts",
      title: "Coach shoutouts",
      body: <Shoutouts list={shouts} />,
    },
  ].filter(Boolean);
  const panel = panels[turn % panels.length];

  useEffect(() => {
    if (panels.length < 2) return;
    const id = setInterval(() => setTurn((t) => t + 1), PANEL_MS);
    return () => clearInterval(id);
  }, [panels.length]);

  return (
    <main className="dtv">
      <FloorMap layout={layout} status={status} view={view} className="dtv-map">
        {demo && (
          <DemoBar
            demo={demo}
            status={status}
            now={now}
            blocks={sessions(now, state)}
          />
        )}
      </FloorMap>
      <section
        className="dtv-strip"
        aria-label={panel.title}
        aria-live="polite"
      >
        <header>
          <h2 className="ftv-eyebrow">{panel.title}</h2>
          {panels.length > 1 && (
            <ol className="dtv-dots" aria-hidden="true">
              {panels.map((p) => (
                <li key={p.id} className={p.id === panel.id ? "is-on" : ""} />
              ))}
            </ol>
          )}
        </header>
        <div className="dtv-panel" key={panel.id}>
          {panel.body}
        </div>
      </section>
      <aside className="dtv-rail" aria-label="Today's schedule">
        <header className="ftv-head">
          <img src={`${import.meta.env.BASE_URL}lab-white.svg`} alt="The LAB" />
          <time>{gymClockTime(now)}</time>
          <span>
            {gymFullDay(now)}
            {preview && " · preview"}
          </span>
        </header>
        <h2 className="ftv-eyebrow dtv-today">Today</h2>
        <Schedule
          blocks={todaySchedule(state, now)}
          closed={
            status.hours.closedToday && openAgain(nextOpening(state, now))
          }
        />
      </aside>
    </main>
  );
}
