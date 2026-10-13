// The manager's insights dashboard and the coach's own week, built on
// insights.js. Charts come from charts.jsx.
import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle,
  Phone,
} from "lucide-react";
import { dayKey } from "./club.js";
import { calendarDayLabel } from "./gym-time.js";
import { plural } from "./format.js";
import { people } from "./domain.js";
import { families, kidInfo } from "./roster.js";
import { Avatar } from "./photos.jsx";
import { insights, ON_TIME_MINUTES } from "./insights.js";
import {
  BarList,
  DailyColumns,
  Heatmap,
  Legend,
  Sparkline,
  TableView,
  TrendLine,
  VisitDots,
  series,
} from "./charts.jsx";
import { data } from "./ds/tokens.js";
import { ChartCard, Segmented, Stat, StatStrip, Tag } from "./ds/index.jsx";
import "./insights.css";

const GOAL_WAIT = 5;
const fmtDay = calendarDayLabel;
const kid = (id) => people.find((p) => p.id === id);

// Signed change vs the previous period; green when it moves the good way.
function Delta({ value, prev, lowerIsBetter, days, unit = "%" }) {
  if (value === null || prev === null || prev === 0)
    return <small className="in-delta">No earlier data</small>;
  const change = unit === "%" ? ((value - prev) / prev) * 100 : value - prev;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  const amount =
    unit === "%"
      ? `${Math.abs(Math.round(change))}%`
      : `${Math.abs(Math.round(change * 10) / 10)} ${unit}`;
  return (
    <small
      className={`in-delta ${Math.abs(change) < 0.5 ? "" : good ? "is-good" : "is-bad"}`}
    >
      <Icon size={16} aria-hidden="true" /> {change >= 0 ? "Up" : "Down"}{" "}
      {amount} vs the {days} days before
    </small>
  );
}

function Kpi({ tone, label, value, unit, spark, children }) {
  return (
    <Stat tone={tone} label={label} value={value} unit={unit}>
      <Sparkline values={spark} />
      {children}
    </Stat>
  );
}

