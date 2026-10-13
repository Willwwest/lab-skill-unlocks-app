import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, X } from "lucide-react";
import { people } from "./domain.js";
import { applyFloor, arrival, emptyFloor, photoConsent } from "./floor.js";
import { familyCode, familyOf, kidCode } from "./roster.js";
import { deletePhoto, photoBlob } from "./media.js";
import { Avatar, Photo } from "./photos.jsx";
import { clockTime } from "./coachkit.jsx";
import { date } from "./format.js";
import "./coach.css";

function QR({ text, size = 220, label }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: "svg", margin: 2, width: size })
      .then(
        (svg) =>
          live &&
          setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`),
      )
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [text, size]);
  return src ? (
    <img className="fam-qr" src={src} width={size} height={size} alt={label} />
  ) : (
    <span className="fam-qr" style={{ width: size, height: size }} />
  );
}

async function download(m, child) {
  const blob = await photoBlob(m.photoId);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lab-${child.first.toLowerCase()}-${m.at.slice(0, 10)}.jpg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Photos coaches took, for one kid or a whole family.
export function MomentsGallery({
  state,
  childIds,
  role,
  setState,
  notify,
  empty,
}) {
  const [open, setOpen] = useState(null);
  const parent = role === "Parent";
  const moments = (state.floor?.moments ?? [])
    .filter((m) => childIds.includes(m.childId) && (parent || !m.hidden))
    .slice()
    .reverse();
  const act = (action, message) => {
    try {
      setState(applyFloor(state, { ...action, actor: { role } }));
      notify(message);
      return true;
    } catch (e) {
      notify(e.message, true);
      return false;
    }
  };
  if (!moments.length) return empty ?? null;
  const current = moments.find((m) => m.id === open);
  return (
    <>
      <div className="moments">
        {moments.map((m) => {
          const child = people.find((p) => p.id === m.childId);
          return (
            <button
              key={m.id}
              className={`moment ${m.hidden ? "is-hidden" : ""}`}
              onClick={() => setOpen(m.id)}
            >
              <Photo id={m.photoId} alt={m.caption} />
              <span>
                <b>{m.caption || child.first}</b>
                <small>
                  {date(m.at)} · {m.coach}
                  {m.hidden ? " · hidden" : ""}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      {current && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={current.caption}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}
        >
          <figure>
            <Photo id={current.photoId} size="full" alt={current.caption} />
            <figcaption>
              <b>{current.caption}</b>
              <small>
                {date(current.at)} {clockTime(current.at)} · Taken by{" "}
                {current.coach}
              </small>
            </figcaption>
            <div className="lightbox-actions">
              <button
                className="button mint compact"
                onClick={() =>
                  download(
                    current,
                    people.find((p) => p.id === current.childId),
                  )
                }
              >
                <Download size={16} /> Save
              </button>
              {parent && (
                <>
                  <button
                    className="button outline-light compact"
                    onClick={() =>
                      act(
                        {
                          type: current.hidden ? "showMoment" : "hideMoment",
                          id: current.id,
                        },
                        current.hidden
                          ? "Photo shown again."
                          : "Photo hidden from your child’s view.",
                      )
                    }
                  >
                    {current.hidden ? "Show to my child" : "Hide from my child"}
                  </button>
                  <button
                    className="button outline-light compact"
                    onClick={() => {
                      if (
                        act(
                          { type: "deleteMoment", id: current.id },
                          "Photo deleted.",
                        )
                      ) {
                        deletePhoto(current.photoId).catch(() => {});
                        setOpen(null);
                      }
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </figure>
          <button
            className="lightbox-close"
            aria-label="Close photo"
            onClick={() => setOpen(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}
    </>
  );
}

// Parent page: the family pass for the front desk, photo settings and moments.
export default function Family({ state: rawState, childId, setState, notify }) {
  const state = { ...rawState, floor: rawState.floor ?? emptyFloor() };
  const family = familyOf(childId);
  if (!family) return null;
  const kids = family.kids.map((id) => people.find((p) => p.id === id));
  return (
    <div className="fam">
      <section className="card fam-pass">
        <div>
          <span className="eyebrow">Family pass</span>
          <h2>{family.name}</h2>
          <p>
            Hold this up to the front desk camera when you arrive. It checks in{" "}
            {kids.map((k) => k.first).join(" and ")}.
          </p>
          <p className="fam-pin">
            Family PIN <b>{family.pin}</b>
          </p>
          <ul className="fam-status">
            {kids.map((k) => {
              const here = arrival(state, k.id);
              return (
                <li key={k.id}>
                  <Avatar
                    child={k}
                    photoId={state.floor.avatars[k.id]}
                    size={32}
                  />
                  {k.first} ·{" "}
                  {here
                    ? `checked in at ${clockTime(here.in)}`
                    : "not checked in"}
                </li>
              );
            })}
          </ul>
        </div>
        <QR
          text={familyCode(family.id)}
          label={`${family.name} pass QR code`}
        />
      </section>
      <section className="card fam-section">
        <h2>Kid passes</h2>
        <p className="subtle">
          Coaches scan these at a station to pull up the right kid. Clip one to
          a bag or water bottle.
        </p>
        <div className="fam-kidpasses">
          {kids.map((k) => (
            <figure key={k.id}>
              <QR
                text={kidCode(k.id)}
                size={132}
                label={`${k.first}’s pass QR code`}
              />
              <figcaption>{k.first}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="card fam-section">
        <h2>Photos</h2>
        <p className="subtle">
          Coaches can photograph a feat or a celebration and share it here. Only
          your family and LAB staff see these.
        </p>
        {kids.map((k) => (
          <label className="fam-toggle" key={k.id}>
            <input
              type="checkbox"
              checked={photoConsent(state, k.id)}
              onChange={(e) => {
                try {
                  setState(
                    applyFloor(state, {
                      type: "consent",
                      childId: k.id,
                      value: e.target.checked,
                      actor: { role: "Parent" },
                    }),
                  );
                  notify(
                    e.target.checked
                      ? `Coaches can photograph ${k.first}.`
                      : `No new photos of ${k.first}.`,
                  );
                } catch (err) {
                  notify(err.message, true);
                }
              }}
            />
            <span>Coaches may take photos of {k.first}</span>
          </label>
        ))}
      </section>
      <section className="fam-section">
        <h2 className="fam-heading">Moments</h2>
        <MomentsGallery
          state={state}
          childIds={family.kids}
          role="Parent"
          setState={setState}
          notify={notify}
          empty={
            <p className="subtle">
              When a coach takes a photo, it shows up here.
            </p>
          }
        />
      </section>
    </div>
  );
}
