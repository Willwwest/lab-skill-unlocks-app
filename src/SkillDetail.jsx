import React from "react";
import { Check, Lock } from "lucide-react";
import { earnedIds, formatResult, isEligible, tiers } from "./domain.js";
import { date, plural } from "./format.js";
import { MoveArt } from "./moves.jsx";
import { ancestry, firstStep, opens } from "./paths.js";
import { plain, standard } from "./skillcopy.js";
import "./skill.css";

function stepState(state, childId, skill, done) {
  if (done.has(skill.id)) return "earned";
  return isEligible(state, childId, skill) ? "ready" : "locked";
}

// Top panel of the skill sheet: the movement figure sits on the right
// behind a scrim, so the title and status on the left stay readable.
export function SkillHero({ skill, child, state, status, award }) {
  const tier = tiers[skill.tier - 1];
  const done = new Set(earnedIds(state, child.id));
  const waiting = ancestry(skill.id)
    .flat()
    .filter((s) => !done.has(s.id)).length;
  const line =
    status === "earned"
      ? `Unlocked ${date(award.at)} · ${award.coach}`
      : status === "locked"
        ? `${plural(waiting, "skill", "skills")} to learn first`
        : status === "goal"
          ? `${child.first}’s goal · ready to try`
          : status === "practicing"
            ? "Practicing · ready to try"
            : "Ready to try";
  return (
    <header
      className={`skill-hero hero-${status}`}
      style={{ "--tier-color": tier.color }}
    >
      <MoveArt skillId={skill.id} className="skill-hero-art" />
      <div className="skill-hero-text">
        <span className="skill-hero-kicker">
          Tier {skill.tier} · {tier.name} · {skill.category}
        </span>
        <h2 id="dialog-title">{skill.title}</h2>
        <p className="skill-hero-status">
          {status === "locked" && <Lock size={15} aria-hidden="true" />}
          {status === "earned" && <Check size={16} aria-hidden="true" />}
          {line}
        </p>
        {skill.target && (
          <p className="skill-hero-target">
            <strong>
              {status === "earned" && typeof award?.value === "number"
                ? award.value
                : skill.target}
            </strong>
            <span>
              {formatResult(
                skill,
                status === "earned" && typeof award?.value === "number"
                  ? award.value
                  : skill.target,
              ).replace(/^[\d.,]+\s*/, "")}
              {status === "earned" ? " recorded" : " to unlock"}
            </span>
          </p>
        )}
      </div>
    </header>
  );
}

export function SkillAbout({ skill }) {
  return (
    <section className="skill-about">
      <p className="skill-plain">{plain[skill.id] ?? skill.criteria}</p>
      <dl className="skill-facts">
        <div>
          <dt>Where</dt>
          <dd>{skill.setup}</dd>
        </div>
        <div>
          <dt>Standard</dt>
          <dd>{standard(skill.criteria)}</dd>
        </div>
      </dl>
    </section>
  );
}

// The full chain of prerequisites, oldest first, ending at this skill,
// plus the skills this one opens. Every step opens its own sheet.
export function SkillPath({ skill, state, childId, onOpen }) {
  const done = new Set(earnedIds(state, childId));
  const levels = ancestry(skill.id);
  const after = opens(skill.id);
  if (!levels.length && !after.length) return null;
  const steps = levels.flat();
  const finished = steps.filter((s) => done.has(s.id)).length;
  const start = firstStep(state, childId, skill.id);
  const Step = ({ s, current = false }) => {
    const st = current ? "current" : stepState(state, childId, s, done);
    const label =
      st === "earned"
        ? "Unlocked"
        : st === "ready"
          ? "Ready to try"
          : st === "current"
            ? "This skill"
            : "Learn first";
    const body = (
      <>
        <span className="path-dot" aria-hidden="true">
          {st === "earned" ? (
            <Check size={16} />
          ) : st === "locked" ? (
            <Lock size={13} />
          ) : null}
        </span>
        <span className="path-text">
          <b>{s.title}</b>
          <small>
            Tier {s.tier} · {label}
            {start?.id === s.id && <em> · Start here</em>}
          </small>
        </span>
      </>
    );
    return current ? (
      <div className={`path-step state-${st}`}>{body}</div>
    ) : (
      <button className={`path-step state-${st}`} onClick={() => onOpen(s)}>
        {body}
      </button>
    );
  };
  return (
    <section className="skill-path">
      {levels.length > 0 && (
        <>
          <div className="skill-path-head">
            <h3>Path to {skill.title}</h3>
            <span>
              {finished} of {steps.length} done
            </span>
          </div>
          <ol className="path-list">
            {levels.map((level, i) => (
              <li
                key={i}
                className={
                  level.length > 1 ? "path-level is-split" : "path-level"
                }
              >
                {level.length > 1 && (
                  <span className="path-note">Any order</span>
                )}
                {level.map((s) => (
                  <Step key={s.id} s={s} />
                ))}
              </li>
            ))}
            <li className="path-level">
              <Step s={skill} current />
            </li>
          </ol>
        </>
      )}
      {after.length > 0 && (
        <div className="skill-opens">
          <h3>Opens up</h3>
          <div className="skill-opens-list">
            {after.map((s) => (
              <button
                key={s.id}
                className="skill-open"
                onClick={() => onOpen(s)}
              >
                <b>{s.title}</b>
                <small>Tier {s.tier}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
