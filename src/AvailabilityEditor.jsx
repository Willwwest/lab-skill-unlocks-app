// Availability: when a coach can work, days they can't, and the weekly
// hours they'd like. Managers also see every coach's week against their
// range and the weekly cap.
import React, { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  CoachMark,
  Field,
  IconButton,
  SaveBar,
  Section,
  Segmented,
  Select,
  Tag,
} from "./ds/index.jsx";
import { clock, dayKey } from "./club.js";
import { addDays, calendarDayLabel, weekKeyOf } from "./gym-time.js";
import { WEEKDAYS, weekdayNames } from "./schedule.js";
import { coaches } from "./roster.js";
import { applyStaffing } from "./staffing.js";
import {
  availabilityOf,
  bandText,
  hoursBand,
  weeklyCap,
} from "./availability.js";
import { TIMES } from "./times.js";

const bandTone = {
  under: "warn",
  ok: "good",
  over: "warn",
  cap: "bad",
  none: "outline",
};

const run = (ops, message, action) =>
  ops.run(message, (s) =>
    applyStaffing(s, { actor: ops.actor, ...action }, ops.now),
  );

// One weekday's setting in the editor: any time, set hours, or can't work.
const toDays = (weekly) =>
  Object.fromEntries(
    WEEKDAYS.map((d) => {
      const w = weekly.find((x) => x.weekday === d);
      return [
        d,
        !weekly.length
          ? { mode: "any", start: "09:00", end: "17:00" }
          : w && w.start === "00:00" && w.end === "23:59"
            ? { mode: "any", start: "09:00", end: "17:00" }
            : w
              ? { mode: "set", start: w.start, end: w.end }
              : { mode: "off", start: "09:00", end: "17:00" },
      ];
    }),
  );
const toWeekly = (days) =>
  Object.values(days).every((d) => d.mode === "any")
    ? []
    : WEEKDAYS.filter((d) => days[d].mode !== "off").map((d) =>
        days[d].mode === "any"
          ? { weekday: d, start: "00:00", end: "23:59" }
          : { weekday: d, start: days[d].start, end: days[d].end },
      );

function Stepper({ label, value, onChange }) {
  return (
    <span className="av-stepper">
      <span className="ds-field-label">{label}</span>
      <span className="st-stepper">
        <IconButton
          label={`Less: ${label}`}
          icon={Minus}
          onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
        />
        <b aria-live="polite">{value == null ? "—" : `${value} h`}</b>
        <IconButton
          label={`More: ${label}`}
          icon={Plus}
          onClick={() => onChange(Math.min(80, (value ?? 0) + 1))}
        />
      </span>
    </span>
  );
}

