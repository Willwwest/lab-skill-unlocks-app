// Timesheets for gym managers: each coach's week, scheduled against
// worked, with flags, fixes (always with a reason) and approval. Owners
// also get payroll: the period's hours, overtime, the CSV export and pay
// settings.
import React, { useState } from "react";
import {
  Button,
  Card,
  CoachMark,
  Field,
  Section,
  Segmented,
  Select,
  Tag,
} from "./ds/index.jsx";
import { dayKey } from "./club.js";
import { addDays, calendarDayLabel, weekKeyOf } from "./gym-time.js";
import { coaches } from "./roster.js";
import { clockTime } from "./coachkit.jsx";
import { applyTime, paidMinutes, timeOf, timesheet } from "./timeclock.js";
import {
  applyPay,
  payOf,
  payrollCsv,
  payrollRows,
  periodOf,
  periodStatus,
} from "./payroll.js";
import { TIMES, hoursText } from "./times.js";

const h1 = (m) => `${Math.round((m / 60) * 10) / 10} h`;
const hhmm = (iso) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Phoenix",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(iso))
    : "";

function weekChoices(now) {
  const week = weekKeyOf(dayKey(now));
  return [0, -1, -2, -3].map((i) => {
    const w = addDays(week, i * 7);
    return {
      value: w,
      label:
        i === 0
          ? "This week"
          : i === -1
            ? "Last week"
            : `Week of ${calendarDayLabel(w)}`,
    };
  });
}

function EntryEditor({ ops, entry, onDone }) {
  const [inT, setIn] = useState(hhmm(entry.in));
  const [outT, setOut] = useState(hhmm(entry.out) || "");
  const [reason, setReason] = useState("");
  const opts = [{ value: "", label: "Still in" }, ...TIMES];
  return (
    <div className="ts-edit">
      <Field label="In">
        <Select
          value={inT}
          onChange={setIn}
          options={
            TIMES.some((o) => o.value === inT)
              ? TIMES
              : [{ value: inT, label: inT }, ...TIMES]
          }
        />
      </Field>
      <Field label="Out">
        <Select
          value={outT}
          onChange={setOut}
          options={
            outT && !TIMES.some((o) => o.value === outT)
              ? [{ value: outT, label: outT }, ...opts]
              : opts
          }
        />
      </Field>
      <Field label="Why">
        <input
          className="ds-textarea ts-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Forgot to clock out"
        />
      </Field>
      <Button
        size="sm"
        variant="dark"
        onClick={() => {
          if (
            ops.run("Time fixed. The old times are kept.", (s) =>
              applyTime(
                s,
                {
                  type: "editEntry",
                  actor: ops.actor,
                  id: entry.id,
                  in: inT,
                  out: outT || null,
                  reason,
                },
                ops.now,
              ),
            )
          )
            onDone();
        }}
      >
        Save
      </Button>
    </div>
  );
}

function MissedPunch({ ops, staffId, days }) {
  const [day, setDay] = useState(days[0]);
  const [inT, setIn] = useState("09:30");
  const [outT, setOut] = useState("17:00");
  const [reason, setReason] = useState("");
  return (
    <div className="ts-edit">
      <Field label="Day">
        <Select
          value={day}
          onChange={setDay}
          options={days.map((d) => ({ value: d, label: calendarDayLabel(d) }))}
        />
      </Field>
      <Field label="In">
        <Select value={inT} onChange={setIn} options={TIMES} />
      </Field>
      <Field label="Out">
        <Select value={outT} onChange={setOut} options={TIMES} />
      </Field>
      <Field label="Why">
        <input
          className="ds-textarea ts-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Phone died"
        />
      </Field>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          ops.run("Time added.", (s) =>
            applyTime(
              s,
              {
                type: "addEntry",
                actor: ops.actor,
                staffId,
                day,
                in: inT,
                out: outT,
                reason,
              },
              ops.now,
            ),
          )
        }
      >
        Add missed time
      </Button>
    </div>
  );
}

