import React, { useState, useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import QRCode from "qrcode";
import { people } from "./domain.js";
import {
  stations,
  shoutouts,
  prizes,
  groups,
  sessions,
  emptyClub,
  clubStats,
  crowns,
  seasonKey,
  sessionName,
  stationFromInput,
  points,
} from "./club.js";
import { Meter } from "./ui.jsx";
import { currency } from "./gym.js";
import { useCountUp, sparkFrom } from "./motion.jsx";
import { num, plural, word, date, dayLabel } from "./format.js";
import "./club.css";

const statusText = {
  approved: "Confirmed",
  pending: "Waiting for trainer",
  revoked: "Corrected",
  rejected: "Dismissed",
};
const eventLabel = (e) =>
  e.kind === "class"
    ? "Class check-in"
    : e.kind === "open"
      ? "Open gym check-in"
      : e.kind === "bonus"
        ? `Bonus pick from ${e.coach}`
        : e.kind === "praise"
          ? e.category
          : `${stations.find((s) => s.id === e.station)?.name} · ${e.kind === "visit" ? "I tried it" : "I completed it"}`;
// Long lists show the latest entries first, then offer the rest.
const PAGE = 20;

function Stars({ value }) {
  return <span className="count-up">{num(useCountUp(value))}</span>;
}

function ShowAll({ total, open, onOpen }) {
  if (open || total <= PAGE) return null;
  return (
    <button className="text-button club-more" onClick={onOpen}>
      Show all ({num(total)})
    </button>
  );
}

function QRCard({ station }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set(
    station ? "station" : "class",
    station?.id ?? "check-in",
  );
  useEffect(() => {
    let active = true;
    QRCode.toString(url.href, { type: "svg", margin: 4, width: 220 })
      .then((svg) => {
        if (active)
          setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() =>
        setError("QR generation failed. Use the station code below."),
      );
    return () => {
      active = false;
    };
  }, [url.href]);
  return (
    <article className="club-qr">
      <h3>{station?.name ?? "Class check-in"}</h3>
      {src && (
        <img
          width="220"
          height="220"
          src={src}
          alt={`${station?.name ?? "Class"} check-in QR code`}
        />
      )}
      <p>{error || "Scan with your phone camera"}</p>
      <strong>{station?.code ?? "LAB-CLASS"}</strong>
      <a href={url.href}>
        Open check-in on this device <ArrowRight size={14} />
      </a>
    </article>
  );
}

export function ClubSummary({ state, childId, onOpen }) {
  const stats = clubStats(state, childId);
  const cur = currency(people.find((p) => p.id === childId));
  return (
    <button className="stat-tile tile-mint club-summary" onClick={onOpen}>
      <span className="eyebrow">Clubhouse</span>
      <strong className="stat-value">
        <Stars value={stats.total} />
      </strong>
      <b>lifetime {cur.many}</b>
      <small>
        {plural(stats.classes, "class", "classes")} ·{" "}
        {plural(stats.visits, "station check-in", "station check-ins")}
      </small>
      <span className="text-button">
        Open Clubhouse <ArrowRight size={14} />
      </span>
    </button>
  );
}

export function ClubHero({ state, childId }) {
  const stats = clubStats(state, childId);
  const cur = currency(people.find((p) => p.id === childId));
  return (
    <div className="hero club-hero">
      <div className="hero-copy">
        <h1 className="eyebrow">Clubhouse</h1>
        <h2>
          Every try <em>counts here.</em>
        </h2>
        <p className="lead">
          Show up. Try something brave. Cheer someone on. There’s more than one
          way to be a ninja.
        </p>
      </div>
      <div className="star-total">
        <strong>
          <Stars value={stats.total} />
        </strong>
        <span>lifetime {cur.many}</span>
        {stats.balance !== stats.total && (
          <small>{num(Math.max(0, stats.balance))} available to spend</small>
        )}
      </div>
    </div>
  );
}

export default function Club({ state, childId, role, commit }) {
  const club = state.club ?? emptyClub();
  const child = people.find((p) => p.id === childId);
  const cur = currency(child);
  const stats = clubStats(state, childId);
  const [tab, setTab] = useState("My passport");
  const [session, setSession] = useState(sessions()[0]?.id ?? "");
  const [station, setStation] = useState(
    () => stationFromInput(window.location.href) ?? "grip",
  );
  const [code, setCode] = useState("");
  const [coach, setCoach] = useState("Coach Jordan");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [roster, setRoster] = useState([childId]);
  const [reason, setReason] = useState("");
  const profile = club.profiles[childId] ?? {
    optIn: false,
    alias: `${child.first} ninja`,
    group: child.age <= 8 ? groups[0] : groups[1],
  };
  const [group, setGroup] = useState(profile.group);
  const [alias, setAlias] = useState(profile.alias);
  const [optIn, setOptIn] = useState(profile.optIn);
  const [showQR, setShowQR] = useState(false);
  const [fullLedger, setFullLedger] = useState(false);
  const [fullRecords, setFullRecords] = useState(false);
  const tabsRef = useRef(null);
  useEffect(() => {
    // Keep the active tab visible when the strip scrolls horizontally on phones.
    const strip = tabsRef.current;
    const active = strip?.querySelector('[aria-pressed="true"]');
    if (!strip || !active) return;
    const left = active.offsetLeft - 8;
    const right = active.offsetLeft + active.offsetWidth + 8;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = right - strip.clientWidth;
  }, [tab]);
  useEffect(() => {
    setGroup(profile.group);
    setAlias(profile.alias);
    setOptIn(profile.optIn);
    setRoster([childId]);
    setFeedback("");
    setFullLedger(false);
    setFullRecords(false);
  }, [childId]);
  const send = (action, message) => {
    const ok = commit({
      ...action,
      childId: action.childId ?? childId,
      role,
      coach,
    });
    if (ok) setFeedback(message);
    return ok;
  };
  const record = (kind, extra = {}) =>
    send(
      { type: "record", kind, station, session, note, ...extra },
      role === "Coach"
        ? "Recorded. Their effort counts."
        : `Sent to your trainer. ${cur.many} arrive after confirmation.`,
    );
  // Stars land immediately only when a coach records them.
  const award = (e, kind, extra) => {
    const el = e.currentTarget;
    if (record(kind, extra) && role === "Coach") sparkFrom(el);
  };
  const rows = club.events
    .filter((e) => e.childId === childId)
    .slice()
    .reverse();
  const records = stats.events.slice().reverse();
  const pending = club.events
    .filter((e) => e.status === "pending")
    .sort(
      (a, b) => (a.kind === "class" ? 0 : 1) - (b.kind === "class" ? 0 : 1),
    );
  const cards = crowns(club, profile.group);
  const attendance = club.events.find(
    (e) =>
      e.childId === childId &&
      e.kind === "class" &&
      e.session === session &&
      ["pending", "approved"].includes(e.status),
  );
  const next = stats.badges.filter((b) => !b.earned).slice(0, 1)[0];
  return (
    <div className="club">
      <div className="club-stats">
        {[
          [stats.classes, "class", "classes"],
          [stats.visits, "station stamp", "station stamps"],
          [stats.days, "gym day", "gym days"],
          [
            stats.badges.filter((b) => b.earned).length,
            "milestone badge",
            "milestone badges",
          ],
        ].map(([n, one, many]) => (
          <article key={many}>
            <strong>{num(n)}</strong>
            <b>{word(n, one, many)}</b>
          </article>
        ))}
      </div>
      <nav className="club-tabs" aria-label="Clubhouse sections" ref={tabsRef}>
        {[
          "My passport",
          "Station crowns",
          "Rewards",
          ...(role === "Coach" ? ["Trainer tools"] : []),
        ].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {feedback && (
        <p className="club-feedback" role="status">
          {feedback}
        </p>
      )}
      {(tab === "My passport" ||
        (tab === "Trainer tools" && role !== "Coach")) && (
        <>
          <div className="club-two">
            <section className="card club-panel">
              <h3>Collect today’s stamps</h3>
              <label>
                Today’s class
                <select
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                >
                  {sessions().map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button navy"
                disabled={!!attendance}
                onClick={(e) => award(e, "class")}
              >
                {attendance
                  ? attendance.status === "approved"
                    ? "Checked in"
                    : "Attendance awaiting trainer"
                  : `Check into this class · +5 ${cur.many}`}
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim().toUpperCase() === "LAB-CLASS") {
                    record("class");
                    return;
                  }
                  const id = stationFromInput(code);
                  if (id) {
                    setStation(id);
                    setFeedback(
                      "Station found. Tap “I tried this station” to submit.",
                    );
                  } else
                    setFeedback(
                      "Code not recognized. Try LAB-GRIP or ask your trainer.",
                    );
                }}
              >
                <label>
                  Station code or QR link
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. LAB-GRIP"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="off"
                    enterKeyHint="go"
                  />
                </label>
                <button className="button outline" type="submit">
                  Find my station
                </button>
              </form>
              <label>
                Station
                <select
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                >
                  {stations.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button cyan"
                onClick={(e) => award(e, "visit")}
              >
                I tried this station · +2 {cur.many}
              </button>
            </section>
            <section className="card club-panel club-milestone">
              <span className="eyebrow">Your next little victory</span>
              <h3>{next?.name ?? "A passport full of progress"}</h3>
              <p>
                {next
                  ? `${num(next.count)} of ${plural(next.target, next.unitOne, next.unit)}.`
                  : "You’ve earned every milestone. Keep exploring."}
              </p>
              {next && (
                <Meter
                  value={Math.min(next.count, next.target)}
                  max={next.target}
                  color="var(--gold)"
                  label={next.name}
                  className="thick"
                />
              )}
              <div className="club-callout">
                <p>
                  <b>100 tries. All heart.</b>
                  <br />
                  100 confirmed station check-ins earns a special badge and 100
                  bonus {cur.many}.
                </p>
              </div>
            </section>
          </div>
          <div className="club-section-title">
            <h3>Your station passport</h3>
          </div>
          <div className="club-stations">
            {stations.map((s) => {
              const visits = stats.events.filter(
                (e) => e.kind === "visit" && e.station === s.id,
              ).length;
              const completions = stats.events.filter(
                (e) => e.kind === "complete" && e.station === s.id,
              ).length;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setStation(s.id);
                    setFeedback(`${s.name} selected in the check-in form.`);
                  }}
                >
                  <h4>{s.name}</h4>
                  <strong>
                    {num(visits)} <span>{word(visits, "try", "tries")}</span>
                  </strong>
                  <small>
                    {plural(
                      completions,
                      "trainer-confirmed completion",
                      "trainer-confirmed completions",
                    )}
                  </small>
                </button>
              );
            })}
          </div>
          <h3 className="club-block-heading">Milestone collection</h3>
          <div className="card club-badges">
            {stats.badges.map((b) => (
              <article key={b.id} className={b.earned ? "earned" : ""}>
                <h4>{b.name}</h4>
                <Meter
                  value={Math.min(b.count, b.target)}
                  max={b.target}
                  color="var(--gold)"
                  label={b.name}
                />
                <p>
                  {b.earned
                    ? "Earned"
                    : `${num(Math.min(b.count, b.target))} / ${plural(b.target, b.unitOne, b.unit)}`}
                </p>
                <small>
                  {b.bonus
                    ? `+${plural(b.bonus, cur.one, cur.many)}`
                    : "First badge"}
                </small>
              </article>
            ))}
          </div>
          <section className="card club-panel club-ledger">
            <h3>{child.first}’s effort story</h3>
            {!rows.length && (
              <p className="club-empty">
                Your first class star starts this story.
              </p>
            )}
            {(fullLedger ? rows : rows.slice(0, PAGE)).map((e) => (
              <div key={e.id}>
                <span>
                  <b>{eventLabel(e)}</b>
                  <small>
                    {date(e.at)} · {statusText[e.status]}
                    {e.coach && ` · ${e.coach}`}
                  </small>
                  {e.note && <small>{e.note}</small>}
                  {e.reason && <small>Correction: {e.reason}</small>}
                </span>
                <b>{e.status === "approved" ? `+${points[e.kind]}` : "—"}</b>
              </div>
            ))}
            <ShowAll
              total={rows.length}
              open={fullLedger}
              onOpen={() => setFullLedger(true)}
            />
          </section>
        </>
      )}
      {tab === "Station crowns" && (
        <>
          <section className="card club-panel">
            <h3>A fresh chance every week</h3>
            <p>
              Week of {dayLabel(seasonKey())} · {profile.group}
            </p>
            <p>
              Most completion days at a station earns its crown. Ties share the
              crown.
            </p>
            {role !== "Athlete" && (
              <form
                className="club-preferences"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(
                    { type: "profile", group, alias, optIn },
                    "Competition preferences saved.",
                  );
                }}
              >
                <label>
                  Nickname on crown boards
                  <input
                    maxLength="24"
                    autoComplete="off"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                  />
                </label>
                <label>
                  Age / skill group
                  <select
                    disabled={role !== "Coach"}
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                  >
                    {groups.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label className="club-check">
                  <input
                    type="checkbox"
                    checked={optIn}
                    onChange={(e) => setOptIn(e.target.checked)}
                  />{" "}
                  Join station crown challenges
                </label>
                <button className="button navy">
                  Save competition preferences
                </button>
              </form>
            )}
            {role === "Athlete" && !profile.optIn && (
              <p>Ask your parent or trainer to join a crown challenge.</p>
            )}
          </section>
          <div className="club-crowns">
            {cards.map((s) => (
              <article className="card club-panel" key={s.id}>
                <span className="eyebrow">Station crown</span>
                <h3>{s.name}</h3>
                {s.winners.length ? (
                  <>
                    <strong>{s.winners.map((w) => w.name).join(" & ")}</strong>
                    <p>
                      {plural(
                        s.winners[0].count,
                        "completion day",
                        "completion days",
                      )}{" "}
                      this week
                    </p>
                  </>
                ) : (
                  <>
                    <strong>The crown is open</strong>
                    <p>One confirmed completion day can start your story.</p>
                  </>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "Rewards" && (
        <>
          <section className="card club-panel">
            <h3>
              {plural(Math.max(0, stats.balance), cur.one, cur.many)} to spend
            </h3>
            <p>
              {num(stats.skillPoints)} from skill badges +{" "}
              {num(stats.participationPoints)} from participation and
              recognition + {num(stats.milestonePoints)} from milestones.
            </p>
            {stats.balance < 0 && (
              <p role="alert">
                A corrected record affected your balance. A trainer needs to
                review pending rewards.
              </p>
            )}
          </section>
          <div className="club-crowns">
            {prizes.map((p) => (
              <article className="card club-panel" key={p.id}>
                <h3>{p.name}</h3>
                <strong>{plural(p.cost, cur.one, cur.many)}</strong>
                <button
                  className="button navy"
                  disabled={role === "Athlete" || stats.balance < p.cost}
                  onClick={() =>
                    send(
                      { type: "redeem", prizeId: p.id },
                      `Reward requested. Your ${cur.many} are reserved.`,
                    )
                  }
                >
                  {role === "Athlete"
                    ? "Ask a parent to request"
                    : "Request reward"}
                </button>
              </article>
            ))}
          </div>
          <section className="card club-panel">
            <h3>Your reward requests</h3>
            {!club.claims.some((r) => r.childId === childId) && (
              <p>No requests yet.</p>
            )}
            {club.claims
              .filter((r) => r.childId === childId)
              .map((r) => (
                <div className="club-claim" key={r.id}>
                  <span>
                    {prizes.find((p) => p.id === r.prizeId).name} · {r.status}
                  </span>
                  {role === "Coach" && r.status === "Requested" && (
                    <>
                      <button
                        className="button outline"
                        onClick={() =>
                          send(
                            { type: "fulfill", id: r.id },
                            "Reward collected.",
                          )
                        }
                      >
                        Mark collected
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          send(
                            { type: "cancel", id: r.id },
                            `Request cancelled; ${cur.many} released.`,
                          )
                        }
                      >
                        Cancel request
                      </button>
                    </>
                  )}
                </div>
              ))}
          </section>
          <p className="club-hint">
            Demo rewards and prices are proposals. No orders or inventory
            reservations are sent.
          </p>
        </>
      )}
      {tab === "Trainer tools" && role === "Coach" && (
        <>
          <div className="club-two">
            <section className="card club-panel">
              <h3>Make someone’s effort visible</h3>
              <label>
                Trainer name
                <input
                  value={coach}
                  onChange={(e) => setCoach(e.target.value)}
                  maxLength="40"
                  autoComplete="name"
                  autoCapitalize="words"
                />
              </label>
              <label>
                Today’s class
                <select
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                >
                  {sessions().map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Demo class roster</legend>
                {people.map((p) => (
                  <label className="club-check" key={p.id}>
                    <input
                      type="checkbox"
                      checked={roster.includes(p.id)}
                      onChange={(e) =>
                        setRoster(
                          e.target.checked
                            ? [...roster, p.id]
                            : roster.filter((id) => id !== p.id),
                        )
                      }
                    />
                    {p.first}
                  </label>
                ))}
              </fieldset>
              <button
                className="button navy"
                disabled={!roster.length}
                onClick={(e) => {
                  const el = e.currentTarget;
                  const actions = roster
                    .filter(
                      (id) =>
                        !club.events.some(
                          (e) =>
                            e.childId === id &&
                            e.kind === "class" &&
                            e.session === session &&
                            e.status === "approved",
                        ),
                    )
                    .map((id) => {
                      const pending = club.events.find(
                        (e) =>
                          e.childId === id &&
                          e.kind === "class" &&
                          e.session === session &&
                          e.status === "pending",
                      );
                      return pending
                        ? {
                            type: "approve",
                            id: pending.id,
                            childId: id,
                            role,
                            coach,
                          }
                        : {
                            type: "record",
                            kind: "class",
                            session,
                            childId: id,
                            role,
                            coach,
                          };
                    });
                  if (!actions.length)
                    setFeedback("Everyone selected already has a class star.");
                  else if (commit(actions)) {
                    setFeedback("Class stars awarded to the selected roster.");
                    sparkFrom(el);
                  }
                }}
              >
                Give selected kids a class star
              </button>
              <h4>Recognize {child.first}</h4>
              <div className="club-praise">
                {shoutouts.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => award(e, "praise", { category: s })}
                  >
                    {s}
                    <b>+3</b>
                  </button>
                ))}
              </div>
              <p className="club-hint">
                Up to three recognition awards per child per day. Attendance
                must be confirmed first.
              </p>
            </section>
            <section className="card club-panel">
              <h3>Celebrate a completed obstacle</h3>
              <p>Skill-tier assessment stays in Coach desk.</p>
              <label>
                Station
                <select
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What did {child.first} complete?
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Wall A: caught the top on the approved setup"
                  maxLength="500"
                />
              </label>
              <button
                className="button cyan"
                onClick={(e) => award(e, "complete")}
              >
                Confirm completion · +5 stars
              </button>
              <p className="club-hint">Once per station per class.</p>
            </section>
          </div>
          <section className="card club-panel">
            <h3>Check-in requests · {pending.length}</h3>
            {!pending.length && (
              <p className="club-empty">
                All caught up. New scans will land here.
              </p>
            )}
            {pending.map((e) => (
              <div className="club-claim" key={e.id}>
                <span>
                  <b>{people.find((p) => p.id === e.childId).first}</b> ·{" "}
                  {e.kind === "class"
                    ? "Class attendance"
                    : stations.find((s) => s.id === e.station)?.name}
                  <small>
                    {sessionName(e.session)} · {date(e.at)}
                  </small>
                </span>
                <button
                  className="button navy"
                  onClick={() =>
                    send(
                      { type: "approve", id: e.id, childId: e.childId },
                      "Check-in confirmed.",
                    )
                  }
                >
                  Confirm
                </button>
                <button
                  className="button outline"
                  onClick={() =>
                    send(
                      { type: "reject", id: e.id, childId: e.childId },
                      "Request dismissed.",
                    )
                  }
                >
                  Dismiss
                </button>
              </div>
            ))}
          </section>
          <section className="card club-panel">
            <h3>Station QR signs</h3>
            <p>Codes open a station-specific check-in.</p>
            <p className="club-hint">
              Scans record on the phone that scanned. This demo has no shared
              server, so they won’t reach this screen.
            </p>
            <button
              className="button outline"
              onClick={() => setShowQR(!showQR)}
            >
              {showQR ? "Hide QR signs" : "Generate QR signs"}
            </button>
            {showQR && (
              <div className="club-qr-grid">
                <QRCard />
                {stations.map((s) => (
                  <QRCard key={s.id} station={s} />
                ))}
              </div>
            )}
          </section>
          <details className="card club-panel">
            <summary>Correct a participation record</summary>
            <label>
              Correction reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength="200"
                enterKeyHint="done"
              />
            </label>
            {!records.length && <p className="club-empty">No records yet.</p>}
            {(fullRecords ? records : records.slice(0, PAGE)).map((e) => (
              <div className="club-claim" key={e.id}>
                <span>
                  {eventLabel(e)}
                  <small>
                    {date(e.at)}
                    {e.coach && ` · ${e.coach}`}
                  </small>
                </span>
                <button
                  className="button outline"
                  disabled={!reason.trim()}
                  onClick={() =>
                    send(
                      { type: "revoke", id: e.id, reason },
                      "Record corrected. Points, badges and crowns recalculated.",
                    )
                  }
                >
                  Correct record
                </button>
              </div>
            ))}
            <ShowAll
              total={records.length}
              open={fullRecords}
              onOpen={() => setFullRecords(true)}
            />
          </details>
        </>
      )}
      <details className="card club-panel club-rules">
        <summary>How {cur.many} work</summary>
        <div className="club-rule-grid">
          {[
            ["+5", "One confirmed class"],
            ["+5", "Checked into open gym by a coach"],
            ["+10", "Bonus pick from a coach · 3 per coach per class"],
            ["+2", "Trying a station / class"],
            ["+3", "Trainer recognition · max 3/day"],
            ["+5", "Confirmed completion / station / class"],
            ["20–50", "New verified skill · by tier"],
            ["Milestones", `Bonus ${cur.many} for classes, tries and gym days`],
          ].map(([n, label]) => (
            <div key={label}>
              <b>{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <p>A scan requests credit; a trainer confirms it.</p>
      </details>
    </div>
  );
}
