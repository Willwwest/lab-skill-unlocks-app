// The schedule builder for gym managers: build a week as a draft from
// standing hours or last week, staff each block with the suggested
// coaches, fix the problems it lists, then publish. Coaches only see a
// week once it's published.
import React, { useState } from "react";
import { X } from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  CoachMark,
  Empty,
  IconButton,
  Section,
  Segmented,
  Select,
  Tag,
} from "./ds/index.jsx";
import { clock, dayKey } from "./club.js";
import { addDays, calendarDayLabel, weekKeyOf } from "./gym-time.js";
import { blocksOn } from "./schedule.js";
import { coaches, staff } from "./roster.js";
import { roleNames, staffName } from "./gym.js";
import { availabilityOf, weeklyCap } from "./availability.js";
import {
  applyShifts,
  draftHours,
  draftShifts,
  statusText,
  suggestFor,
  weekConflicts,
  weekDays,
  weekStatus,
} from "./shifts.js";
import { hoursText } from "./times.js";

const statusTone = {
  none: "outline",
  draft: "warn",
  published: "good",
  changed: "info",
};
const first = (id) => staffName(id).replace("Coach ", "");

export function weekChoices(now, ahead = 4) {
  const week = weekKeyOf(dayKey(now));
  return Array.from({ length: ahead }, (_, i) => {
    const w = addDays(week, i * 7);
    return {
      value: w,
      label:
        i === 0
          ? "This week"
          : i === 1
            ? "Next week"
            : `Week of ${calendarDayLabel(w)}`,
    };
  });
}

export function ScheduleBuilder({ ops }) {
  const { state, now } = ops;
  const choices = weekChoices(now);
  const [week, setWeek] = useState(choices[1].value);
  const status = weekStatus(state, week);
  const shifts = draftShifts(state, week);
  const conflicts = weekConflicts(state, week);
  const bad = conflicts.filter((c) => c.tone === "bad");
  const act = (action, msg) =>
    ops.run(msg, (s) =>
      applyShifts(s, { actor: ops.actor, week, ...action }, now),
    );
  return (
    <>
      <Card tone="ink" className="sb-head">
        <div className="sb-head-row">
          <Select value={week} onChange={setWeek} options={choices} />
          <Tag tone={statusTone[status]}>{statusText[status]}</Tag>
        </div>
        <div className="sb-actions">
          {status === "none" ? (
            <>
              <Button
                onClick={() =>
                  act(
                    { type: "startWeek" },
                    "Week started from standing hours.",
                  )
                }
              >
                Start from standing hours
              </Button>
              <Button
                variant="light"
                onClick={() =>
                  act(
                    { type: "startWeek", from: "lastWeek" },
                    "Copied last week.",
                  )
                }
              >
                Copy last week
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() =>
                  act(
                    { type: "publish", force: bad.length > 0 },
                    "Published. Coaches can see their week.",
                  )
                }
                disabled={status === "published"}
              >
                {status === "published"
                  ? "Published"
                  : bad.length
                    ? `Publish with ${bad.length} problems`
                    : status === "changed"
                      ? "Publish changes"
                      : "Publish"}
              </Button>
              <Button
                variant="light"
                onClick={() =>
                  act({ type: "autoFill" }, "Filled the thin blocks.")
                }
              >
                Auto-fill gaps
              </Button>
              {status === "changed" && (
                <Button
                  variant="light"
                  onClick={() =>
                    act(
                      { type: "discardChanges" },
                      "Back to the published week.",
                    )
                  }
                >
                  Discard changes
                </Button>
              )}
            </>
          )}
        </div>
      </Card>

      {status !== "none" && (
        <>
          <HoursStrip ops={ops} week={week} />
          {conflicts.length > 0 && <Problems list={conflicts} />}
          <div className="sb-days">
            {weekDays(week).map((day, i) => (
              <DayCard
                key={day}
                ops={ops}
                week={week}
                day={day}
                open={i === 0}
                shifts={shifts.filter((x) => x.day === day)}
                problems={conflicts.filter((c) => c.day === day)}
                act={act}
              />
            ))}
          </div>
        </>
      )}
      {status === "none" && (
        <Empty title="This week isn't started">
          Start from standing hours to book everyone's usual days and classes,
          or copy last week.
        </Empty>
      )}
    </>
  );
}

function HoursStrip({ ops, week }) {
  const { state } = ops;
  const cap = weeklyCap(state);
  return (
    <Section
      title="Hours"
      note={`Booked this week against what each coach asked for. The cap is ${cap} h.`}
    >
      <div className="sb-hours">
        {coaches.map((c) => {
          const h = draftHours(state, week, c.id);
          const a = availabilityOf(state, c.id);
          const tone =
            h > cap
              ? "bad"
              : (a.maxHours != null && h > a.maxHours) ||
                  (a.minHours != null && h < a.minHours)
                ? "warn"
                : "good";
          return (
            <span key={c.id} className="sb-hour">
              <CoachMark initials={c.initials} size={28} />
              <span>
                <b>{first(c.id)}</b>
                <small>
                  {a.minHours != null || a.maxHours != null
                    ? `wants ${a.minHours ?? 0}–${a.maxHours ?? cap}`
                    : "no range"}
                </small>
              </span>
              <Tag tone={tone}>{h} h</Tag>
            </span>
          );
        })}
      </div>
    </Section>
  );
}

