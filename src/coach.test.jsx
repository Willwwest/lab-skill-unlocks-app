import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./main.jsx";
import { families } from "./roster.js";

const saved = () => JSON.parse(localStorage.getItem("lab-skill-unlocks-v1"));

function signInAs(phone) {
  localStorage.setItem(
    "lab-session",
    JSON.stringify({
      phone,
      since: Date.now(),
      expires: Date.now() + 86400000,
    }),
  );
}
const SAM = "+16025550151";
// On a coach's own device the phone sign-in is enough; no PIN step.
// Coaches land on the coach floor; the older tabbed tools sit under
// "More tools".
async function openMoreTools(user) {
  await user.click(
    await screen.findByRole("button", { name: "Coach Sam menu" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "More tools" }));
}
async function signIn(user) {
  await openMoreTools(user);
  await screen.findByRole("navigation", { name: "Coach sections" });
}

describe("front desk kiosk", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?kiosk");
    render(<App />);
  });
  it("checks a family in by PIN and requests class attendance", async () => {
    const user = userEvent.setup();
    const parker = families.find((f) => f.id === "parker");
    await user.type(
      await screen.findByRole("textbox", { name: "Pass code or family PIN" }),
      parker.pin,
    );
    await user.click(screen.getByRole("button", { name: "Enter" }));
    expect(await screen.findByText(/Who’s here today/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Check in/ }));
    expect(await screen.findByText("You’re checked in.")).toBeTruthy();
    const s = saved();
    expect(s.floor.presence.map((p) => p.childId)).toEqual(["theo"]);
    expect(s.floor.presence[0].by).toBe("Front desk");
  });
  it("rejects an unknown code", async () => {
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "Pass code or family PIN" }),
      "LABFAM:nobody",
    );
    await user.click(screen.getByRole("button", { name: "Enter" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(saved()?.floor?.presence ?? []).toHaveLength(0);
  });
});

describe("coach center", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?coach");
    signInAs(SAM);
  });
  it("on a shared iPad, needs the right PIN to switch coaches", async () => {
    localStorage.setItem("lab-coach-device", JSON.stringify({ shared: true }));
    render(<App />);
    const user = userEvent.setup();
    await openMoreTools(user);
    await user.click(await screen.findByRole("button", { name: /Coach Sam/ }));
    for (const d of "1234")
      await user.click(screen.getByRole("button", { name: d, exact: true }));
    expect(screen.getByText("That PIN doesn’t match.")).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "Coach sections" }),
    ).toBeNull();
  });
  it("records a station try in one tap, signed by the coach, with undo", async () => {
    render(<App />);
    const user = userEvent.setup();
    await signIn(user);
    await user.click(screen.getByRole("button", { name: /Station/ }));
    await user.click(screen.getByRole("button", { name: "Everyone" }));
    await user.click(screen.getAllByRole("button", { name: "Tried +2" })[0]);
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/tried .*\+2 stars/);
    const visits = saved().club.events.filter((e) => e.kind === "visit");
    expect(visits).toHaveLength(1);
    expect(visits[0].status).toBe("approved");
    expect(visits[0].coach).toBe("Coach Sam");
    // The coach saw the kid, so the kid is now on the floor.
    expect(saved().floor.presence).toHaveLength(1);
    await user.click(within(status).getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(
        saved().club.events.filter((e) => e.kind === "visit"),
      ).toHaveLength(0),
    );
  });
  it("finds a kid, gives a shoutout and verifies a measured skill", async () => {
    render(<App />);
    const user = userEvent.setup();
    await signIn(user);
    await user.click(screen.getByRole("button", { name: /Kids/ }));
    await user.type(
      screen.getByRole("textbox", { name: "Search kids" }),
      "parker",
    );
    await user.click(screen.getByRole("button", { name: /Theo Parker/ }));
    const panel = await screen.findByLabelText("Theo Parker profile");
    await user.click(
      within(panel).getByRole("button", { name: /Kept trying/ }),
    );
    expect(
      saved().club.events.some(
        (e) => e.kind === "praise" && e.childId === "theo",
      ),
    ).toBe(true);
    await user.click(within(panel).getByRole("button", { name: "All skills" }));
    const sheet = await screen.findByRole("dialog", { name: "Assess Theo" });
    await user.click(
      within(sheet).getByRole("button", { name: /Ball Control/ }),
    );
    await user.type(within(sheet).getByRole("spinbutton"), "9");
    await user.click(within(sheet).getByRole("checkbox"));
    await user.click(
      within(sheet).getByRole("button", { name: "Verify unlock" }),
    );
    expect(within(sheet).getByRole("alert").textContent).toMatch(/at least 10/);
    await user.click(within(sheet).getByRole("button", { name: "One more" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Verify unlock" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Unlocked" }),
    ).toBeTruthy();
    const award = saved().awards.find(
      (a) => a.childId === "theo" && a.skillId === "S09",
    );
    expect(award.value).toBe(10);
    expect(award.coach).toBe("Coach Sam");
  });
  it("keeps head-coach tools from other coaches", async () => {
    render(<App />);
    const user = userEvent.setup();
    await signIn(user);
    expect(screen.queryByRole("button", { name: /Head coach/ })).toBeNull();
  });
});
