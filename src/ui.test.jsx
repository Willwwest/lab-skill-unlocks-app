import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./main.jsx";

const skillButton = (id) =>
  screen.getByRole("button", { name: new RegExp(`${id}.*TIER`, "i") });
// Signed in as the head coach, who can view as coach, parent or kid.
const HEAD_COACH = "+16025550153";
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
async function leaveCoachCenter(user) {
  await user.click(await screen.findByRole("button", { name: /Coach Alex/ }));
  await user.click(
    screen.getByRole("menuitem", { name: "Kid and parent views" }),
  );
}
async function asKid(user) {
  await user.selectOptions(
    screen.getByRole("combobox", { name: "View as" }),
    "Athlete",
  );
}
async function coach(user) {
  await user.selectOptions(
    screen.getByRole("combobox", { name: "View as" }),
    "Coach",
  );
  await user.click(
    screen.getByRole("button", { name: "Coach desk", exact: true }),
  );
}
describe("redesigned app interactions", () => {
  beforeEach(async () => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    signInAs(HEAD_COACH);
    render(<App />);
    await leaveCoachCenter(userEvent.setup());
  });
  it("keeps athlete skill verification unavailable and supports next-goal selection", async () => {
    const user = userEvent.setup();
    await asKid(user);
    await user.click(
      screen.getByRole("button", { name: /Explore my next skills/i }),
    );
    await user.click(skillButton("S07"));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("button", {
        name: "Verify unlock",
        exact: true,
      }),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Remove from my goals" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Make this my next goal" }),
    ).toBeTruthy();
  });
  it("rejects under-target results and saves a valid coach-verified measurement", async () => {
    const user = userEvent.setup();
    await coach(user);
    await user.click(skillButton("S09"));
    await user.type(screen.getByRole("spinbutton"), "9");
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Verify unlock", exact: true }),
    );
    expect(screen.getByText("Record at least 10 dribbles.")).toBeTruthy();
    await user.clear(screen.getByRole("spinbutton"));
    await user.type(screen.getByRole("spinbutton"), "10");
    await user.click(
      screen.getByRole("button", { name: "Verify unlock", exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(skillButton("S09").textContent).toMatch(/Unlocked/);
  });
  it("creates a shirt only at tier completion and supports parent size selection", async () => {
    const user = userEvent.setup();
    await coach(user);
    for (const id of ["S07", "S09", "S10"]) {
      await user.click(skillButton(id));
      if (id === "S09") await user.type(screen.getByRole("spinbutton"), "10");
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", { name: "Verify unlock", exact: true }),
      );
    }
    await user.selectOptions(
      screen.getByRole("combobox", { name: "View as" }),
      "Parent",
    );
    await user.click(
      screen.getByRole("button", { name: "Rewards", exact: true }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Tier 1 shirt size" }),
      "Youth M",
    );
    await user.click(
      screen.getByRole("button", { name: "Reserve shirt", exact: true }),
    );
    expect(screen.getAllByText(/Reserved/).length).toBeGreaterThan(0);
  });
  it("does not count bonus badges as ranked skills and blocks unmet prerequisites", async () => {
    const user = userEvent.setup();
    await coach(user);
    await user.click(
      screen.getAllByRole("button", { name: "Verify bonus", exact: true })[0],
    );
    expect(
      screen.getByRole("button", { name: /TIER 1 Spark 7 of 10 unlocked/ }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /TIER 3 Ascent/ }));
    await user.click(skillButton("A02"));
    expect(
      screen.getByRole("button", { name: "Verify unlock", exact: true })
        .disabled,
    ).toBe(true);
  });
});

describe("Clubhouse participation flows", () => {
  beforeEach(async () => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    signInAs(HEAD_COACH);
    render(<App />);
    await leaveCoachCenter(userEvent.setup());
  });
  it("holds athlete check-ins for trainer approval, then updates their passport", async () => {
    const user = userEvent.setup();
    await asKid(user);
    await user.click(
      screen.getByRole("button", { name: "Clubhouse", exact: true }),
    );
    await user.click(
      screen.getByRole("button", { name: /Check into this class/ }),
    );
    await user.click(
      screen.getByRole("button", { name: /I tried this station/ }),
    );
    expect(
      screen.getByRole("button", { name: "Attendance awaiting trainer" })
        .disabled,
    ).toBe(true);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "View as" }),
      "Coach",
    );
    await user.click(
      screen.getByRole("button", { name: "Trainer tools", exact: true }),
    );
    expect(screen.getByText("Check-in requests · 2")).toBeTruthy();
    await user.click(
      screen.getAllByRole("button", { name: "Confirm", exact: true })[0],
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm", exact: true }),
    );
    await user.click(
      screen.getByRole("button", { name: "My passport", exact: true }),
    );
    expect(screen.getByRole("button", { name: "Checked in" }).disabled).toBe(
      true,
    );
    expect(
      screen.getByRole("button", { name: /Monkey bars & rings 1 try/ }),
    ).toBeTruthy();
  });
  it("gives the entire selected roster one class star with repeat protection", async () => {
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "View as" }),
      "Coach",
    );
    await user.click(
      screen.getByRole("button", { name: "Clubhouse", exact: true }),
    );
    await user.click(
      screen.getByRole("button", { name: "Trainer tools", exact: true }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Maya" }));
    await user.click(screen.getByRole("checkbox", { name: "Leo" }));
    await user.click(
      screen.getByRole("button", { name: "Give selected kids a class star" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Give selected kids a class star" }),
    );
    expect(
      screen.getByText("Everyone selected already has a class star."),
    ).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem("lab-skill-unlocks-v1"));
    expect(
      saved.club.events.filter(
        (e) => e.kind === "class" && e.status === "approved",
      ),
    ).toHaveLength(3);
  });
  it("generates six real QR signs with station-specific links and no athlete identity", async () => {
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "View as" }),
      "Coach",
    );
    await user.click(
      screen.getByRole("button", { name: "Clubhouse", exact: true }),
    );
    await user.click(
      screen.getByRole("button", { name: "Trainer tools", exact: true }),
    );
    await user.click(screen.getByRole("button", { name: "Generate QR signs" }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("img", { name: /check-in QR code/ }),
      ).toHaveLength(6),
    );
    const links = screen.getAllByRole("link", {
      name: /Open check-in on this device/,
    });
    expect(links).toHaveLength(6);
    expect(links[1].href).toContain("station=grip");
    expect(links.every((a) => !a.href.includes("theo"))).toBe(true);
  });
});
