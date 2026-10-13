import React, { useMemo } from "react";
import { dayKey } from "./club.js";
import { calendarWeekdayNarrow } from "./gym-time.js";
import { coachWeek } from "./insights.js";
import "./insights.css";

// The seven bars on Today are simple markup; only the manager's Insights
// screen needs to load the charting library.
export default function YourWeek({ state, me, now }) {
  const today = dayKey(now);
  const week = useMemo(
    () => coachWeek(state, me.name, now),
    [state, me.name, today],
  );
  const max = Math.max(1, ...week.unlocks);
  const ordinal = (n) =>
    `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

  return (
    <section className="card cf-bonus in-week">
      <span className="eyebrow">Your last 7 days</span>
      <div className="in-week-top">
        <div>
          <strong className="in-week-num">{week.total}</strong>
          <p>skills unlocked · {week.checkins} kids checked in</p>
        </div>
        {week.total > 0 && (
          <span className="in-rank">{ordinal(week.rank)} on the team</span>
        )}
      </div>
      <div className="in-week-chart">
        <div
          className="in-week-bars"
          role="img"
          aria-label={`Skills unlocked per day: ${week.unlocks.join(", ")}`}
        >
          {week.dates.map((date, index) => (
            <span key={date} title={`${date}: ${week.unlocks[index]} skills`}>
              <i
                style={{
                  height: `${Math.max(3, (week.unlocks[index] / max) * 64)}px`,
                  opacity: index === 6 ? 1 : 0.55,
                }}
                aria-hidden="true"
              />
              <small>{calendarWeekdayNarrow(date)}</small>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
