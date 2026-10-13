import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./main.jsx";
import { seed } from "./domain.js";
import { emptyClub, sessions } from "./club.js";
import { emptyFloor } from "./floor.js";
import { applyGym, runOf, seedGym, stationOfCoach } from "./gym.js";

const saved = () => JSON.parse(localStorage.getItem("lab-skill-unlocks-v1"));
const JORDAN = "+16025550150";
const SAM = "+16025550151";
const PRIYA = "+16025550152";
const ALEX = "+16025550153";
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
const homeschool = () => sessions(new Date())[4];

beforeEach(() => {
  window.history.replaceState({}, "", "/?coach");
});

describe("coach floor", () => {
  it("lands a coach on their day with who works each block", async () => {
    signInAs(PRIYA);
    render(<App />);
    expect(await screen.findByText("Today at the gym")).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Coach navigation" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/Head: Coach Jordan/).length).toBeGreaterThan(0);
  });

  it("head coach: attendance, a level, groups, start, end and bonus picks", async () => {
    signInAs(JORDAN);
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      (await screen.findAllByRole("button", { name: /Homeschool ninja/ }))[0],
    );
    for (const name of [
      "June Alvarez",
      "Piper Lee",
      "Nina Fischer",
      "Tess Reyes",
    ])
      await user.click(screen.getByRole("button", { name }));
    // Piper has no level yet; one tap sets it.
    await user.click(screen.getByRole("button", { name: "Piper: Beginner" }));
    expect(saved().gym.levels.piper.level).toBe("beginner");
    await user.click(
      screen.getByRole("button", { name: /Attendance complete/ }),
    );
    await user.click(
      within(screen.getByRole("group", { name: "Number of groups" })).getByRole(
        "button",
        { name: "2" },
      ),
    );
    const run = runOf(saved(), homeschool().id);
    expect(run.groups).toHaveLength(2);
    // Age first: the 5-year-olds share a group, the 12-year-olds the other.
    expect(run.groups.map((g) => g.slice().sort())).toEqual(
      expect.arrayContaining([
        ["june", "piper"],
        ["nina", "tess"],
      ]),
    );
    await user.click(screen.getByRole("button", { name: /Start class/ }));
    expect(await screen.findByText("Rotation 1 of 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /End class/ }));
    expect(await screen.findByText("Bonus picks")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /June/ }));
    await user.click(screen.getByRole("button", { name: "Give bonus to 1" }));
    const bonus = saved().club.events.filter((e) => e.kind === "bonus");
    expect(bonus).toHaveLength(1);
    expect(bonus[0]).toMatchObject({
      childId: "june",
      coach: "Coach Jordan",
      status: "approved",
    });
  });

  it("open gym: a parent's phone finds both kids, flags them, and a skill is one tap", async () => {
    signInAs(PRIYA);
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      screen.getAllByRole("button", { name: /Open gym rotation/ })[0],
    );
    await user.type(
      screen.getByRole("textbox", { name: "Find kids to check in" }),
      "555-0127",
    );
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Check in 2" }));
    const rows = saved().gym.checkins;
    expect(rows.map((r) => r.childId).sort()).toEqual(["dani", "gabe"]);
    expect(rows.every((r) => r.pastDue && r.deskAt === null)).toBe(true);
    expect(screen.getAllByText("Past due").length).toBeGreaterThan(0);
    const got = screen.getAllByRole("button", { name: /^Dani got / })[0];
    await user.click(got);
    expect(
      saved().awards.some(
        (a) =>
          a.childId === "dani" &&
          a.coach === "Coach Priya" &&
          a.note === "Checked off on the floor",
      ),
    ).toBe(true);
  });

  it("station coach sees the group at their station once the class starts", async () => {
    const block = homeschool();
    const jordan = {
      role: "Coach",
      name: "Coach Jordan",
      staffId: "jordan",
      head: false,
    };
    let s = {
      ...seed(),
      club: emptyClub(),
      floor: emptyFloor(),
      gym: seedGym(),
    };
    s = applyGym(s, {
      type: "checkIn",
      session: block.id,
      childIds: ["june", "piper", "nina", "tess", "max", "willa"],
      actor: jordan,
    });
    s = applyGym(s, {
      type: "attendanceDone",
      session: block.id,
      count: 3,
      actor: jordan,
    });
    s = applyGym(s, { type: "startClass", session: block.id, actor: jordan });
    localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(s));
    signInAs(SAM);
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      (await screen.findAllByRole("button", { name: /Homeschool ninja/ }))[0],
    );
    const mine = stationOfCoach(runOf(s, block.id), "sam");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: new RegExp(mine === "grip" ? "Monkey bars" : "."),
      }),
    ).toBeTruthy();
    expect(screen.getByText(/^Group 1 · 2 kids$/)).toBeTruthy();
    expect(screen.getByText("Rotation 1 of 3")).toBeTruthy();
  });

  it("manager: a Spark export updates membership", async () => {
    signInAs(ALEX);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Insights" }));
    await user.click(screen.getByRole("tab", { name: "Members" }));
    await user.type(
      screen.getByRole("textbox"),
      "Theo,Parker,active,yes,2026-01-05",
    );
    await user.click(screen.getByRole("button", { name: "Update members" }));
    expect(saved().gym.members.theo.pastDue).toBe(true);
    expect(saved().gym.spark.matched).toBe(1);
  });
});

