import React, { useEffect, useRef } from "react";
import { Pause, Play } from "lucide-react";
import { gymClockTime, toMinutes } from "./gym-time.js";
import { demoCaption } from "./demoday.js";

/*
 * The bar across the top of the map on a ?demo screen: the gym time, play
 * and pause, the day's blocks on a timeline you can tap to jump, and one
 * line on what the zones are showing. Space pauses, the arrow keys step a
 * quarter hour.
 */
export default function DemoBar({ demo, status, now, blocks }) {
  const track = useRef(null);
  const span = demo.end - demo.start;
  const pct = (m) => `${((m - demo.start) / span) * 100}%`;
  useEffect(() => {
    const key = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        demo.toggle();
      } else if (e.key === "ArrowRight") demo.seek(demo.minute + 15);
      else if (e.key === "ArrowLeft") demo.seek(demo.minute - 15);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [demo]);
  const jump = (e) => {
    const r = track.current.getBoundingClientRect();
    demo.seek(demo.start + ((e.clientX - r.left) / r.width) * span);
  };
  return (
    <div className="tv-demo" role="region" aria-label="Demo day">
      <div className="tv-demo-row">
        <span className="tv-demo-tag">Demo day</span>
        <time>{gymClockTime(now)}</time>
        <button
          type="button"
          className="tv-demo-play"
          onClick={demo.toggle}
          aria-label={demo.playing ? "Pause the demo" : "Play the demo"}
        >
          {demo.playing ? (
            <Pause size={16} aria-hidden="true" />
          ) : (
            <Play size={16} aria-hidden="true" />
          )}
        </button>
        <div
          ref={track}
          className="tv-demo-track"
          onPointerDown={jump}
          role="slider"
          aria-label="Time of day"
          aria-valuemin={demo.start}
          aria-valuemax={demo.end}
          aria-valuenow={demo.minute}
          aria-valuetext={gymClockTime(now)}
          tabIndex={0}
        >
          {blocks.map((b) => (
            <span
              key={b.id}
              className={`tv-demo-block is-${b.kind === "class" ? "class" : "open"}`}
              style={{
                left: pct(toMinutes(b.start)),
                width: `calc(${pct(toMinutes(b.end))} - ${pct(toMinutes(b.start))})`,
              }}
              title={b.name}
            />
          ))}
          <span className="tv-demo-head" style={{ left: pct(demo.minute) }} />
        </div>
      </div>
      <p aria-live="polite">{demoCaption(status)}</p>
    </div>
  );
}
