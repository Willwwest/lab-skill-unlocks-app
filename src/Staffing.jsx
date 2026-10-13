// Coach staffing screens: where everyone is, the day by the hour, the
// staffing check, shift requests, time portfolios and owner settings.
// CoachApp draws the masthead and tabs; these are the tab bodies. Rules live
// in staffing.js.
import React, { useMemo, useState } from "react";
import { Coffee, Minus, Plus, Trash2, UserPlus } from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  CoachMark,
  Empty,
  Eyebrow,
  Field,
  IconButton,
  SaveBar,
  Section,
  Segmented,
  Select,
  Stat,
  StatStrip,
  Tag,
  TextArea,
} from "./ds/index.jsx";
import { coaches, staff } from "./roster.js";
import { clock, dayKey, sessions, sessionPhase } from "./club.js";
import { calendarDayLabel, gymMinutes, toMinutes } from "./gym-time.js";
import { roleNames, staffName } from "./gym.js";
import {
  BREAK_LENGTHS,
  actualMix,
  applyStaffing,
  blockCheck,
  boardNow,
  breakClashes,
  breakSlots,
  breaksOn,
  coachStatusAt,
  commitments,
  coverCandidates,
  dayCheck,
  dayGrid,
  floaterOn,
  levelNames,
  levelOf,
  modalities,
  minutesToTime,
  pendingRequests,
  portfolioOf,
  portfolioProblem,
  requestKinds,
  requestSummary,
  requestsFor,
  shiftOn,
  staffingOf,
  statusInfo,
} from "./staffing.js";
import "./staffing.css";

/* ---------- Tabs ---------- */

// Which tabs a staff member sees, in order.
export function staffTabs(me) {
  if (me.owner)
    return [
      ["now", "Right now"],
      ["day", "By the hour"],
      ["check", "Staffing"],
      ["requests", "Requests"],
      ["pie", "Portfolios"],
      ["owner", "Owner"],
    ];
  if (me.head)
    return [
      ["now", "Right now"],
      ["day", "By the hour"],
      ["check", "Staffing"],
      ["requests", "Requests"],
      ["pie", "Portfolios"],
      ["me", "My shift"],
    ];
  return [
    ["me", "My shift"],
    ["requests", "Requests"],
    ["pie", "My time"],
  ];
}

export const staffTitles = {
  now: ["Right", "now."],
  day: ["The day", "by the hour."],
  check: ["Staffing", "check."],
  requests: ["Shift", "requests."],
  pie: ["Time", "portfolios."],
  owner: ["Owner", "settings."],
  me: ["My", "shift."],
};
export const staffLeads = {
  now: "Where every coach is this minute, and who's on break.",
  day: "Every coach's day in half hours: class, open gym, floating, break.",
  check: "Each block against the minimums, the floater and the kid ratio.",
  requests: "Covers, days off and hour changes, with who can step in.",
  pie: "How each coach wants their time split, against what's booked today.",
  owner: "Ratios, minimums, break limits, standing hours and who manages.",
  me: "Your day, your breaks, and what's next.",
};

/* ---------- Small pieces ---------- */

const statusLine = (st) => {
  if (st.status === "off") return st.shift ? "Off shift" : "Not working today";
  if (st.status === "break") return `Back at ${clock(st.until)}`;
  if (st.status === "class")
    return `${st.block.name} · ${roleNames[st.role]} until ${clock(st.until)}`;
  if (st.status === "open") return `${st.block.name} until ${clock(st.until)}`;
  if (st.status === "floater")
    return `Floating ${st.block.name} until ${clock(st.until)}`;
  return st.next
    ? `Free until ${clock(minutesToTime(st.next.start))}`
    : "Free for the rest of the shift";
};

function StatusTag({ status }) {
  const info = statusInfo[status];
  return <Tag tone={info.tone}>{info.label}</Tag>;
}

function Legend() {
  return (
    <ul className="st-legend" aria-label="Legend">
      {["class", "open", "floater", "break", "free", "off"].map((k) => (
        <li key={k}>
          <span className={`st-swatch st-${k}`} aria-hidden="true" />
          {statusInfo[k].label}
        </li>
      ))}
    </ul>
  );
}

// A donut of a portfolio's shares in modality order.
export function Pie({ value, size = 120, label }) {
  const r = 15.9155;
  let offset = 25;
  return (
    <svg
      className="st-pie"
      viewBox="0 0 42 42"
      width={size}
      height={size}
      role="img"
      aria-label={
        label ??
        modalities.map((m) => `${m.short} ${value[m.id] ?? 0}%`).join(", ")
      }
    >
      <circle className="st-pie-track" cx="21" cy="21" r={r} />
      {modalities.map((m) => {
        const v = Math.max(0, value[m.id] ?? 0);
        const el = (
          <circle
            key={m.id}
            className={`st-pie-seg st-${m.id}`}
            cx="21"
            cy="21"
            r={r}
            strokeDasharray={`${v} ${100 - v}`}
            strokeDashoffset={offset}
          />
        );
        offset -= v;
        return el;
      })}
    </svg>
  );
}