function Problems({ list }) {
  const [all, setAll] = useState(false);
  const sorted = [...list].sort((a, b) =>
    a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1,
  );
  const shown = all ? sorted : sorted.slice(0, 6);
  return (
    <Card className="sb-problems">
      <CardHead
        title={`${list.length} to check`}
        note="Problems block publishing; warnings don't."
      />
      <ul>
        {shown.map((c, i) => (
          <li key={i}>
            <Tag tone={c.tone}>{c.tone === "bad" ? "Problem" : "Warning"}</Tag>
            <span>
              {c.day ? `${calendarDayLabel(c.day)} · ` : ""}
              {c.text}
            </span>
          </li>
        ))}
      </ul>
      {sorted.length > 6 && (
        <button className="text-button" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}
    </Card>
  );
}

function DayCard({ ops, week, day, open, shifts, problems, act }) {
  const { state } = ops;
  const blocks = blocksOn(state, day);
  return (
    <details className="card sb-day" open={open}>
      <summary>
        <b>{calendarDayLabel(day)}</b>
        <small>
          {blocks.length
            ? `${blocks.length} blocks · ${shifts.length} coaches`
            : "Closed"}
        </small>
        {problems.some((p) => p.tone === "bad") && (
          <Tag tone="bad">
            {problems.filter((p) => p.tone === "bad").length} problems
          </Tag>
        )}
      </summary>
      <div className="sb-blocks">
        {blocks.map((b) => (
          <BlockRow
            key={b.id}
            ops={ops}
            week={week}
            day={day}
            block={b}
            shifts={shifts}
            act={act}
          />
        ))}
      </div>
      {shifts.length > 0 && (
        <div className="sb-shifts">
          <span className="ds-field-label">Shifts</span>
          <ul>
            {shifts
              .slice()
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((x) => (
                <li key={x.id}>
                  <b>{first(x.staffId)}</b>
                  <span>
                    {clock(x.start)}–{clock(x.end)}
                  </span>
                  <small>
                    {x.assignments.length
                      ? `${x.assignments.length} block${x.assignments.length === 1 ? "" : "s"}`
                      : "No blocks"}
                  </small>
                  <IconButton
                    label={`Remove ${first(x.staffId)}'s shift`}
                    icon={X}
                    tone="danger"
                    onClick={() =>
                      act({ type: "removeShift", id: x.id }, "Shift removed.")
                    }
                  />
                </li>
              ))}
          </ul>
        </div>
      )}
    </details>
  );
}

function BlockRow({ ops, week, day, block, shifts, act }) {
  const { state } = ops;
  const crew = shifts.flatMap((x) =>
    x.assignments
      .filter((a) => a.blockId === block.id)
      .map((a) => ({ shift: x, role: a.role })),
  );
  const picks = suggestFor(state, week, day, block.id);
  const label = (c) =>
    [
      first(c.staff.id),
      c.addsMinutes ? `+${hoursText(c.addsMinutes)}` : "on shift",
      !c.available ? (c.why?.toLowerCase() ?? "unavailable") : null,
      c.overMax ? "over hours" : null,
      c.underMin ? "needs hours" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="sb-block">
      <div className="sb-block-head">
        <b>{block.name}</b>
        <small>
          {clock(block.start)}–{clock(block.end)}
        </small>
      </div>
      <div className="sb-crew">
        {crew.map(({ shift, role }) => (
          <span key={shift.id} className="sb-chip">
            <b>{first(shift.staffId)}</b>
            <small>
              {role === "floater" ? "Floater" : (roleNames[role] ?? role)}
            </small>
            <IconButton
              label={`Take ${first(shift.staffId)} off ${block.name}`}
              icon={X}
              size={14}
              onClick={() =>
                act(
                  { type: "unassign", id: shift.id, blockId: block.id },
                  `${first(shift.staffId)} is off ${block.name}.`,
                )
              }
            />
          </span>
        ))}
        {!crew.length && <small className="ds-note">Nobody yet</small>}
      </div>
      {picks.length > 0 && (
        <label className="sb-add">
          <span className="sr-only">Add a coach to {block.name}</span>
          <select
            className="ds-textarea"
            value=""
            onChange={(e) =>
              e.target.value &&
              act(
                {
                  type: "assign",
                  day,
                  blockId: block.id,
                  staffId: e.target.value,
                },
                `${first(e.target.value)} added to ${block.name}.`,
              )
            }
          >
            <option value="">Add a coach…</option>
            {picks.map((c) => (
              <option key={c.staff.id} value={c.staff.id}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export default ScheduleBuilder;