describe("insights", () => {
  it("shows the manager which new kids need a call", async () => {
    const s = {
      ...seed(),
      club: emptyClub(),
      floor: emptyFloor(),
      gym: seedGym(new Date(), { history: true }),
    };
    localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(s));
    signInAs(ALEX);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Insights" }));
    expect(await screen.findByText("New members, first 60 days")).toBeTruthy();
    expect(screen.getByText(/need a check-in/)).toBeTruthy();
    expect(
      screen.getAllByText("Show as a table").length,
    ).toBeGreaterThanOrEqual(5);
    await user.click(screen.getByRole("radio", { name: "28 days" }));
    expect(
      screen
        .getByRole("radio", { name: "28 days" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});

describe("plans and crew", () => {
  it("edits a block as a draft and saves crew and plan together", async () => {
    signInAs(ALEX);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Insights" }));
    await user.click(screen.getByRole("tab", { name: "Plans & crew" }));
    expect(
      screen
        .getByRole("button", { name: /Homeschool ninja/ })
        .getAttribute("aria-current"),
    ).toBe("true");
    const focus = screen.getByRole("textbox", {
      name: "What to work on at station 1",
    });
    await user.clear(focus);
    await user.type(focus, "Dead hangs only");
    const first = screen.getAllByRole("article")[0];
    await user.click(
      within(first).getByRole("button", { name: /Choose skills/ }),
    );
    await user.click(
      within(first).getAllByRole("button", { pressed: false })[0],
    );
    // Naming a new head moves the old one to a station.
    const roles = screen.getAllByRole("radiogroup", { name: /role$/ });
    const station = roles.find(
      (g) =>
        within(g)
          .getByRole("radio", { name: "Station" })
          .getAttribute("aria-checked") === "true",
    );
    const name = station.getAttribute("aria-label").replace("'s role", "");
    await user.click(within(station).getByRole("radio", { name: "Head" }));
    expect(
      screen.getByRole("button", { name: /Homeschool ninja/ }).textContent,
    ).toMatch(/Unsaved/);
    await user.click(
      within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole(
        "button",
        { name: "Save" },
      ),
    );
    const g = saved().gym;
    expect(g.plans[4].stations[0].focus).toBe("Dead hangs only");
    expect(g.plans[4].stations[0].skills).toHaveLength(1);
    expect(
      g.crew[4].filter((c) => c.role === "head").map((c) => c.staffId),
    ).toEqual([name.toLowerCase()]);
    expect(
      screen.queryByRole("region", { name: "Unsaved changes" }),
    ).toBeNull();
  });

  it("shows a coach other classes as view only", async () => {
    signInAs(SAM);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Plans" }));
    await user.click(screen.getByRole("button", { name: /Ninja foundations/ }));
    expect(screen.getByText("View only")).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: /What to work on/ }),
    ).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Add a coach" })).toBeNull();
  });
});