export function AvailabilityEditor({ ops, staffId }) {
  const { state, now } = ops;
  const saved = availabilityOf(state, staffId);
  const [days, setDays] = useState(() => toDays(saved.weekly));
  const [min, setMin] = useState(saved.minHours);
  const [max, setMax] = useState(saved.maxHours);
  const [from, setFrom] = useState(addDays(dayKey(now), 1));
  const [to, setTo] = useState(addDays(dayKey(now), 1));
  const [note, setNote] = useState("");
  const savedDays = toDays(saved.weekly);
  const changed =
    JSON.stringify(days) !== JSON.stringify(savedDays) ||
    min !== saved.minHours ||
    max !== saved.maxHours;
  const band = hoursBand(state, staffId, weekKeyOf(dayKey(now)));
  const set = (d, patch) =>
    setDays((x) => ({ ...x, [d]: { ...x[d], ...patch } }));
  const dayOptions = Array.from({ length: 90 }, (_, i) => {
    const d = addDays(dayKey(now), i);
    return { value: d, label: i === 0 ? "Today" : calendarDayLabel(d) };
  });
  const upcoming = saved.dated.filter((d) => d.to >= dayKey(now));
  return (
    <>
      <Card>
        <CardHead
          title="Weekly hours"
          note={`The range you'd like. The gym's cap is ${weeklyCap(state)} hours a week.`}
          aside={
            <Tag tone={bandTone[band.status]}>
              {band.hours} h this week · {bandText[band.status]}
            </Tag>
          }
        />
        <div className="av-range">
          <Stepper label="At least" value={min} onChange={setMin} />
          <Stepper label="At most" value={max} onChange={setMax} />
        </div>
      </Card>
      <Card>
        <CardHead
          title="When you can work"
          note="Set each weekday. Managers only schedule you inside these hours."
        />
        <ul className="av-days">
          {WEEKDAYS.map((d) => (
            <li key={d}>
              <b>{weekdayNames[d]}</b>
              <Segmented
                size="sm"
                label={`${weekdayNames[d]} availability`}
                value={days[d].mode}
                options={[
                  { value: "any", label: "Any time" },
                  { value: "set", label: "Set hours" },
                  { value: "off", label: "Can't work" },
                ]}
                onChange={(mode) => set(d, { mode })}
              />
              {days[d].mode === "set" && (
                <span className="av-times">
                  <Field label="From">
                    <Select
                      value={days[d].start}
                      onChange={(v) => set(d, { start: v })}
                      options={TIMES}
                    />
                  </Field>
                  <Field label="To">
                    <Select
                      value={days[d].end}
                      onChange={(v) => set(d, { end: v })}
                      options={TIMES}
                    />
                  </Field>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <SaveBar
        show={changed}
        message="Unsaved availability"
        onDiscard={() => {
          setDays(savedDays);
          setMin(saved.minHours);
          setMax(saved.maxHours);
        }}
        onSave={() =>
          run(ops, "Availability saved.", {
            type: "availability",
            staffId,
            weekly: toWeekly(days),
            minHours: min,
            maxHours: max,
          })
        }
      />
      <Card>
        <CardHead
          title="Days you can't work"
          note="Appointments, trips, exams. You aren't scheduled on these days. For a day you're already scheduled, ask for time off in Requests."
        />
        {upcoming.length > 0 && (
          <ul className="av-away">
            {upcoming.map((d) => (
              <li key={d.id}>
                <b>
                  {d.from === d.to
                    ? calendarDayLabel(d.from)
                    : `${calendarDayLabel(d.from)} – ${calendarDayLabel(d.to)}`}
                </b>
                {d.note && <small>{d.note}</small>}
                <IconButton
                  label="Remove"
                  icon={X}
                  tone="danger"
                  onClick={() =>
                    run(ops, "Removed.", {
                      type: "removeUnavailable",
                      staffId,
                      id: d.id,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <div className="av-add">
          <Field label="First day">
            <Select
              value={from}
              onChange={(v) => {
                setFrom(v);
                if (to < v) setTo(v);
              }}
              options={dayOptions}
            />
          </Field>
          <Field label="Last day">
            <Select
              value={to}
              onChange={setTo}
              options={dayOptions.filter((o) => o.value >= from)}
            />
          </Field>
          <Field label="Note (optional)">
            <input
              className="ds-textarea av-note"
              value={note}
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dentist, trip, finals"
            />
          </Field>
          <Button
            size="sm"
            variant="dark"
            onClick={() => {
              if (
                run(ops, "Saved. You won't be scheduled then.", {
                  type: "unavailable",
                  staffId,
                  from,
                  to,
                  note,
                })
              )
                setNote("");
            }}
          >
            Add
          </Button>
        </div>
      </Card>
    </>
  );
}

// A one-line summary of a coach's weekly windows.
function windowsText(a) {
  if (!a.weekly.length) return "Any time";
  return WEEKDAYS.map((d) => {
    const w = a.weekly.find((x) => x.weekday === d);
    if (!w) return null;
    const all = w.start === "00:00" && w.end === "23:59";
    return `${weekdayNames[d].slice(0, 3)}${all ? "" : ` ${clock(w.start)}–${clock(w.end)}`}`;
  })
    .filter(Boolean)
    .join(", ");
}

export function TeamHours({ ops }) {
  const { state, now } = ops;
  const week = weekKeyOf(dayKey(now));
  return (
    <Section
      title="Hours this week"
      note={`Booked hours for the week of ${calendarDayLabel(week)} against what each coach asked for. The cap is ${weeklyCap(state)} hours.`}
    >
      <div className="av-team">
        {coaches.map((c) => {
          const a = availabilityOf(state, c.id);
          const band = hoursBand(state, c.id, week);
          return (
            <Card key={c.id} pad="md" className="av-coach">
              <div className="av-coach-head">
                <CoachMark initials={c.initials} size={32} />
                <b>{c.name}</b>
                <Tag tone={bandTone[band.status]}>{bandText[band.status]}</Tag>
              </div>
              <p className="av-hours">
                <b>{band.hours} h</b>
                <small>
                  {band.min != null || band.max != null
                    ? ` wants ${band.min ?? 0}–${band.max ?? band.cap} h`
                    : " no range set"}
                </small>
              </p>
              <p className="ds-note">{windowsText(a)}</p>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

export function AvailabilityPanel({ ops }) {
  const { me } = ops;
  return (
    <>
      {!me.owner && (
        <AvailabilityEditor key={me.id} ops={ops} staffId={me.id} />
      )}
      {me.head && <TeamHours ops={ops} />}
    </>
  );
}