const run = (ops, message, action) =>
  ops.run(message, (s) =>
    applyStaffing(s, { actor: ops.actor, ...action }, ops.now),
  );

const timeOptions = (from = 8 * 60, to = 21 * 60, step = 15) => {
  const out = [];
  for (let m = from; m <= to; m += step)
    out.push({ value: minutesToTime(m), label: clock(minutesToTime(m)) });
  return out;
};
const TIMES = timeOptions();

/* ---------- Right now ---------- */

export function NowPanel({ ops }) {
  const { state, now } = ops;
  const board = boardNow(state, now);
  const count = (k) => board.filter((b) => b.status === k).length;
  const out = board.filter((b) => b.status === "break");
  const m = gymMinutes(now);
  const nextBreak = breaksOn(state, now).find((b) => toMinutes(b.start) > m);
  const live = sessions(now).filter((b) => sessionPhase(b, now) === "live");
  return (
    <>
      <StatStrip>
        <Stat
          tone="sky"
          label="On the floor"
          value={count("class") + count("open") + count("floater")}
        >
          <b>in class, open gym or floating</b>
        </Stat>
        <Stat tone="lime" label="On break" value={count("break")}>
          <b>limit {staffingOf(state).rules.maxOnBreak ?? 1} at a time</b>
        </Stat>
        <Stat tone="mint" label="Available" value={count("free")}>
          <b>on shift, not booked</b>
        </Stat>
        <Stat tone="lavender" label="Off" value={count("off")}>
          <b>not on shift now</b>
        </Stat>
      </StatStrip>
      <Card tone="ink" className="st-now-ink">
        <Eyebrow tone="sky">Breaks</Eyebrow>
        <h3 className="ds-h2">
          {out.length
            ? out
                .map((b) => `${b.staff.name} until ${clock(b.until)}`)
                .join(" · ")
            : "Nobody is on break."}
        </h3>
        <p className="ds-note">
          {nextBreak
            ? `Next: ${staffName(nextBreak.staffId)} at ${clock(nextBreak.start)}.`
            : "No more breaks booked today."}{" "}
          {live.length
            ? `Live now: ${live.map((b) => b.name).join(", ")}.`
            : "No block is live."}
        </p>
      </Card>
      <Section
        title="Every coach"
        note="Live status from the day's crews, floaters, shifts and breaks."
      >
        <div className="st-board">
          {board.map((b) => (
            <Card
              key={b.staff.id}
              pad="md"
              className={`st-coach st-edge-${b.status}`}
            >
              <div className="st-coach-head">
                <CoachMark initials={b.staff.initials} size={40} />
                <div>
                  <b>{b.staff.name}</b>
                  <small>
                    {b.shift
                      ? `${clock(b.shift.start)}–${clock(b.shift.end)}`
                      : "Off today"}
                  </small>
                </div>
                <StatusTag status={b.status} />
              </div>
              <p className="ds-note">{statusLine(b)}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ---------- By the hour ---------- */

export function DayPanel({ ops }) {
  const { state, now, me } = ops;
  const grid = useMemo(() => dayGrid(state, now, 30), [state, now]);
  const m = gymMinutes(now);
  const clashes = breakClashes(state, now);
  const breaks = breaksOn(state, now);
  return (
    <>
      <Section
        title="Today by the half hour"
        note="Scroll sideways on a phone. The column with a ring is now."
        actions={<Legend />}
      >
        <Card pad="sm" className="st-grid-card">
          <div className="st-grid-scroll">
            <table className="st-grid">
              <thead>
                <tr>
                  <th scope="col" className="st-grid-name">
                    Coach
                  </th>
                  {grid.slots.map((t) => (
                    <th
                      key={t}
                      scope="col"
                      className={
                        m >= t && m < t + grid.step ? "st-grid-now" : undefined
                      }
                    >
                      {t % 60 === 0 ? clock(minutesToTime(t)) : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((r) => (
                  <tr key={r.staff.id}>
                    <th scope="row" className="st-grid-name">
                      <CoachMark initials={r.staff.initials} size={28} />
                      <span>{r.staff.name.replace("Coach ", "")}</span>
                    </th>
                    {r.cells.map((c, i) => (
                      <td
                        key={grid.slots[i]}
                        className={`st-${c} ${m >= grid.slots[i] && m < grid.slots[i] + grid.step ? "st-grid-now" : ""}`}
                        title={`${clock(minutesToTime(grid.slots[i]))} · ${statusInfo[c].label}`}
                      >
                        <span className="sr-only">{statusInfo[c].label}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>
      <Section
        title="Breaks today"
        note="One coach on break at a time. A second break that overlaps is refused."
      >
        <Card>
          {clashes.length > 0 && (
            <Tag tone="bad">
              {clashes.length} overlapping{" "}
              {clashes.length === 1 ? "pair" : "pairs"}
            </Tag>
          )}
          {breaks.length ? (
            <ul className="st-list">
              {breaks.map((b) => (
                <li key={b.id}>
                  <Coffee size={18} aria-hidden="true" />
                  <span>
                    <b>{staffName(b.staffId)}</b> {clock(b.start)}–
                    {clock(b.end)}
                  </span>
                  {(me.head || b.staffId === me.id) && (
                    <IconButton
                      label={`Remove ${staffName(b.staffId)}'s break`}
                      icon={Trash2}
                      tone="danger"
                      onClick={() =>
                        run(ops, "Break removed.", {
                          type: "removeBreak",
                          id: b.id,
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Coffee} title="No breaks booked yet" />
          )}
        </Card>
      </Section>
    </>
  );
}

/* ---------- Staffing check ---------- */

function BlockCard({ ops, check, at }) {
  const { state, me } = ops;
  const { block, crew, floater, kids, ratio, need, issues } = check;
  const [expected, setExpected] = useState(
    String(staffingOf(state).rules.expected?.[block.index] ?? ""),
  );
  const fit = coverCandidates(state, block, at).slice(0, 3);
  const floaters = coverCandidates(state, block, at, { kind: "floater" });
  const ok = issues.length === 0;
  const phase = sessionPhase(block, at);
  return (
    <Card className={`st-block ${ok ? "is-ok" : "has-issues"}`}>
      <CardHead
        title={block.name}
        note={`${clock(block.start)}–${clock(block.end)} · ${block.kind === "class" ? `Class${block.ages ? `, ages ${block.ages}` : ""}` : "Open gym"}`}
        aside={
          ok ? (
            <Tag tone="good">Staffed</Tag>
          ) : (
            <Tag tone={issues.some((i) => i.tone === "bad") ? "bad" : "warn"}>
              {issues.length} to fix
            </Tag>
          )
        }
      />
      <div className="st-block-nums">
        <span>
          <b>{crew.length}</b> of {need} coaches
        </span>
        <span>
          <b>{kids}</b> kids at 1:{ratio}
        </span>
        {block.kind === "class" && (
          <span>
            Floater <b>{floater ? staffName(floater) : "none"}</b>
          </span>
        )}
        {phase === "done" && <Tag tone="outline">Finished</Tag>}
      </div>
      <div className="st-crew">
        {crew.map((c) => {
          const s = staff.find((x) => x.id === c.staffId);
          return (
            <span key={c.staffId} className="st-crew-mark">
              <CoachMark
                initials={s?.initials ?? "?"}
                role={
                  c.role === "head"
                    ? "head"
                    : c.role === "attendant"
                      ? "attendant"
                      : undefined
                }
                size={32}
                title={`${s?.name} · ${roleNames[c.role]}`}
              />
              <small>{s?.name.replace("Coach ", "")}</small>
            </span>
          );
        })}
      </div>
      {issues.length > 0 && (
        <ul className="st-issues">
          {issues.map((i, n) => (
            <li key={n}>
              <Tag tone={i.tone}>{i.tone === "bad" ? "Gap" : "Check"}</Tag>
              {i.text}
            </li>
          ))}
        </ul>
      )}
      {me.head && phase !== "done" && (
        <div className="st-block-tools">
          {crew.length < need && (
            <div className="st-fill">
              <span className="ds-field-label">Best fit to add today</span>
              {fit.length ? (
                <div className="st-chips">
                  {fit.map((c) => (
                    <Button
                      key={c.staff.id}
                      variant="secondary"
                      size="sm"
                      icon={UserPlus}
                      onClick={() =>
                        run(
                          ops,
                          `${c.staff.name} added to ${block.name} today.`,
                          {
                            type: "assign",
                            index: block.index,
                            staffId: c.staff.id,
                          },
                        )
                      }
                    >
                      {c.staff.name.replace("Coach ", "")}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="ds-note">
                  Nobody is free for all of it. Change someone's hours in
                  Requests or ask the owner to adjust standing hours.
                </p>
              )}
            </div>
          )}
          {block.kind === "class" && (
            <Field label="Floater today">
              <Select
                value={floater ?? ""}
                onChange={(v) =>
                  run(
                    ops,
                    v
                      ? `${staffName(v)} floats ${block.name}.`
                      : "Floater cleared.",
                    {
                      type: "floater",
                      index: block.index,
                      staffId: v || null,
                      today: true,
                    },
                  )
                }
                options={[
                  { value: "", label: "No floater" },
                  ...(floater
                    ? [{ value: floater, label: staffName(floater) }]
                    : []),
                  ...floaters.map((c) => ({
                    value: c.staff.id,
                    label: `${c.staff.name} (${c.gap >= 0 ? "+" : ""}${c.gap}% to target)`,
                  })),
                ]}
              />
            </Field>
          )}
          <Field
            label="Expected kids"
            hint={
              block.kind === "class"
                ? "Leave blank to use the roster."
                : "Open gym has no roster. Set a headcount to plan for."
            }
          >
            <span className="st-inline">
              <input
                className="st-number"
                type="number"
                inputMode="numeric"
                min="0"
                max="200"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={
                  expected ===
                  String(staffingOf(state).rules.expected?.[block.index] ?? "")
                }
                onClick={() =>
                  run(ops, "Expected kids saved.", {
                    type: "rules",
                    rules: {
                      expected: {
                        ...staffingOf(state).rules.expected,
                        [block.index]:
                          expected === "" ? null : Number(expected),
                      },
                    },
                  })
                }
              >
                Save
              </Button>
            </span>
          </Field>
        </div>
      )}
    </Card>
  );
}

export function CheckPanel({ ops }) {
  const { state, now } = ops;
  const checks = dayCheck(state, now);
  const staffed = checks.filter((c) => !c.issues.length).length;
  const r = staffingOf(state).rules;
  return (
    <>
      <StatStrip>
        <Stat
          tone="mint"
          label="Fully staffed"
          value={staffed}
          unit={`/${checks.length}`}
        >
          <b>blocks today</b>
        </Stat>
        <Stat tone="sky" label="Class minimum" value={r.classMin}>
          <b>coaches per ninja class</b>
        </Stat>
        <Stat tone="lime" label="Open gym" value={r.openMin}>
          <b>coach minimum</b>
        </Stat>
        <Stat tone="lavender" label="Ratios" value={`1:${r.classRatio}`}>
          <b>
            classes · 1:{r.youngRatio} with kids 6 and under · open 1:
            {r.openRatio}
          </b>
        </Stat>
      </StatStrip>
      <Section
        title="Every block today"
        note="Coaches needed is the minimum or kids ÷ ratio, whichever is more. Changes here apply to today only."
      >
        <div className="st-blocks">
          {checks.map((c) => (
            <BlockCard key={c.block.id} ops={ops} check={c} at={now} />
          ))}
        </div>
      </Section>
    </>
  );
}

/* ---------- Requests ---------- */

function RequestRow({ ops, r }) {
  const { state, now, me } = ops;
  const [to, setTo] = useState(r.toStaffId ?? "");
  const [reply, setReply] = useState("");
  const block =
    r.index === null
      ? null
      : sessions(`${r.day}T19:00:00Z`).find((b) => b.index === r.index);
  const options =
    r.kind === "cover" && block
      ? coverCandidates(state, block, `${r.day}T19:00:00Z`, {
          kind:
            floaterOn(state, block.index, `${r.day}T19:00:00Z`) === r.staffId
              ? "floater"
              : undefined,
        })
      : [];
  const canVolunteer =
    r.status === "pending" &&
    r.kind === "cover" &&
    r.staffId !== me.id &&
    !r.toStaffId &&
    options.some((c) => c.staff.id === me.id);
  const mine = r.staffId === me.id;
  const tone = {
    pending: "warn",
    approved: "good",
    denied: "bad",
    cancelled: "outline",
  }[r.status];
  return (
    <Card pad="md" className="st-request">
      <div className="st-request-head">
        <CoachMark
          initials={staff.find((s) => s.id === r.staffId)?.initials ?? "?"}
          size={36}
        />
        <div>
          <b>
            {staffName(r.staffId)} · {requestKinds[r.kind]}
          </b>
          <small>
            {requestSummary(r)} ·{" "}
            {r.day === dayKey(now) ? "today" : calendarDayLabel(r.day)}
          </small>
        </div>
        <Tag tone={tone}>{r.status[0].toUpperCase() + r.status.slice(1)}</Tag>
      </div>
      {r.note && <p className="st-quote">“{r.note}”</p>}
      {r.toStaffId && (
        <p className="ds-note">
          {r.volunteered ? "Volunteer" : "Cover"}:{" "}
          <b>{staffName(r.toStaffId)}</b>
        </p>
      )}
      {r.reply && <p className="ds-note">Reply: {r.reply}</p>}
      {r.status === "pending" && (
        <div className="st-request-actions">
          {canVolunteer && (
            <Button
              size="sm"
              onClick={() =>
                run(ops, "Thanks. The manager will confirm.", {
                  type: "volunteer",
                  id: r.id,
                })
              }
            >
              I can cover it
            </Button>
          )}
          {me.head && (
            <>
              {r.kind === "cover" && (
                <Field label="Who covers">
                  <Select
                    value={to}
                    onChange={setTo}
                    options={[
                      {
                        value: "",
                        label: options.length
                          ? "Choose a coach"
                          : "Nobody is free",
                      },
                      ...options.map((c) => ({
                        value: c.staff.id,
                        label: `${c.staff.name}${c.staff.id === r.toStaffId ? " (volunteered)" : ""}`,
                      })),
                    ]}
                  />
                </Field>
              )}
              <Field label="Reply (optional)">
                <TextArea value={reply} onChange={setReply} rows={1} />
              </Field>
              <div className="st-chips">
                <Button
                  size="sm"
                  variant="dark"
                  disabled={r.kind === "cover" && !to}
                  onClick={() =>
                    run(ops, "Approved. Today's schedule is updated.", {
                      type: "decide",
                      id: r.id,
                      approve: true,
                      toStaffId: to || undefined,
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    run(ops, "Request declined.", {
                      type: "decide",
                      id: r.id,
                      approve: false,
                      reply,
                    })
                  }
                >
                  Decline
                </Button>
              </div>
            </>
          )}
          {mine && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                run(ops, "Request withdrawn.", {
                  type: "cancelRequest",
                  id: r.id,
                })
              }
            >
              Withdraw
            </Button>
          )}
        </div>
      )}
      {r.status === "pending" &&
        !me.head &&
        !mine &&
        !canVolunteer &&
        r.kind === "cover" && (
          <p className="ds-note">
            You're busy or off then, so you can't take it.
          </p>
        )}
    </Card>
  );
}

function NewRequest({ ops }) {
  const { state, now, me } = ops;
  const mine = commitments(state, me.id, now).filter(
    (c) => sessionPhase(c.block, now) !== "done",
  );
  const shift = shiftOn(state, me.id, now);
  const [kind, setKind] = useState("cover");
  const [index, setIndex] = useState(String(mine[0]?.block.index ?? ""));
  const [start, setStart] = useState(shift?.start ?? "09:00");
  const [end, setEnd] = useState(shift?.end ?? "17:00");
  const [note, setNote] = useState("");
  const send = () => {
    const ok = run(ops, "Request sent to the gym manager.", {
      type: "request",
      staffId: me.id,
      kind,
      index: kind === "cover" ? Number(index) : undefined,
      start,
      end,
      note,
    });
    if (ok) setNote("");
  };
  return (
    <Card>
      <CardHead
        title="Ask for a change today"
        note="The gym manager approves. Coaches who are free can volunteer to cover."
      />
      <Segmented
        label="What you need"
        options={[
          { value: "cover", label: "Cover" },
          { value: "timeoff", label: "Day off" },
          { value: "hours", label: "Hours" },
        ]}
        value={kind}
        onChange={setKind}
      />
      {kind === "cover" &&
        (mine.length ? (
          <Field label="Which block">
            <Select
              value={index}
              onChange={setIndex}
              options={[
                ...new Map(mine.map((c) => [c.block.index, c])).values(),
              ].map((c) => ({
                value: String(c.block.index),
                label: `${c.block.name}, ${clock(c.block.start)}–${clock(c.block.end)}${c.kind === "floater" ? " (floater)" : ""}`,
              }))}
            />
          </Field>
        ) : (
          <p className="ds-note">You have no blocks left today.</p>
        ))}
      {kind === "hours" && (
        <div className="st-two">
          <Field label="Start">
            <Select value={start} onChange={setStart} options={TIMES} />
          </Field>
          <Field label="End">
            <Select value={end} onChange={setEnd} options={TIMES} />
          </Field>
        </div>
      )}
      <Field label="Note for the manager (optional)">
        <TextArea value={note} onChange={setNote} rows={2} maxLength={280} />
      </Field>
      <div>
        <Button onClick={send} disabled={kind === "cover" && !mine.length}>
          Send request
        </Button>
      </div>
    </Card>
  );
}

export function RequestsPanel({ ops }) {
  const { state, me } = ops;
  const all = requestsFor(state);
  const pending = all.filter((r) => r.status === "pending");
  const others = pending.filter((r) => r.staffId !== me.id);
  const mine = all.filter((r) => r.staffId === me.id);
  const closed = all.filter((r) => r.status !== "pending").slice(0, 12);
  return (
    <>
      {me.head ? (
        <Section
          title={`Waiting on you · ${pending.length}`}
          note="Approving a cover swaps the coach on that block for that day only. A day off takes the coach off every block that day."
        >
          {pending.length ? (
            <div className="st-requests">
              {pending.map((r) => (
                <RequestRow key={r.id} ops={ops} r={r} />
              ))}
            </div>
          ) : (
            <Card>
              <Empty title="Nothing to decide">New requests land here.</Empty>
            </Card>
          )}
        </Section>
      ) : (
        <Section
          title="Covers you could take"
          note="Only blocks where you're on shift and free."
        >
          {others.filter((r) => r.kind === "cover").length ? (
            <div className="st-requests">
              {others
                .filter((r) => r.kind === "cover")
                .map((r) => (
                  <RequestRow key={r.id} ops={ops} r={r} />
                ))}
            </div>
          ) : (
            <Card>
              <Empty title="No open covers" />
            </Card>
          )}
        </Section>
      )}
      {!me.owner && (
        <Section
          title="Your requests"
          note="Ask for cover, a day off or different hours."
        >
          <div className="st-requests">
            <NewRequest ops={ops} />
            {mine.map((r) => (
              <RequestRow key={r.id} ops={ops} r={r} />
            ))}
          </div>
        </Section>
      )}
      {me.head && closed.length > 0 && (
        <Section title="Decided" note="The most recent first.">
          <div className="st-requests">
            {closed.map((r) => (
              <RequestRow key={r.id} ops={ops} r={r} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/* ---------- Portfolios ---------- */

function PieEditor({ ops, staffId }) {
  const { state, now } = ops;
  const saved = portfolioOf(state, staffId);
  const [draft, setDraft] = useState(saved);
  const minShare = staffingOf(state).rules.minShare;
  const sum = modalities.reduce((n, m) => n + (draft[m.id] ?? 0), 0);
  const problem = portfolioProblem(draft, minShare);
  const changed = modalities.some((m) => draft[m.id] !== saved[m.id]);
  const mix = actualMix(state, staffId, now);
  const step = (id, d) =>
    setDraft((p) => ({
      ...p,
      [id]: Math.max(0, Math.min(100, (p[id] ?? 0) + d)),
    }));
  return (
    <Card className="st-pie-editor">
      <CardHead
        title={
          staffId === ops.me.id
            ? "How you want your time split"
            : `${staffName(staffId)}'s split`
        }
        note={`At least ${minShare}% in each, adding up to 100%.`}
        aside={<Tag tone={sum === 100 ? "good" : "warn"}>{sum}% of 100</Tag>}
      />
      <div className="st-pie-row">
        <Pie value={draft} size={160} />
        <ul className="st-shares">
          {modalities.map((m) => (
            <li key={m.id}>
              <span className={`st-swatch st-${m.id}`} aria-hidden="true" />
              <span className="st-share-name">
                <b>{m.label}</b>
                <small>
                  Booked today {mix.share[m.id]}% ·{" "}
                  {Math.round(mix.minutes[m.id] / 6) / 10} h
                </small>
              </span>
              <span className="st-stepper">
                <IconButton
                  label={`Less ${m.label}`}
                  icon={Minus}
                  onClick={() => step(m.id, -5)}
                  disabled={(draft[m.id] ?? 0) <= 0}
                />
                <b aria-live="polite">{draft[m.id] ?? 0}%</b>
                <IconButton
                  label={`More ${m.label}`}
                  icon={Plus}
                  onClick={() => step(m.id, 5)}
                  disabled={(draft[m.id] ?? 0) >= 100}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
      {changed && problem && <p className="st-problem">{problem}</p>}
      <SaveBar
        show={changed}
        message={problem ?? "Unsaved split"}
        onDiscard={() => setDraft(saved)}
        onSave={() =>
          !problem &&
          run(ops, "Time split saved.", {
            type: "portfolio",
            staffId,
            portfolio: draft,
          })
        }
      />
    </Card>
  );
}

export function PiePanel({ ops }) {
  const { state, now, me } = ops;
  const [editing, setEditing] = useState(null);
  const rows = coaches.map((s) => {
    const target = portfolioOf(state, s.id);
    const mix = actualMix(state, s.id, now);
    const drift = mix.total
      ? Math.max(
          ...modalities.map((m) => Math.abs(target[m.id] - mix.share[m.id])),
        )
      : 0;
    return { s, target, mix, drift };
  });
  return (
    <>
      {!me.owner && <PieEditor key={me.id} ops={ops} staffId={me.id} />}
      {me.head && (
        <Section
          title="Every coach"
          note="Target split next to what's booked today. Over 20 points off is flagged. The staffing check suggests coaches furthest under target first."
        >
          <div className="st-pies">
            {rows.map(({ s, target, mix, drift }) => (
              <Card key={s.id} pad="md" className="st-pie-card">
                <div className="st-pie-card-head">
                  <CoachMark initials={s.initials} size={32} />
                  <b>{s.name}</b>
                  {mix.total === 0 ? (
                    <Tag tone="outline">Nothing booked</Tag>
                  ) : drift > 20 ? (
                    <Tag tone="warn">{drift} pts off</Tag>
                  ) : (
                    <Tag tone="good">On target</Tag>
                  )}
                </div>
                <div className="st-pie-pair">
                  <figure>
                    <Pie value={target} size={88} label={`${s.name} target`} />
                    <figcaption>Target</figcaption>
                  </figure>
                  <figure>
                    <Pie
                      value={mix.share}
                      size={88}
                      label={`${s.name} booked today`}
                    />
                    <figcaption>Booked today</figcaption>
                  </figure>
                </div>
                <p className="ds-note st-pie-nums">
                  {modalities
                    .map(
                      (m) =>
                        `${m.short} ${target[m.id]}% / ${mix.share[m.id]}%`,
                    )
                    .join(" · ")}
                </p>
                {editing !== s.id && s.id !== me.id && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(s.id)}
                  >
                    Edit split
                  </Button>
                )}
              </Card>
            ))}
          </div>
          {editing && <PieEditor key={editing} ops={ops} staffId={editing} />}
          <Legend />
        </Section>
      )}
    </>
  );
}

/* ---------- My shift ---------- */

export function MePanel({ ops }) {
  const { state, now, me } = ops;
  const st = coachStatusAt(state, me.id, now);
  const shift = shiftOn(state, me.id, now);
  const [length, setLength] = useState(30);
  const slots = breakSlots(state, me.id, now, length, 6);
  const day = commitments(state, me.id, now);
  const myBreaks = breaksOn(state, now).filter((b) => b.staffId === me.id);
  const others = breaksOn(state, now).filter((b) => b.staffId !== me.id);
  const m = gymMinutes(now);
  const items = [
    ...day.map((c) => ({
      key: `${c.kind}-${c.block.index}`,
      start: c.start,
      end: c.end,
      kind: c.kind,
      title:
        c.kind === "floater"
          ? `Float ${c.block.name}`
          : `${c.block.name} · ${roleNames[c.role]}`,
    })),
    ...myBreaks.map((b) => ({
      key: b.id,
      start: toMinutes(b.start),
      end: toMinutes(b.end),
      kind: "break",
      title: "Break",
      id: b.id,
    })),
  ].sort((a, b) => a.start - b.start);
  return (
    <>
      <Card tone="ink" className="st-now-ink">
        <Eyebrow tone="sky">
          {shift ? `Shift ${clock(shift.start)}–${clock(shift.end)}` : "Today"}
        </Eyebrow>
        <h3 className="ds-h2">
          {statusInfo[st.status].label}. {statusLine(st)}
        </h3>
        <p className="ds-note">
          {others.length
            ? `Other breaks today: ${others.map((b) => `${staffName(b.staffId)} ${clock(b.start)}`).join(", ")}.`
            : "Nobody else has a break booked."}
        </p>
      </Card>
      <Section
        title="Take a break"
        note="Only times when nobody else is on break and you're not booked show up."
      >
        <Card>
          <Segmented
            label="Break length"
            options={BREAK_LENGTHS.map((n) => ({
              value: n,
              label: `${n} min`,
            }))}
            value={length}
            onChange={setLength}
          />
          {!shift ? (
            <p className="ds-note">You're not working today.</p>
          ) : slots.length ? (
            <div className="st-chips">
              {slots.map((s) => (
                <Button
                  key={s.start}
                  variant="secondary"
                  icon={Coffee}
                  onClick={() =>
                    run(
                      ops,
                      `Break booked ${clock(s.start)}–${clock(s.end)}.`,
                      {
                        type: "addBreak",
                        staffId: me.id,
                        start: s.start,
                        end: s.end,
                      },
                    )
                  }
                >
                  {clock(s.start)}–{clock(s.end)}
                </Button>
              ))}
            </div>
          ) : (
            <p className="ds-note">
              No {length}-minute gap left today. Try a shorter break or ask for
              cover in Requests.
            </p>
          )}
        </Card>
      </Section>
      <Section title="Your day" note="Blocks, floating and breaks in order.">
        <Card>
          {items.length ? (
            <ol className="st-timeline">
              {items.map((it) => (
                <li
                  key={it.key}
                  className={`st-edge-${it.kind} ${m >= it.start && m < it.end ? "is-now" : m >= it.end ? "is-done" : ""}`}
                >
                  <span className="st-time">
                    {clock(minutesToTime(it.start))}–
                    {clock(minutesToTime(it.end))}
                  </span>
                  <b>{it.title}</b>
                  {it.kind === "break" && m < it.start && (
                    <IconButton
                      label="Cancel this break"
                      icon={Trash2}
                      tone="danger"
                      onClick={() =>
                        run(ops, "Break cancelled.", {
                          type: "removeBreak",
                          id: it.id,
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="Nothing booked today" />
          )}
        </Card>
      </Section>
    </>
  );
}

/* ---------- Owner ---------- */

const ruleFields = [
  ["classMin", "Coaches per ninja class", "Minimum, including the head coach"],
  ["openMin", "Coaches per open gym", "Minimum on the floor"],
  ["classRatio", "Kids per coach in class", "Ages 7 and up"],
  [
    "youngRatio",
    "Kids per coach, little ones",
    "Classes with a kid 6 or under",
  ],
  ["openRatio", "Kids per coach at open gym", "Against the expected headcount"],
  [
    "maxOnBreak",
    "Coaches on break at once",
    "A second overlapping break is refused",
  ],
  [
    "minShare",
    "Minimum share of each kind of work",
    "Percent, for every coach's split",
  ],
];

export function OwnerPanel({ ops }) {
  const { state } = ops;
  const s = staffingOf(state);
  const [rules, setRules] = useState(s.rules);
  const [hours, setHours] = useState(() =>
    Object.fromEntries(
      coaches.map((c) => [
        c.id,
        s.shifts[c.id] ?? { start: "09:00", end: "17:00" },
      ]),
    ),
  );
  const rulesChanged =
    ruleFields.some(([k]) => Number(rules[k]) !== s.rules[k]) ||
    rules.floaterPerClass !== s.rules.floaterPerClass;
  const hoursChanged = coaches.filter(
    (c) =>
      hours[c.id].start !== (s.shifts[c.id]?.start ?? "09:00") ||
      hours[c.id].end !== (s.shifts[c.id]?.end ?? "17:00"),
  );
  const pending = pendingRequests(state).length;
  const checks = dayCheck(state, ops.now);
  const save = () => {
    let ok = true;
    if (rulesChanged) {
      const next = Object.fromEntries(
        ruleFields.map(([k]) => [k, Number(rules[k])]),
      );
      ok = run(ops, "Staffing rules saved.", {
        type: "rules",
        rules: { ...next, floaterPerClass: rules.floaterPerClass },
      });
    }
    for (const c of hoursChanged)
      if (ok)
        ok = run(ops, "Standing hours saved.", {
          type: "shift",
          staffId: c.id,
          ...hours[c.id],
        });
  };
  return (
    <>
      <StatStrip cols={3}>
        <Stat
          tone="mint"
          label="Staffed today"
          value={checks.filter((c) => !c.issues.length).length}
          unit={`/${checks.length}`}
        >
          <b>blocks with no gaps</b>
        </Stat>
        <Stat tone="lime" label="Requests" value={pending}>
          <b>waiting on a manager</b>
        </Stat>
        <Stat tone="sky" label="Coaches" value={coaches.length}>
          <b>
            {coaches.filter((c) => levelOf(state, c.id) === "manager").length}{" "}
            gym managers
          </b>
        </Stat>
      </StatStrip>
      <Section
        title="Staffing rules"
        note="These drive the staffing check, break booking and every coach's split."
      >
        <Card>
          <div className="st-rules">
            {ruleFields.map(([k, label, hint]) => (
              <Field key={k} label={label} hint={hint}>
                <input
                  className="st-number"
                  type="number"
                  inputMode="numeric"
                  min={k === "minShare" ? 0 : 1}
                  max={
                    k === "minShare"
                      ? Math.floor(100 / modalities.length)
                      : k === "maxOnBreak"
                        ? 5
                        : 40
                  }
                  value={rules[k]}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      [k]: e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </Field>
            ))}
            <Field
              label="Floater for every class"
              hint="Covers the 10 minutes before and after"
            >
              <Segmented
                label="Floater for every class"
                options={[
                  { value: 1, label: "Required" },
                  { value: 0, label: "Optional" },
                ]}
                value={rules.floaterPerClass}
                onChange={(v) => setRules({ ...rules, floaterPerClass: v })}
              />
            </Field>
          </div>
        </Card>
      </Section>
      <Section
        title="Standing hours"
        note="Each coach's usual shift. Requests can change one day without touching these."
      >
        <Card>
          <ul className="st-hours">
            {coaches.map((c) => (
              <li key={c.id}>
                <CoachMark initials={c.initials} size={32} />
                <b>{c.name}</b>
                <Field label={`${c.name} start`} hideLabel>
                  <Select
                    value={hours[c.id].start}
                    onChange={(v) =>
                      setHours({
                        ...hours,
                        [c.id]: { ...hours[c.id], start: v },
                      })
                    }
                    options={TIMES}
                  />
                </Field>
                <span aria-hidden="true">to</span>
                <Field label={`${c.name} end`} hideLabel>
                  <Select
                    value={hours[c.id].end}
                    onChange={(v) =>
                      setHours({ ...hours, [c.id]: { ...hours[c.id], end: v } })
                    }
                    options={TIMES}
                  />
                </Field>
              </li>
            ))}
          </ul>
        </Card>
      </Section>
      <Section
        title="Who manages"
        note="Gym managers approve requests, fix staffing gaps and see every coach's split."
      >
        <Card>
          <ul className="st-hours">
            {coaches.map((c) => (
              <li key={c.id}>
                <CoachMark initials={c.initials} size={32} />
                <b>{c.name}</b>
                <Segmented
                  label={`${c.name} level`}
                  size="sm"
                  options={[
                    { value: "coach", label: levelNames.coach },
                    { value: "manager", label: levelNames.manager },
                  ]}
                  value={levelOf(state, c.id)}
                  onChange={(v) =>
                    run(
                      ops,
                      `${c.name} is now ${v === "manager" ? "a gym manager" : "a coach"}.`,
                      {
                        type: "role",
                        staffId: c.id,
                        level: v,
                      },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      </Section>
      <SaveBar
        show={rulesChanged || hoursChanged.length > 0}
        onDiscard={() => {
          setRules(s.rules);
          setHours(
            Object.fromEntries(
              coaches.map((c) => [
                c.id,
                s.shifts[c.id] ?? { start: "09:00", end: "17:00" },
              ]),
            ),
          );
        }}
        onSave={save}
      />
    </>
  );
}

export function StaffPanel({ ops, tab }) {
  if (tab === "now") return <NowPanel ops={ops} />;
  if (tab === "day") return <DayPanel ops={ops} />;
  if (tab === "check") return <CheckPanel ops={ops} />;
  if (tab === "requests") return <RequestsPanel ops={ops} />;
  if (tab === "pie") return <PiePanel ops={ops} />;
  if (tab === "owner" && ops.me.owner) return <OwnerPanel ops={ops} />;
  return <MePanel ops={ops} />;
}

// Small count for the nav: requests a manager needs to decide.
export const staffBadge = (state, me) =>
  me.head ? pendingRequests(state).length : 0;