function CoachSheet({ ops, coach, week }) {
  const { state, now } = ops;
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const sheet = timesheet(state, coach.id, week, now);
  const settings = timeOf(state).settings;
  const entries = sheet.days.flatMap((d) => d.entries);
  const closed = entries.filter((e) => e.out && !e.approvedAt);
  const flags = sheet.days.flatMap((d) =>
    d.flags.map((f) => `${calendarDayLabel(d.day)}: ${f}`),
  );
  const diff = sheet.worked - sheet.scheduled;
  return (
    <Card className="ts-coach">
      <div className="ts-coach-head">
        <CoachMark initials={coach.initials} size={32} />
        <b>{coach.name}</b>
        <span className="ts-nums">
          {h1(sheet.worked)} worked · {h1(sheet.scheduled)} scheduled
        </span>
        {entries.length > 0 &&
          (sheet.approved ? (
            <Tag tone="good">Approved</Tag>
          ) : (
            <Tag tone="warn">To approve</Tag>
          ))}
        {Math.abs(diff) >= 60 && sheet.worked > 0 && (
          <Tag tone="info">
            {diff > 0 ? "+" : "−"}
            {hoursText(Math.abs(diff))}
          </Tag>
        )}
      </div>
      {flags.length > 0 && (
        <p className="ds-note ts-flags">{flags.join(" · ")}</p>
      )}
      {entries.length > 0 && (
        <ul className="ts-entries">
          {sheet.days
            .filter((d) => d.entries.length)
            .flatMap((d) =>
              d.entries.map((e) => (
                <li key={e.id}>
                  <span>
                    <b>{calendarDayLabel(d.day)}</b> {clockTime(e.in)}–
                    {e.out ? clockTime(e.out) : "now"}
                    <small>
                      {" "}
                      · {hoursText(paidMinutes(e, settings, now))}
                      {e.edits?.length
                        ? ` · edited: ${e.edits.at(-1).reason}`
                        : ""}
                    </small>
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setEditing(editing === e.id ? null : e.id)}
                  >
                    {editing === e.id ? "Cancel" : "Fix"}
                  </button>
                  {editing === e.id && (
                    <EntryEditor
                      ops={ops}
                      entry={e}
                      onDone={() => setEditing(null)}
                    />
                  )}
                </li>
              )),
            )}
        </ul>
      )}
      <div className="ts-actions">
        {closed.length > 0 && (
          <Button
            size="sm"
            variant="dark"
            onClick={() =>
              ops.run(`${coach.name}'s week approved.`, (s) =>
                applyTime(
                  s,
                  {
                    type: "approve",
                    actor: ops.actor,
                    ids: closed.map((e) => e.id),
                  },
                  now,
                ),
              )
            }
          >
            Approve {closed.length} {closed.length === 1 ? "record" : "records"}
          </Button>
        )}
        <button className="text-button" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "Add missed time"}
        </button>
      </div>
      {adding && (
        <MissedPunch
          ops={ops}
          staffId={coach.id}
          days={sheet.days.map((d) => d.day).filter((d) => d <= dayKey(now))}
        />
      )}
    </Card>
  );
}

function Payroll({ ops }) {
  const { state, now } = ops;
  const current = periodOf(state, dayKey(now));
  const previous = periodOf(state, addDays(current.start, -1));
  const [which, setWhich] = useState("previous");
  const period = which === "previous" ? previous : current;
  const rows = payrollRows(state, period.start, period.end, now);
  const status = periodStatus(state, period.start);
  const pay = payOf(state);
  const download = () => {
    const csv = payrollCsv(state, period.start, period.end, now);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lab-payroll-${period.start}-to-${period.end}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ops.run("Payroll exported. The period is locked.", (s) =>
      applyPay(
        s,
        {
          type: "exportPeriod",
          actor: ops.actor,
          start: period.start,
          end: period.end,
        },
        now,
      ),
    );
  };
  return (
    <Section
      title="Payroll"
      note={`Overtime is anything over ${pay.otWeeklyHours} hours in a workweek. Pay periods run ${pay.periodKind === "weekly" ? "weekly" : "every two weeks"}.`}
    >
      <Card className="ts-pay">
        <div className="ts-pay-head">
          <Segmented
            size="sm"
            label="Pay period"
            value={which}
            options={[
              {
                value: "previous",
                label: `${calendarDayLabel(previous.start)}–${calendarDayLabel(previous.end)}`,
              },
              { value: "current", label: "This period" },
            ]}
            onChange={setWhich}
          />
          <Tag tone={status === "exported" ? "good" : "outline"}>
            {status === "exported" ? "Exported" : "Open"}
          </Tag>
        </div>
        <div className="ts-table" data-scroll-x>
          <table>
            <thead>
              <tr>
                <th>Coach</th>
                <th>Payroll ID</th>
                <th>Regular</th>
                <th>Overtime</th>
                <th>To approve</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staffId}>
                  <td>{r.firstName}</td>
                  <td>
                    <PayrollId
                      ops={ops}
                      staffId={r.staffId}
                      value={r.payrollId}
                    />
                  </td>
                  <td>{r.regular.toFixed(2)}</td>
                  <td>{r.overtime.toFixed(2)}</td>
                  <td>{r.unapproved || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ts-actions">
          <Button onClick={download} disabled={rows.some((r) => r.open)}>
            Download CSV and lock
          </Button>
          {rows.some((r) => r.unapproved) && (
            <small className="ds-note">Some records aren't approved yet.</small>
          )}
        </div>
      </Card>
    </Section>
  );
}

function PayrollId({ ops, staffId, value }) {
  const [v, setV] = useState(value);
  return (
    <input
      className="ds-textarea ts-id"
      aria-label="Payroll ID"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() =>
        v !== value &&
        ops.run("Payroll ID saved.", (s) =>
          applyPay(
            s,
            {
              type: "person",
              actor: ops.actor,
              staffId,
              payrollId: v,
              rate: payOf(s).people[staffId]?.rate ?? null,
            },
            ops.now,
          ),
        )
      }
    />
  );
}

export default function Timesheets({ ops }) {
  const { now, me } = ops;
  const choices = weekChoices(now);
  const [week, setWeek] = useState(choices[0].value);
  return (
    <>
      <Card className="ts-head">
        <Select value={week} onChange={setWeek} options={choices} />
        <p className="ds-note">
          Clock times come from coaches' phones. Fixes need a reason, and the
          original times are kept.
        </p>
      </Card>
      <div className="ts-list">
        {coaches.map((c) => (
          <CoachSheet key={`${c.id}-${week}`} ops={ops} coach={c} week={week} />
        ))}
      </div>
      {me.owner && <Payroll ops={ops} />}
    </>
  );
}
