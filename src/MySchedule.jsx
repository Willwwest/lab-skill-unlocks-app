// A coach's week: the days they work, the hours and the blocks, with
// their total against the range they asked for. Weeks a manager hasn't
// published show the coach's standing hours.
import React, { useState } from "react";
import { Card, Empty, Select, Tag } from "./ds/index.jsx";
import { clock, dayKey } from "./club.js";
import { calendarDayLabel, dayAt } from "./gym-time.js";
import { myBlocks, roleNames } from "./gym.js";
import { bandText, hoursBand } from "./availability.js";
import { shiftOn } from "./staffing.js";
import { weekDays, weekStatus } from "./shifts.js";
import { weekChoices } from "./ScheduleBuilder.jsx";

const bandTone = {
  under: "warn",
  ok: "good",
  over: "warn",
  cap: "bad",
  none: "outline",
};

export default function MySchedule({ ops }) {
  const { state, now, me } = ops;
  const choices = weekChoices(now, 3);
  const [week, setWeek] = useState(choices[0].value);
  const status = weekStatus(state, week);
  const published = status === "published" || status === "changed";
  const band = hoursBand(state, me.id, week);
  const today = dayKey(now);
  const days = weekDays(week).map((day) => {
    const at = day === today ? now : new Date(dayAt(day));
    return {
      day,
      shift: shiftOn(state, me.id, at),
      // Without working hours that day, the standing crew list doesn't
      // apply to them.
      blocks: shiftOn(state, me.id, at) ? myBlocks(state, me.id, at) : [],
    };
  });
  return (
    <>
      <Card className="ms-head">
        <div className="ms-head-row">
          <Select value={week} onChange={setWeek} options={choices} />
          <Tag tone={bandTone[band.status]}>
            {band.hours} h · {bandText[band.status]}
          </Tag>
        </div>
        <p className="ds-note">
          {published
            ? "Published by your manager."
            : "Not published yet. These are your standing hours; they may change."}
        </p>
      </Card>
      <ul className="ms-days">
        {days.map(({ day, shift, blocks }) => (
          <li
            key={day}
            className={`card ms-day ${day === today ? "is-today" : ""}`.trim()}
          >
            <div className="ms-day-head">
              <b>{day === today ? "Today" : calendarDayLabel(day)}</b>
              {shift ? (
                <span>
                  {clock(shift.start)}–{clock(shift.end)}
                </span>
              ) : (
                <small>Off</small>
              )}
            </div>
            {blocks.length > 0 && (
              <ul className="ms-blocks">
                {blocks.map((b) => (
                  <li key={b.id}>
                    <span>{b.name}</span>
                    <small>
                      {clock(b.start)}–{clock(b.end)} ·{" "}
                      {roleNames[b.role] ?? b.role}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {!days.some((d) => d.shift) && (
        <Empty title="Nothing booked this week">
          Set your availability so your manager can book you.
        </Empty>
      )}
    </>
  );
}
