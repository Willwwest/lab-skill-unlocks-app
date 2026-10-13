// Browser check for Plans & crew and the design system style guide.
// Needs the dev server (npm run dev). Usage:
//   node scripts/plans-e2e.mjs [output-folder]
import { launch } from "./review-kit.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5173/";
const kit = await launch({ out: process.argv[2] ?? "e2e-out/plans" });
const ALEX = "+16025550153";
const SAM = "+16025550151";

async function signIn(page, phone) {
  await page.goto(BASE);
  await page.evaluate(async (phone) => {
    const d = await import("/src/domain.js");
    const c = await import("/src/club.js");
    const f = await import("/src/floor.js");
    const g = await import("/src/gym.js");
    const s = { ...d.seed(), club: c.emptyClub(), floor: f.emptyFloor(), gym: g.seedGym(new Date(), { history: true }) };
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(s));
    localStorage.setItem("lab-session", JSON.stringify({ phone, since: Date.now(), expires: Date.now() + 864e5 }));
  }, phone);
  await page.goto(BASE + "?coach");
}

const SIZES = ["desktop", "laptop", "landscape", "tablet", "phone", "small"];
for (const size of SIZES) {
  const { page, h } = await kit.page(size, { label: "manager", reducedMotion: "reduce" });
  await signIn(page, ALEX);
  await h.step("the hero keeps one height across manager tabs", async () => {
    await page.getByRole("button", { name: "Insights" }).click();
    const heights = {};
    for (const name of ["Insights", "Coaches", "Front desk", "Members", "Plans & crew"]) {
      await page.getByRole("tab", { name }).click();
      await page.waitForTimeout(150);
      heights[name] = Math.round((await page.locator(".cf-hero").boundingBox()).height);
    }
    if (new Set(Object.values(heights)).size > 1) throw Error(JSON.stringify(heights));
  });
  await h.step("opens Plans & crew", async () => {
    await page.getByRole("button", { name: "Insights" }).click();
    await page.getByRole("tab", { name: "Plans & crew" }).click();
    await page.getByRole("heading", { name: "Homeschool ninja" }).waitFor();
  });
  await h.overflow("plans", [".pl-rail"]);
  await h.shot("plans", { full: true });
  await h.step("edits focus and picks a skill", async () => {
    await page.getByRole("textbox", { name: "What to work on at station 1" }).fill("Dead hangs only this week");
    const first = page.locator(".pl-station").first();
    await first.getByRole("button", { name: /Choose skills/ }).click();
    await first.locator(".ds-chip").first().click();
  });
  await h.step("changes the rotation length", async () => {
    await page.getByRole("radio", { name: "10 min" }).click();
    await page.getByText("4 × 10 = 40 of 60 min").waitFor();
  });
  await h.step("the save bar appears", async () => {
    await page.getByRole("region", { name: "Unsaved changes" }).waitFor();
  });
  await h.shot("plans-editing");
  await h.step("adds a coach to open gym on another block", async () => {
    await page.locator(".pl-block", { hasText: "Open gym rotation" }).click();
    await page.getByRole("combobox", { name: "Add a coach" }).selectOption("alex");
    await page.locator(".pl-coach", { hasText: "Alex" }).waitFor();
  });
  await h.step("one save writes both blocks", async () => {
    await page.getByText("2 blocks changed").waitFor();
    await page.getByRole("button", { name: "Save all" }).click();
    await page.getByRole("region", { name: "Unsaved changes" }).waitFor({ state: "detached" });
  });
  await h.expectStored("both blocks", "lab-skill-unlocks-v1", (s) => s.gym.plans[4]?.minutes === 10 && s.gym.crew[2]?.some((c) => c.staffId === "alex"));
  await h.overflow("plans after save", [".pl-rail"]);
  h.errors("manager");
  await page.context().close();
}

for (const size of ["desktop", "landscape", "phone"]) {
  const { page, h } = await kit.page(size, { label: "coach" });
  await signIn(page, SAM);
  await h.step("a coach sees other classes as view only", async () => {
    await page.getByRole("button", { name: "Plans" }).click();
    await page.locator(".pl-block", { hasText: "Ninja foundations" }).click();
    await page.getByText("View only").waitFor();
  });
  await h.shot("plans-view-only", { full: true });
  h.errors("coach");
  await page.context().close();
}

for (const size of ["desktop", "small"]) {
  const { page, h } = await kit.page(size, { label: "style guide" });
  await page.goto(BASE + "?ds");
  await h.step("renders the style guide", async () => {
    await page.getByRole("heading", { name: "One set of parts for every screen." }).waitFor();
    await page.locator(".ch-e svg").first().waitFor();
  });
  await h.overflow("style guide");
  await h.shot("style-guide", { full: true });
  h.errors("style guide");
  await page.context().close();
}

await kit.close();
