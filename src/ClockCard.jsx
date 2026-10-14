// The time clock on a coach's Today screen: clock in, breaks, clock out.
import React from "react";
import { Clock } from "lucide-react";
import { Button, Card, Tag } from "./ds/index.jsx";
import { clock } from "./club.js";
import { clockTime } from "./coachkit.jsx";
import {
  applyTime,
  clockStatus,
  clockText,
  paidMinutes,
  timeOf,
} from "./timeclock.js";
import { hoursText } from "./times.js";

const tone = {
  in: "good",
  break: "warn",
  out: "outline",
  late: "bad",
  off: "outline",
};

export default function ClockCard({ ops }) {
  const { state, now, me } = ops;
  const { status, entry, shift } = clockStatus(state, me.id, now);
  const act = (type, msg) =>
    ops.run(msg, (s) =>
      applyTime(s, { type, actor: ops.actor, staffId: me.id }, now),
    );
  const worked = entry ? paidMinutes(entry, timeOf(state).settings, now) : 0;
  return (
    <Card className="ck">
      <div className="ck-head">
        <Clock size={20} aria-hidden="true" />
        <span className="ck-text">
          <b>{clockText[status]}</b>
          <small>
            {entry
              ? `Since ${clockTime(entry.in)} · ${hoursText(worked)} so far`
              : shift
                ? `Your shift today: ${clock(shift.start)}–${clock(shift.end)}`
                : "You aren't on the schedule today"}
          </small>
        </span>
        {entry?.late && <Tag tone="warn">{hoursText(entry.late)} late</Tag>}
        {status === "late" && <Tag tone={tone.late}>Late</Tag>}
      </div>
      <div className="ck-actions">
        {!entry && (
          <Button onClick={() => act("clockIn", "Clocked in.")}>
            {shift ? "Clock in" : "Clock in (not scheduled)"}
          </Button>
        )}
        {status === "in" && (
          <>
            <Button
              variant="secondary"
              onClick={() => act("breakStart", "Break started.")}
            >
              Start break
            </Button>
            <Button
              variant="dark"
              onClick={() => act("clockOut", "Clocked out. See you next time.")}
            >
              Clock out
            </Button>
          </>
        )}
        {status === "break" && (
          <Button onClick={() => act("breakEnd", "Welcome back.")}>
            End break
          </Button>
        )}
      </div>
    </Card>
  );
}
