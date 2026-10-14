// When a block runs: its weekdays (the owner sets them) and one-day
// changes such as a cancelled class, new times or the whole gym closed
// (gym managers). Shown in Plans & crew for the block being edited.
import React, { useState } from "react";
import { X } from "lucide-react";
import {
  Button,
  Chip,
  Field,
  IconButton,
  Section,
  Segmented,
  Select,
  Tag,
} from "./ds/index.jsx";
import { clock, dayKey } from "./club.js";
import { addDays, calendarDayLabel } from "./gym-time.js";
import {
  WEEKDAYS,
  applySchedule,
  blockById,
  scheduleOf,
  weekdayNames,
} from "./schedule.js";
import { TIMES } from "./times.js";

const AHEAD = 42;

export default function BlockSchedule({ ops, block }) {
  const { state, now, me } = ops;
  const b = blockById(state, block.index);
  const today = dayKey(now);
  const [day, setDay] = useState(addDays(today, 1));
  const [kind, setKind] = useState("cancelled");
  const [start, setStart] = useState(b?.start ?? "10:00");
  const [end, setEnd] = useState(b?.end ?? "11:00");
  if (!b) return null;
  const save = (action, msg) =>
    ops.run(msg, (s) => applySchedule(s, { actor: ops.actor, ...action }, now));
  const days = b.weekdays;
  const toggle = (d) =>
    save(
      {
        type: "blockDays",
        blockId: b.id,
        weekdays: days.includes(d) ? days.filter((x) => x !== d) : [...days, d],
      },
      `${b.name} ${days.includes(d) ? "no longer runs" : "now runs"} on ${weekdayNames[d]}s.`,
    );
  const upcoming = scheduleOf(state)
    .exceptions.filter(
      (e) => e.day >= today && (e.blockId === b.id || e.blockId === null),
    )
    .sort((x, y) => x.day.localeCompare(y.day));
  const dayOptions = Array.from({ length: AHEAD }, (_, i) => {
    const d = addDays(today, i);
    return { value: d, label: i === 0 ? "Today" : calendarDayLabel(d) };
  });
  const describe = (e) =>
    e.kind === "closed"
      ? "Gym closed"
      : e.kind === "cancelled"
        ? "Cancelled"
        : `Runs ${clock(e.start)}–${clock(e.end)}`;
  return (
    <Section
      title="When it runs"
      note={
        me.owner
          ? "Tap a day to add or drop it. Changes apply from today on."
          : "The owner sets the weekdays. Gym managers can change a single day."
      }
    >
      <div className="pl-days" role="group" aria-label={`${b.name} weekdays`}>
        {WEEKDAYS.map((d) => (
          <Chip
            key={d}
            on={days.includes(d)}
            disabled={!me.owner}
            onClick={() => toggle(d)}
          >
            {weekdayNames[d].slice(0, 3)}
          </Chip>
        ))}
      </div>
      {upcoming.length > 0 && (
        <ul className="pl-exceptions">
          {upcoming.map((e) => (
            <li key={e.id}>
              <b>{e.day === today ? "Today" : calendarDayLabel(e.day)}</b>
              <Tag tone={e.kind === "retimed" ? "info" : "warn"}>
                {describe(e)}
              </Tag>
              {e.note && <small>{e.note}</small>}
              {me.head && (
                <IconButton
                  label={`Undo the change on ${calendarDayLabel(e.day)}`}
                  icon={X}
                  tone="danger"
                  onClick={() =>
                    save(
                      { type: "clearException", id: e.id },
                      "Back to the usual schedule that day.",
                    )
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {me.head && (
        <div className="pl-oneday">
          <Field label="Change one day">
            <Select value={day} onChange={setDay} options={dayOptions} />
          </Field>
          <Segmented
            size="sm"
            label="What changes"
            value={kind}
            options={[
              { value: "cancelled", label: "Cancel it" },
              { value: "retimed", label: "New times" },
              { value: "closed", label: "Gym closed" },
            ]}
            onChange={setKind}
          />
          {kind === "retimed" && (
            <div className="pl-times">
              <Field label="Start">
                <Select value={start} onChange={setStart} options={TIMES} />
              </Field>
              <Field label="End">
                <Select value={end} onChange={setEnd} options={TIMES} />
              </Field>
            </div>
          )}
          <Button
            size="sm"
            variant="dark"
            onClick={() =>
              save(
                {
                  type: "exception",
                  day,
                  blockId: b.id,
                  kind,
                  start,
                  end,
                },
                kind === "closed"
                  ? `The gym is closed on ${calendarDayLabel(day)}.`
                  : kind === "cancelled"
                    ? `${b.name} is cancelled on ${calendarDayLabel(day)}.`
                    : `${b.name} runs ${clock(start)}–${clock(end)} on ${calendarDayLabel(day)}.`,
              )
            }
          >
            Save the change
          </Button>
        </div>
      )}
    </Section>
  );
}
