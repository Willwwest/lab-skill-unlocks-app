import React, { useEffect, useRef, useState } from "react";
import { Camera, Check, Minus, Plus, X } from "lucide-react";
import {
  apply,
  catalog,
  earnedIds,
  formatResult,
  people,
  tierProgress,
  tiers,
} from "./domain.js";
import { clubStats, prizes, shoutouts, stations, sessions } from "./club.js";
import {
  applyFloor,
  arrival,
  birthdayIn,
  classToday,
  eventsToday,
  groupLabel,
  photoConsent,
  readySkills,
  shirtGap,
  shirtsToHandOut,
  stationFor,
} from "./floor.js";
import { familyOf, kidInfo } from "./roster.js";
import { Avatar, Photo } from "./photos.jsx";
import { Meter, ShirtImage } from "./ui.jsx";
import { sparkFrom } from "./motion.jsx";
import {
  clockTime,
  coachAct,
  completionPresets,
  describeEvent,
  points,
  recordAt,
  skillStars,
  starsToday,
  stationName,
} from "./coachkit.jsx";
import { date } from "./format.js";
import { plain, standard } from "./skillcopy.js";

function Section({ title, aside, children, className = "" }) {
  return (
    <section className={`kp-section ${className}`.trim()}>
      <div className="kp-section-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function KidPanel({ childId, ops, now, onClose }) {
  const { state, actor, block, station } = ops;
  const child = people.find((p) => p.id === childId);
  const info = kidInfo[childId] ?? {};
  const family = familyOf(childId);
  const here = arrival(state, childId, now);
  const today = eventsToday(state, childId, now);
  const consent = photoConsent(state, childId);
  const stats = clubStats(state, childId);
  const gap = shirtGap(state, childId);
  const earned = new Set(earnedIds(state, childId));
  const goals = (state.goals?.[childId] ?? []).filter((id) => !earned.has(id));
  const ready = readySkills(state, childId, station).slice(0, 6);
  const elsewhere = readySkills(state, childId)
    .filter((s) => stationFor(s) !== station)
    .slice(0, 4);
  const inBlock = (kind) =>
    today.some(
      (e) => e.kind === kind && e.station === station && e.session === block.id,
    );
  const praiseToday = today.filter((e) => e.kind === "praise");
  const notes = (state.floor?.notes ?? [])
    .filter((n) => n.childId === childId)
    .slice()
    .reverse();
  const moments = (state.floor?.moments ?? [])
    .filter((m) => m.childId === childId)
    .slice()
    .reverse();
  const handouts = shirtsToHandOut(state, childId);
  const claims = (state.club?.claims ?? []).filter(
    (r) => r.childId === childId && r.status === "Requested",
  );
  const birthday = birthdayIn(childId, now);
  const nextClass = classToday(childId, now);
  const outage = state.floor?.outages?.[station];
  const [completing, setCompleting] = useState(false);
  const [other, setOther] = useState("");
  const [noteText, setNoteText] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [correcting, setCorrecting] = useState(null);
  const [reason, setReason] = useState("");
  const panel = useRef(null);
  useEffect(() => {
    setCompleting(false);
    setCorrecting(null);
    panel.current?.scrollTo?.(0, 0);
    panel.current?.focus();
  }, [childId]);
  const record = (e, kind, extra, message) => {
    const el = e?.currentTarget;
    return ops.run(
      message,
      (s) =>
        recordAt(
          s,
          actor,
          block,
          childId,
          kind,
          { station, ...extra },
          new Date(),
        ),
      { spark: el },
    );
  };
  const complete = (e, task) => {
    if (
      record(
        e,
        "complete",
        { note: task },
        `${child.first} completed ${task}. +5 stars`,
      )
    ) {
      setCompleting(false);
      setOther("");
    }
  };
  const recent = [
    ...today.map((e) => ({
      at: e.at,
      label: describeEvent(e),
      by: e.coach,
      status: e.status,
      id: e.id,
      kind: "event",
      stars: points[e.kind],
    })),
    ...state.awards
      .filter((a) => a.childId === childId && !a.revoked)
      .map((a) => {
        const s = catalog.find((x) => x.id === a.skillId);
        return {
          at: a.at,
          label: `Unlocked ${s.title}`,
          by: a.coach,
          status: "approved",
          id: a.id,
          kind: "award",
          stars: skillStars(s),
        };
      }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
  return (
    <div
      className="kp"
      ref={panel}
      tabIndex={-1}
      aria-label={`${child.name} profile`}
    >
      <header className="kp-head">
        <button
          className="kp-close"
          aria-label="Close profile"
          onClick={onClose}
        >
          <X size={22} />
        </button>
        <Avatar
          child={child}
          photoId={state.floor?.avatars?.[childId]}
          size={84}
        />
        <div className="kp-id">
          <h2>{child.name}</h2>
          <p>
            {child.age} · {groupLabel(child)} ·{" "}
            {family?.guardian ?? "Guardian on file"}
          </p>
          <p className={here ? "kp-here" : "kp-away"}>
            {here
              ? `Here since ${clockTime(here.in)}${here.by !== "Front desk" ? ` · checked in by ${here.by}` : ""}`
              : "Not checked in"}
            {nextClass && ` · ${nextClass.name}`}
          </p>
        </div>
        <div className="kp-star">
          <strong>{starsToday(state, childId, now)}</strong>
          <span>stars today</span>
        </div>
      </header>
      {info.care && (
        <p className="kp-care" role="note">
          <b>Care note</b> {info.care}
        </p>
      )}
      {birthday !== null && birthday <= 7 && (
        <p className="kp-birthday">
          {birthday === 0
            ? `Birthday today. Turning ${child.age + 1}.`
            : `Birthday in ${birthday} ${birthday === 1 ? "day" : "days"}.`}
        </p>
      )}
      {(handouts.length > 0 || claims.length > 0) && (
        <Section title="Ready to hand over">
          {handouts.map((r) => (
            <div className="kp-handout" key={r.id}>
              <ShirtImage tier={r.tier} className="kp-shirt" />
              <span>
                <b>{tiers[r.tier - 1].name} tee</b>
                <small>{r.size}</small>
              </span>
              <button
                className="button navy compact"
                onClick={(e) =>
                  ops.run(
                    `${tiers[r.tier - 1].name} tee handed to ${child.first}.`,
                    (s) =>
                      apply(s, {
                        type: "reward",
                        id: r.id,
                        status: "Collected",
                      }),
                    { spark: e.currentTarget },
                  )
                }
              >
                Handed over
              </button>
            </div>
          ))}
          {claims.map((r) => (
            <div className="kp-handout" key={r.id}>
              <span>
                <b>{prizes.find((p) => p.id === r.prizeId)?.name}</b>
                <small>Star reward</small>
              </span>
              <button
                className="button navy compact"
                onClick={() =>
                  ops.run("Reward handed over.", (s) =>
                    coachAct(s, actor, { type: "fulfill", id: r.id, childId }),
                  )
                }
              >
                Handed over
              </button>
            </div>
          ))}
        </Section>
      )}
      <Section
        title="At this station"
        aside={
          <select
            className="kp-station"
            aria-label="Station"
            value={station}
            onChange={(e) => ops.setStation(e.target.value)}
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        }
      >
        {outage && <p className="kp-outage">Paused: {outage.reason}</p>}
        <div className="kp-actions">
          <button
            className="act act-try"
            disabled={inBlock("visit") || !!outage}
            onClick={(e) =>
              record(
                e,
                "visit",
                {},
                `${child.first} tried ${stationName(station)}. +2 stars`,
              )
            }
          >
            <b>{inBlock("visit") ? "Tried" : "Tried it"}</b>
            <small>{inBlock("visit") ? "Recorded" : "+2 stars"}</small>
          </button>
          <button
            className="act act-done"
            disabled={inBlock("complete") || !!outage}
            aria-expanded={completing}
            onClick={() => setCompleting(!completing)}
          >
            <b>{inBlock("complete") ? "Completed" : "Completed it"}</b>
            <small>{inBlock("complete") ? "Recorded" : "+5 stars"}</small>
          </button>
          <button
            className="act act-photo"
            disabled={!consent}
            onClick={() =>
              ops.camera({
                childId,
                purpose: "moment",
                caption: `${child.first} at ${stationName(station)}`,
              })
            }
          >
            <b>
              <Camera size={18} /> Photo
            </b>
            <small>{consent ? "Shared with family" : "No photo consent"}</small>
          </button>
        </div>
        {completing && (
          <div className="kp-complete">
            <p>What did {child.first} complete?</p>
            <div className="chip-row">
              {(completionPresets[station] ?? []).map((t) => (
                <button
                  key={t}
                  className="chip"
                  onClick={(e) => complete(e, t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (other.trim())
                  complete(
                    { currentTarget: e.currentTarget.querySelector("button") },
                    other.trim(),
                  );
              }}
            >
              <input
                aria-label="Other completed task"
                placeholder="Other task and setup"
                value={other}
                maxLength={200}
                onChange={(e) => setOther(e.target.value)}
              />
              <button className="button navy compact" disabled={!other.trim()}>
                Save
              </button>
            </form>
          </div>
        )}
      </Section>
      <Section
        title="Shoutout"
        aside={
          <span className="kp-count">{praiseToday.length} of 3 today</span>
        }
      >
        <div className="chip-row">
          {shoutouts.map((c) => {
            const given = praiseToday.some(
              (e) => e.category === c && e.session === block.id,
            );
            return (
              <button
                key={c}
                className={`chip chip-praise ${given ? "is-done" : ""}`}
                disabled={given || praiseToday.length >= 3}
                onClick={(e) =>
                  record(
                    e,
                    "praise",
                    { category: c },
                    `${c} for ${child.first}. +3 stars`,
                  )
                }
              >
                {given && <Check size={14} />} {c}
              </button>
            );
          })}
        </div>
      </Section>
      <Section
        title="Skills to assess"
        aside={
          <button
            className="text-button"
            onClick={() => ops.assess(childId, null)}
          >
            All skills
          </button>
        }
      >
        {goals.length > 0 && (
          <p className="kp-goals">
            <b>{child.first}’s goals:</b>{" "}
            {goals
              .map((id) => catalog.find((s) => s.id === id)?.title)
              .join(", ")}
          </p>
        )}
        <div className="skill-rows">
          {ready.map((s) => (
            <button
              key={s.id}
              className="skill-row"
              onClick={() => ops.assess(childId, s.id)}
            >
              <span className="skill-row-id">{s.id}</span>
              <span>
                <b>{s.title}</b>
                <small>
                  {s.target
                    ? formatResult(s, s.target)
                    : (plain[s.id] ?? s.criteria)}
                  {goals.includes(s.id) ? " · Goal" : ""}
                </small>
              </span>
              <span className="skill-row-go">Assess</span>
            </button>
          ))}
          {!ready.length && (
            <p className="kp-empty">
              Nothing open at {stationName(station)} right now.
              {elsewhere.length > 0 &&
                ` Ready elsewhere: ${elsewhere.map((s) => `${s.title} (${stationName(stationFor(s))})`).join(", ")}.`}
            </p>
          )}
        </div>
      </Section>
      <Section title="Progress">
        <div className="kp-progress">
          <div>
            <span className="eyebrow">{gap.tier.name} tee</span>
            <b>
              {tierProgress(state, childId, gap.tier.id).count} of{" "}
              {gap.tier.count}
            </b>
            <Meter
              value={tierProgress(state, childId, gap.tier.id).count}
              max={gap.tier.count}
              color={gap.tier.color}
              label={`${gap.tier.name} progress`}
            />
            {!gap.complete && gap.left.length <= 3 && (
              <small>Left: {gap.left.map((s) => s.title).join(", ")}</small>
            )}
          </div>
          <div>
            <span className="eyebrow">Stars</span>
            <b>{stats.total}</b>
            <small>
              {stats.classes} classes · {stats.visits} station tries
            </small>
          </div>
        </div>
      </Section>
      <Section
        title="Moments"
        aside={
          consent ? (
            <button
              className="text-button"
              onClick={() =>
                ops.camera({
                  childId,
                  purpose: "avatar",
                  caption: "Profile photo",
                })
              }
            >
              {state.floor?.avatars?.[childId]
                ? "Retake profile photo"
                : "Add profile photo"}
            </button>
          ) : null
        }
      >
        {!consent && (
          <p className="kp-empty">This family has not given photo consent.</p>
        )}
        {consent && !moments.length && (
          <p className="kp-empty">
            No photos yet. Photos you take here go to the family’s Moments.
          </p>
        )}
        {moments.length > 0 && (
          <div className="kp-moments">
            {moments.map((m) => (
              <figure key={m.id} className={m.hidden ? "is-hidden" : ""}>
                <Photo id={m.photoId} alt={m.caption} />
                <figcaption>
                  {m.caption}
                  <small>
                    {date(m.at)} · {m.coach}
                    {m.hidden ? " · hidden by family" : ""}
                  </small>
                </figcaption>
                {(actor.head || actor.name === m.coach) && (
                  <button
                    className="kp-remove"
                    aria-label="Remove photo"
                    onClick={() =>
                      ops.run("Photo removed.", (s) =>
                        applyFloor(s, {
                          type: "deleteMoment",
                          id: m.id,
                          actor,
                        }),
                      )
                    }
                  >
                    <X size={14} />
                  </button>
                )}
              </figure>
            ))}
          </div>
        )}
      </Section>
      <Section
        title="Coach notes"
        aside={<span className="kp-count">Staff only</span>}
      >
        <form
          className="kp-note-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              ops.run("Note saved.", (s) =>
                applyFloor(s, {
                  type: "note",
                  childId,
                  text: noteText,
                  followUp,
                  actor,
                }),
              )
            ) {
              setNoteText("");
              setFollowUp(false);
            }
          }}
        >
          <textarea
            aria-label={`Note about ${child.first}`}
            placeholder={`e.g. ${child.first} is one clean attempt from First Roll`}
            value={noteText}
            maxLength={400}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="kp-note-foot">
            <label className="check">
              <input
                type="checkbox"
                checked={followUp}
                onChange={(e) => setFollowUp(e.target.checked)}
              />
              Follow up
            </label>
            <button className="button navy compact" disabled={!noteText.trim()}>
              Save note
            </button>
          </div>
        </form>
        {notes.map((n) => (
          <div className={`kp-note ${n.done ? "is-done" : ""}`} key={n.id}>
            <p>{n.text}</p>
            <small>
              {n.coach} · {date(n.at)} {clockTime(n.at)}
              {n.followUp && !n.done && " · Follow up"}
              {n.done && ` · Done by ${n.doneBy}`}
            </small>
            {n.followUp && !n.done && (
              <button
                className="text-button"
                onClick={() =>
                  ops.run("Follow-up done.", (s) =>
                    applyFloor(s, { type: "resolveNote", id: n.id, actor }),
                  )
                }
              >
                Mark done
              </button>
            )}
          </div>
        ))}
      </Section>
      <Section title="Recent">
        {!recent.length && <p className="kp-empty">Nothing recorded yet.</p>}
        {recent.map((r) => (
          <div className="kp-recent" key={r.id}>
            <span>
              <b>{r.label}</b>
              <small>
                {date(r.at)} {clockTime(r.at)} ·{" "}
                {r.status === "pending" ? "Waiting for a coach" : r.by}
              </small>
            </span>
            <em>{r.status === "approved" ? `+${r.stars}` : ""}</em>
            {r.status === "approved" && (
              <button
                className="text-button"
                onClick={() => {
                  setCorrecting(correcting?.id === r.id ? null : r);
                  setReason("");
                }}
              >
                Correct
              </button>
            )}
            {correcting?.id === r.id && (
              <form
                className="inline-form kp-correct"
                onSubmit={(e) => {
                  e.preventDefault();
                  const ok = ops.run(
                    "Record corrected. Stars recalculated.",
                    (s) =>
                      r.kind === "award"
                        ? apply(s, { type: "revoke", id: r.id, reason })
                        : coachAct(s, actor, {
                            type: "revoke",
                            id: r.id,
                            childId,
                            reason,
                          }),
                  );
                  if (ok) setCorrecting(null);
                }}
              >
                <input
                  aria-label="Correction reason"
                  placeholder="Why is this being corrected?"
                  value={reason}
                  maxLength={200}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  className="button navy compact"
                  disabled={!reason.trim()}
                >
                  Save
                </button>
              </form>
            )}
          </div>
        ))}
      </Section>
      <footer className="kp-foot">
        {here ? (
          <button
            className="button outline compact"
            onClick={() =>
              ops.run(`${child.first} checked out.`, (s) =>
                applyFloor(s, { type: "checkOut", childIds: [childId], actor }),
              )
            }
          >
            Check out
          </button>
        ) : (
          <button
            className="button mint compact"
            onClick={() =>
              ops.run(`${child.first} checked in.`, (s) =>
                applyFloor(s, {
                  type: "checkIn",
                  childIds: [childId],
                  by: actor.name,
                  actor,
                }),
              )
            }
          >
            Check in
          </button>
        )}
        <span>Family PIN {family?.pin}</span>
      </footer>
    </div>
  );
}

function Stepper({ value, onChange, unit }) {
  const n = Number(value) || 0;
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label="One less"
        onClick={() => onChange(String(Math.max(0, n - 1)))}
      >
        <Minus size={26} />
      </button>
      <label>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          aria-label={`Result in ${unit}`}
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{unit}</span>
      </label>
      <button
        type="button"
        aria-label="One more"
        onClick={() => onChange(String(n + 1))}
      >
        <Plus size={26} />
      </button>
    </div>
  );
}

// Times a hold. Stopping writes the elapsed seconds into the result.
function Stopwatch({ value, onChange }) {
  const [start, setStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (start === null) return;
    let id;
    const tick = () => {
      setElapsed((performance.now() - start) / 1000);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [start]);
  const running = start !== null;
  return (
    <div className="stopwatch">
      <output aria-live="off">
        {elapsed.toFixed(1)}
        <small>s</small>
      </output>
      <div className="stopwatch-buttons">
        <button
          type="button"
          className={`button ${running ? "navy" : "cyan"}`}
          onClick={() => {
            if (running) {
              const t =
                Math.floor(((performance.now() - start) / 1000) * 10) / 10;
              setElapsed(t);
              setStart(null);
              onChange(String(t));
              navigator.vibrate?.(30);
            } else {
              setElapsed(0);
              setStart(performance.now());
            }
          }}
        >
          {running ? "Stop" : elapsed ? "Restart" : "Start timer"}
        </button>
      </div>
      <label className="stopwatch-manual">
        Recorded
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Result in seconds"
        />
        s
      </label>
    </div>
  );
}

export function AssessSheet({ childId, skillId, ops, onClose, onUnlocked }) {
  const { state, actor } = ops;
  const child = people.find((p) => p.id === childId);
  const [pick, setPick] = useState(skillId);
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [secondDate, setSecondDate] = useState("");
  const [project, setProject] = useState("");
  const [error, setError] = useState("");
  const earned = new Set(earnedIds(state, childId));
  const skill = catalog.find((s) => s.id === pick);
  useEffect(() => {
    setValue("");
    setConfirmed(false);
    setNote("");
    setError("");
  }, [pick]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const eligibleList = readySkills(state, childId).filter(
    (s) =>
      !query ||
      `${s.id} ${s.title} ${s.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const verify = (e) => {
    e.preventDefault();
    const action = {
      type: "award",
      childId,
      skillId: pick,
      coach: actor.name,
      value,
      confirmed,
      note,
      secondDate,
      project,
    };
    try {
      apply(state, action);
    } catch (err) {
      setError(err.message);
      return;
    }
    const before = tiers.filter(
      (t) => tierProgress(state, childId, t.id).complete,
    ).length;
    let after = before;
    let award;
    const ok = ops.run(
      `${child.first} unlocked ${skill.title}. +${skillStars(skill)} stars`,
      (s) => {
        const next = apply(s, action);
        after = tiers.filter(
          (t) => tierProgress(next, childId, t.id).complete,
        ).length;
        award = next.awards[next.awards.length - 1];
        return next;
      },
      { quiet: true },
    );
    if (ok)
      onUnlocked({
        childId,
        skill,
        award,
        shirt: after > before ? tiers[after - 1] : null,
      });
  };
  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="sheet assess"
        role="dialog"
        aria-modal="true"
        aria-label={`Assess ${child.first}`}
      >
        <header className="sheet-head">
          {skill && !skillId ? (
            <button className="text-button" onClick={() => setPick(null)}>
              ← All skills
            </button>
          ) : (
            <span className="eyebrow">Assess {child.first}</span>
          )}
          <button className="kp-close" aria-label="Close" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {!skill ? (
          <>
            <h2>Choose a skill</h2>
            <input
              className="sheet-search"
              placeholder="Search skills"
              aria-label="Search skills"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="skill-rows">
              {eligibleList.map((s) => (
                <button
                  key={s.id}
                  className="skill-row"
                  onClick={() => setPick(s.id)}
                >
                  <span className="skill-row-id">{s.id}</span>
                  <span>
                    <b>{s.title}</b>
                    <small>
                      Tier {s.tier} · {stationName(stationFor(s))}
                      {(state.goals?.[childId] ?? []).includes(s.id)
                        ? " · Goal"
                        : ""}
                    </small>
                  </span>
                  <span className="skill-row-go">Assess</span>
                </button>
              ))}
              {!eligibleList.length && (
                <p className="kp-empty">No eligible skills match.</p>
              )}
            </div>
          </>
        ) : earned.has(skill.id) ? (
          <>
            <h2>{skill.title}</h2>
            <p className="kp-empty">{child.first} already unlocked this.</p>
          </>
        ) : (
          <form onSubmit={verify} className="assess-form">
            <span className="skill-meta">
              {skill.id} · Tier {skill.tier} · {stationName(stationFor(skill))}
            </span>
            <h2>{skill.title}</h2>
            <p className="assess-criteria">
              {plain[skill.id] ?? skill.criteria}
            </p>
            <p className="assess-setup">
              {standard(skill.criteria)} · {skill.setup}
            </p>
            {skill.target && (
              <div className="assess-measure">
                <span className="eyebrow">
                  Target {formatResult(skill, skill.target)}
                </span>
                {skill.unit === "seconds" ? (
                  <Stopwatch value={value} onChange={setValue} />
                ) : (
                  <Stepper
                    value={value}
                    onChange={setValue}
                    unit={skill.units?.[1] ?? skill.unit}
                  />
                )}
              </div>
            )}
            {skill.special === "repeat" && (
              <label className="field">
                Earlier qualifying date
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
                Approved project rubric
                <textarea
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="field">
              What you saw <span>(optional)</span>
              <textarea
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Shared with the family"
              />
            </label>
            <label className="check assess-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I watched the full task on this setup, with a controlled finish.
              </span>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="sheet-buttons">
              <button
                type="button"
                className="button outline"
                onClick={() => {
                  if (
                    ops.run("Practice logged.", (s) =>
                      apply(s, {
                        type: "practice",
                        childId,
                        skillId: skill.id,
                      }),
                    )
                  )
                    onClose();
                }}
              >
                Not yet · log practice
              </button>
              <button className="button navy" type="submit">
                Verify unlock
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

// Full-screen moment after an unlock: turn the tablet around and show them.
export function Celebrate({ info, ops, onClose }) {
  const child = people.find((p) => p.id === info.childId);
  const ref = useRef(null);
  const consent = photoConsent(ops.state, info.childId);
  useEffect(() => {
    const el = ref.current;
    if (el) sparkFrom(el, { count: 28, radius: 160, size: 26 });
    navigator.vibrate?.([30, 40, 30]);
  }, []);
  return (
    <div
      className="celebrate"
      role="dialog"
      aria-modal="true"
      aria-label="Unlocked"
    >
      <div className="celebrate-inner" ref={ref}>
        <Avatar
          child={child}
          photoId={ops.state.floor?.avatars?.[child.id]}
          size={96}
        />
        <span className="eyebrow">Unlocked</span>
        <h2>{info.skill.title}</h2>
        <p>
          Nice work, {child.first}. +{skillStars(info.skill)} stars
        </p>
        {info.shirt && (
          <div className="celebrate-shirt">
            <ShirtImage tier={info.shirt.id} eager />
            <b>{info.shirt.name} tee earned</b>
          </div>
        )}
        <div className="celebrate-buttons">
          {consent && (
            <button
              className="button cyan"
              onClick={() => {
                onClose();
                ops.camera({
                  childId: child.id,
                  purpose: "moment",
                  link: info.award
                    ? { type: "award", id: info.award.id }
                    : null,
                  caption: `${child.first} unlocked ${info.skill.title}`,
                  facing: "environment",
                });
              }}
            >
              <Camera size={18} /> Celebration photo
            </button>
          )}
          <button className="button outline-light" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Which today's block the kid's class is, for labels.
export const blockName = (id) =>
  sessions().find((s) => s.id === id)?.name ?? "Session";