export function InsightsTab({ ops }) {
  const { state, now, openKid } = ops;
  const [days, setDays] = useState(14);
  const today = dayKey(now);
  const d = useMemo(
    () => insights(state, { days, now: new Date() }),
    [state, days, today],
  );
  const k = d.kpis;
  const atRisk = d.newKids.filter((n) => n.atRisk);
  // Stable inputs, so the once-a-second app clock never redraws a chart.
  const kids = useMemo(
    () => d.newKids.map((n) => ({ ...n, dots: n.seen.filter((x) => x <= 60) })),
    [d],
  );
  const bars = useMemo(
    () =>
      d.coaches
        .filter((c) => c.skills || c.checkins)
        .map((c) => ({
          id: c.id,
          label: c.name.replace("Coach ", ""),
          value: c.skills,
        })),
    [d],
  );
  const round = (v) => (v === null ? "—" : Math.round(v));
  return (
    <>
      <div className="in-filters">
        <Segmented
          label="Date range"
          value={days}
          onChange={setDays}
          options={[7, 14, 28].map((n) => ({ value: n, label: `${n} days` }))}
        />
        {d.demo && <Tag tone="outline">Includes 8 weeks of demo history</Tag>}
      </div>
      <StatStrip cols={4}>
        <Kpi
          tone="sky"
          label="Check-ins"
          value={k.checkins.value}
          spark={k.checkins.spark}
        >
          <Delta value={k.checkins.value} prev={k.checkins.prev} days={days} />
        </Kpi>
        <Kpi
          tone="mint"
          label="Desk to floor"
          value={round(k.wait.value)}
          unit="min"
          spark={k.wait.spark}
        >
          <Delta
            value={k.wait.value}
            prev={k.wait.prev}
            days={days}
            lowerIsBetter
            unit="min"
          />
        </Kpi>
        <Kpi
          tone="lime"
          label="Attendance on time"
          value={round(k.onTime.value)}
          unit="%"
          spark={k.onTime.spark}
        >
          <Delta
            value={k.onTime.value}
            prev={k.onTime.prev}
            days={days}
            unit="pts"
          />
        </Kpi>
        <Kpi
          tone="lavender"
          label="Skills unlocked"
          value={k.skills.value}
          spark={k.skills.spark}
        >
          <Delta value={k.skills.value} prev={k.skills.prev} days={days} />
        </Kpi>
      </StatStrip>

      <ChartCard
        className="in-risk"
        title="New members, first 60 days"
        note="One dot per visit. Kids who haven't been in for a week are flagged so someone can reach out."
        legend={
          atRisk.length ? (
            <Tag tone="warn" icon={AlertTriangle}>
              {atRisk.length} need a check-in
            </Tag>
          ) : (
            <Tag tone="good" icon={CheckCircle}>
              Everyone's coming in
            </Tag>
          )
        }
        table={
          <TableView
            head={[
              "Kid",
              "Joined (days ago)",
              "Visits",
              "Days since last visit",
              "Status",
            ]}
            rows={d.newKids.map((n) => [
              n.name,
              n.joinedDays,
              n.visits,
              n.lastAgo ?? "None yet",
              n.atRisk ? "Needs a check-in" : "On track",
            ])}
          />
        }
      >
        <div className="in-kids">
          <div className="in-kids-scale" aria-hidden="true">
            <span />
            <span className="in-kids-axis">
              <i>Joined</i>
              <i>30 days</i>
              <i>60 days</i>
            </span>
            <span />
          </div>
          {kids.map((n) => {
            const fam = families.find((f) => f.id === kidInfo[n.id]?.family);
            return (
              <button
                key={n.id}
                className={`in-kid ${n.atRisk ? "is-risk" : ""}`.trim()}
                onClick={() => openKid(n.id)}
              >
                <span className="in-kid-who">
                  <Avatar child={kid(n.id)} size={40} />
                  <span>
                    <b>{n.name}</b>
                    <small>
                      Joined{" "}
                      {n.joinedDays === 0
                        ? "today"
                        : `${n.joinedDays} days ago`}
                    </small>
                  </span>
                </span>
                <span className="in-kid-track">
                  <VisitDots
                    days={n.dots}
                    span={60}
                    today={n.joinedDays}
                    mark={n.atRisk ? data.alert : data.series[0]}
                  />
                </span>
                <span className="in-kid-status">
                  {n.atRisk ? (
                    <Tag tone="warn" icon={AlertTriangle}>
                      {n.lastAgo === null
                        ? "No visit yet"
                        : `${n.lastAgo} days since last visit`}
                    </Tag>
                  ) : (
                    <Tag tone="good">
                      {n.visits
                        ? plural(n.visits, "visit", "visits")
                        : "Starting this week"}
                    </Tag>
                  )}
                  {n.atRisk && fam && (
                    <small>
                      <Phone size={13} aria-hidden="true" /> {fam.guardian}
                    </small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </ChartCard>

      <div className="in-grid">
        <ChartCard
          title="Check-ins per day"
          note="Every kid a coach put on the floor."
          legend={<Legend items={[series.class, series.open]} />}
          table={
            <TableView
              head={["Day", "Class", "Open gym", "Total"]}
              rows={d.daily.map((x) => [
                fmtDay(x.date),
                x.class,
                x.open,
                x.class + x.open,
              ])}
            />
          }
        >
          <DailyColumns data={d.daily} />
        </ChartCard>
        <ChartCard
          title="Busiest times"
          note="Average kids per session, by day and block. Use it to staff the floor."
          table={
            <TableView
              head={["Day", ...d.heat.cols]}
              rows={d.heat.rows.map((r, i) => [
                r,
                ...d.heat.cells[i].map((v) =>
                  v === null ? "Closed" : v.toFixed(1),
                ),
              ])}
            />
          }
        >
          <Heatmap
            rows={d.heat.rows}
            cols={d.heat.short}
            names={d.heat.cols}
            cells={d.heat.cells}
          />
        </ChartCard>
        <ChartCard
          title="Desk-to-floor wait"
          note="Median minutes from the front desk to a coach's check-in, per day."
          table={
            <TableView
              head={["Day", "Median wait (min)"]}
              rows={d.waitByDay.map((x) => [
                fmtDay(x.date),
                x.value === null ? "Closed" : x.value.toFixed(1),
              ])}
            />
          }
        >
          <TrendLine
            points={d.waitByDay}
            goal={GOAL_WAIT}
            goalLabel={`Goal ${GOAL_WAIT} min`}
          />
        </ChartCard>
        <ChartCard
          title="Skills unlocked by coach"
          note={`Attendance counts as on time when it's done within ${ON_TIME_MINUTES} minutes of the start.`}
          table={
            <TableView
              head={["Coach", "Skills", "Check-ins", "Bonus picks"]}
              rows={d.coaches.map((c) => [
                c.name,
                c.skills,
                c.checkins,
                c.bonuses,
              ])}
            />
          }
        >
          <BarList items={bars} highlight={d.coaches[0]?.id} unit="skills" />
          {d.topSkills.length > 0 && (
            <div className="in-top">
              <span className="eyebrow">Most unlocked</span>
              <div className="in-top-tags">
                {d.topSkills.map((s) => (
                  <Tag key={s.skillId} tone="info">
                    {s.title} · {s.count}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}
