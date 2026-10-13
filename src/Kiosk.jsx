import React, { useEffect, useState } from "react";
import { people, tiers } from "./domain.js";
import { clock, clubStats, sessions } from "./club.js";
import {
  applyFloor,
  arrival,
  birthdayIn,
  classToday,
  emptyFloor,
  shirtsToHandOut,
} from "./floor.js";
import { families, parsePass } from "./roster.js";
import { Scanner } from "./camera.jsx";
import { Avatar } from "./photos.jsx";
import { clockTime } from "./coachkit.jsx";
import { currency } from "./gym.js";
import "./coach.css";

const IDLE_AFTER = 9000;

/*
 * Front desk check-in. Parents hold up their family pass (or type the
 * family PIN); the kiosk checks the kids into the building and requests
 * class attendance, which the class coach confirms.
 */
export default function Kiosk({ state: rawState, setState }) {
  const state = { ...rawState, floor: rawState.floor ?? emptyFloor() };
  const [family, setFamily] = useState(null);
  const [picked, setPicked] = useState([]);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [facing, setFacing] = useState("user");
  const reset = () => {
    setFamily(null);
    setDone(null);
    setPicked([]);
    setError("");
  };
  // Return to the welcome screen when a family walks away.
  useEffect(() => {
    if (!family && !done) return;
    let id = setTimeout(reset, done ? IDLE_AFTER : IDLE_AFTER * 3);
    const bump = () => {
      clearTimeout(id);
      id = setTimeout(reset, done ? IDLE_AFTER : IDLE_AFTER * 3);
    };
    window.addEventListener("pointerdown", bump);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointerdown", bump);
    };
  }, [family, done]);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(id);
  }, [error]);
  const onCode = (code) => {
    const hit = parsePass(code);
    const fam = hit?.familyId
      ? families.find((f) => f.id === hit.familyId)
      : hit?.childId
        ? families.find((f) => f.kids.includes(hit.childId))
        : null;
    if (!fam) {
      setError(
        "We couldn’t read that pass. Try again or type your family PIN.",
      );
      return;
    }
    setFamily(fam);
    setDone(null);
    // Preselect everyone who isn't already here (or just the scanned kid).
    setPicked(
      hit.childId
        ? [hit.childId]
        : fam.kids.filter((id) => !arrival(state, id)),
    );
  };
  const kids = family?.kids.map((id) => people.find((p) => p.id === id)) ?? [];
  const checkIn = () => {
    try {
      const next = applyFloor(state, {
        type: "checkIn",
        familyId: family.id,
        childIds: picked,
        by: "Front desk",
      });
      setState(next);
      setDone({ kind: "in", ids: picked, state: next });
      navigator.vibrate?.(30);
    } catch (e) {
      setError(e.message);
    }
  };
  const checkOut = (ids) => {
    const next = applyFloor(state, { type: "checkOut", childIds: ids });
    setState(next);
    setDone({ kind: "out", ids, state: next });
  };
  return (
    <div className="kiosk">
      <header className="kiosk-bar">
        <img src={`${import.meta.env.BASE_URL}lab-white.svg`} alt="The LAB" />
        <span>Front desk check-in</span>
        <time>{clockTime(new Date())}</time>
      </header>
      {done ? (
        <section className="kiosk-done" onClick={reset}>
          <h1>
            {done.kind === "in" ? "You’re checked in." : "See you next time."}
          </h1>
          <div className="kiosk-kids">
            {done.ids.map((id) => {
              const k = people.find((p) => p.id === id);
              const cls = classToday(id);
              const shirts = shirtsToHandOut(done.state, id);
              const bday = birthdayIn(id);
              return (
                <article key={id} className="kiosk-kid is-on">
                  <Avatar
                    child={k}
                    photoId={state.floor.avatars[id]}
                    size={88}
                  />
                  <b>{k.first}</b>
                  {done.kind === "in" && (
                    <>
                      <small>
                        {cls
                          ? `${cls.name} at ${clock(cls.start)}`
                          : "Open gym"}
                      </small>
                      <small>
                        {clubStats(done.state, id).total}{" "}
                        {currency(people.find((p) => p.id === id)).many} so far
                      </small>
                      {shirts.map((r) => (
                        <em key={r.id}>
                          {tiers[r.tier - 1].name} tee ready at the desk
                        </em>
                      ))}
                      {bday === 0 && <em>Happy birthday!</em>}
                    </>
                  )}
                </article>
              );
            })}
          </div>
          <p className="kiosk-sub">Tap anywhere to finish.</p>
        </section>
      ) : family ? (
        <section className="kiosk-family">
          <h1>Hi, {family.guardian.split(" ")[0]}. Who’s here today?</h1>
          <div className="kiosk-kids">
            {kids.map((k) => {
              const here = arrival(state, k.id);
              const cls = classToday(k.id);
              const on = picked.includes(k.id);
              return (
                <button
                  key={k.id}
                  className={`kiosk-kid ${on ? "is-on" : ""} ${here ? "is-here" : ""}`}
                  aria-pressed={on}
                  disabled={!!here}
                  onClick={() =>
                    setPicked(
                      on ? picked.filter((x) => x !== k.id) : [...picked, k.id],
                    )
                  }
                >
                  <Avatar
                    child={k}
                    photoId={state.floor.avatars[k.id]}
                    size={88}
                  />
                  <b>{k.first}</b>
                  <small>
                    {here
                      ? `Checked in at ${clockTime(here.in)}`
                      : cls
                        ? `${cls.name} · ${clock(cls.start)}`
                        : "Open gym"}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="kiosk-actions">
            <button
              className="button cyan kiosk-go"
              disabled={!picked.length}
              onClick={checkIn}
            >
              Check in{" "}
              {picked.length
                ? picked.length === 1
                  ? people.find((p) => p.id === picked[0]).first
                  : `${picked.length} kids`
                : ""}
            </button>
            {kids.some((k) => arrival(state, k.id)) && (
              <button
                className="button outline-light"
                onClick={() =>
                  checkOut(
                    kids.filter((k) => arrival(state, k.id)).map((k) => k.id),
                  )
                }
              >
                Check out{" "}
                {kids
                  .filter((k) => arrival(state, k.id))
                  .map((k) => k.first)
                  .join(" & ")}
              </button>
            )}
            <button className="button outline-light" onClick={reset}>
              Not us
            </button>
          </div>
        </section>
      ) : (
        <section className="kiosk-idle">
          <div>
            <h1>
              Welcome to <em>The LAB.</em>
            </h1>
            <p>
              Hold your family pass up to the camera, or type your family PIN.
            </p>
            <ul className="kiosk-today">
              {sessions()
                .slice()
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((s) => (
                  <li key={s.id}>
                    <b>{clock(s.start)}</b> {s.name}
                  </li>
                ))}
            </ul>
          </div>
          <div className="kiosk-scan">
            <Scanner
              key={facing}
              onCode={onCode}
              facing={facing}
              hint="Family pass QR"
            />
            <button
              className="text-button light"
              onClick={() =>
                setFacing(facing === "user" ? "environment" : "user")
              }
            >
              Switch camera
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="kiosk-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
