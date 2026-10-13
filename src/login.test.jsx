import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./main.jsx";

async function textCode(user, phone) {
  await user.type(await screen.findByLabelText("Phone number"), phone);
  await user.click(screen.getByRole("button", { name: "Text me a code" }));
  return /code is (\d{6})/.exec(screen.getByRole("status").textContent)[1];
}

describe("phone sign-in", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    render(<App />);
  });
  it("signs a parent in with a texted code and shows only their family", async () => {
    const user = userEvent.setup();
    const code = await textCode(user, "6025550101");
    await user.type(screen.getByLabelText("6-digit code"), code);
    expect(await screen.findByText(/Theo’s/)).toBeTruthy();
    const view = screen.getByRole("combobox", { name: "View as" });
    expect([...view.options].map((o) => o.value)).toEqual([
      "Parent",
      "Athlete",
    ]);
    const kids = screen.getByRole("combobox", { name: "Select athlete" });
    expect([...kids.options].map((o) => o.value)).toEqual(["theo"]);
    expect(JSON.parse(localStorage.getItem("lab-session")).phone).toBe(
      "+16025550101",
    );
  });
  it("turns away numbers that aren't on file", async () => {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Phone number"), "6025550199");
    await user.click(screen.getByRole("button", { name: "Text me a code" }));
    expect(screen.getByRole("alert").textContent).toMatch(/front desk/);
  });
  it("rejects a wrong code and counts the tries", async () => {
    const user = userEvent.setup();
    const code = await textCode(user, "6025550102");
    await user.type(
      screen.getByLabelText("6-digit code"),
      code === "123456" ? "654321" : "123456",
    );
    expect(screen.getByRole("alert").textContent).toMatch(/4 tries left/);
    expect(localStorage.getItem("lab-session")).toBeNull();
  });
  it("takes a coach straight to their day on the floor, and signs out", async () => {
    const user = userEvent.setup();
    const code = await textCode(user, "6025550151");
    await user.type(screen.getByLabelText("6-digit code"), code);
    expect(await screen.findByText("Today at the gym")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Coach Sam menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(
      await screen.findByRole("button", { name: "Text me a code" }),
    ).toBeTruthy();
    expect(localStorage.getItem("lab-session")).toBeNull();
  });
});
