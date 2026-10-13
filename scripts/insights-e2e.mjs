// Browser check for the insights dashboard and the coach's Today additions.
// Needs the dev server (npm run dev). Usage:
//   node scripts/insights-e2e.mjs [output-folder]
import { launch } from "./review-kit.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5173/";
const kit = await launch({ out: process.argv[2] ?? "e2e-out/insights" });
const ALEX = "+16025550153";
const PRIYA = "+16025550152";

// A world with eight weeks of demo history plus a few arrivals today.
async function world(page, phone, view) {
  await page.goto(BASE);
  await page.evaluate(
    async ({ phone, view }) => {
      const d = await import("/src/domain.js");
      const c = await import("/src/club.js");
      const f = await import("/src/floor.js");
      const g = await import("/src/gym.js");
      const now = new Date();
      const ago = (m) => new Date(now.getTime() - m * 60000);
      let s = { ...d.seed(), club: c.emptyClub(), floor: f.emptyFloor(), gym: g.seedGym(now, { history: true }) };
      ["ava", "mateo", "zoe", "isla", "hana", "nora", "luca"].forEach((id, i) => {
        s = f.applyFloor(s, { type: "checkIn", childIds: [id], by: "Front desk" }, ago(20 - i * 2));
      });
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(s));
      localStorage.setItem("lab-session", JSON.stringify({ phone, since: Date.now(), expires: Date.now() + 864e5 }));
      if (view) {
        const today = c.sessions(now);
        sessionStorage.setItem("lab-coach-app", JSON.stringify({ view: view === "open" ? { id: "open", session: today[2].id } : { id: view } }));
      }
    },
    { phone, view },
  );
  await page.goto(BASE + "?coach");
}

for (const size of ["desktop", "laptop", "landscape", "tablet", "phone", "small"]) {
  const { page, h } = await kit.page(size, { label: "manager" });
  await world(page, ALEX);
  await h.step("opens Insights from the nav", async () => {
    await page.getByRole("button", { name: "Insights" }).click();
    await page.getByRole("heading", { name: "New members, first 60 days" }).waitFor();
  });
  await h.step("every chart draws an SVG", async () => {
    await page.waitForTimeout(800);
    const n = await page.locator(".ch-e svg").count();
    if (n < 10) throw Error(`only ${n} charts drew`);
  });
  await h.step("flags new kids who stopped coming", async () => {
    await page.getByText(/need a check-in/).waitFor();
    const risky = await page.locator(".in-kid.is-risk").count();
    if (risky < 3) throw Error(`${risky} flagged`);
  });
  await h.step("a column shows its numbers on hover", async () => {
    await page.locator(".in-grid .ch-e").first().scrollIntoViewIfNeeded();
    const box = await page.locator(".in-grid .ch-e").first().boundingBox();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6);
    await page.getByText(/open gym/).first().waitFor();
  });
  await h.step("the range filter changes the numbers", async () => {
    const before = await page.locator(".ds-stat .stat-value").first().textContent();
    await page.getByRole("radio", { name: "28 days" }).click();
    await page.waitForTimeout(300);
    const after = await page.locator(".ds-stat .stat-value").first().textContent();
    if (before === after) throw Error(`still ${after}`);
  });
  await h.step("a chart opens as a table", async () => {
    await page.getByText("Show as a table").nth(1).click();
    await page.locator(".ch-table[open] table").first().waitFor();
  });
  await h.overflow("insights", [".ch-e", ".ch-table"]);
  await h.shot("insights", { full: true });
  await h.step("an at-risk kid opens with their visits and family", async () => {
    await page.locator(".in-kid.is-risk").first().click();
    await page.getByText("Last 6 weeks").waitFor();
  });
  await h.shot("kid-sheet");
  h.errors("manager");
  await page.context().close();
}

for (const size of ["desktop", "phone", "small"]) {
  const { page, h } = await kit.page(size, { label: "coach" });
  await world(page, PRIYA);
  await h.step("Today shows the coach's week without loading ECharts", async () => {
    await page.getByText("Your last 7 days").waitFor();
    const bars = await page.locator(".in-week-bars i").count();
    if (bars !== 7) throw Error(`expected 7 bars, got ${bars}`);
    const loadedCharts = await page.evaluate(() =>
      performance.getEntriesByType("resource").some((r) => /\/echarts(?:-|\/)/.test(r.name)),
    );
    if (loadedCharts) throw Error("Today loaded ECharts");
  });
  await h.step("Today lists kids to watch", async () => {
    await page.getByText("Kids to watch today").waitFor();
    await page.locator(".in-watch-row").first().waitFor();
  });
  await h.overflow("today");
  await h.shot("today", { full: true });
  await world(page, PRIYA, "open");
  await h.step("checks in the desk queue", async () => {
    await page.getByRole("button", { name: /Check in all/ }).click();
    await page.locator(".cf-row").first().waitFor();
  });
  await h.step("rows show shirt progress", async () => {
    await page.locator(".cf-row .cf-shirt").first().waitFor();
  });
  await h.step("Got it celebrates, then clears itself", async () => {
    await page.locator(".cf-row .cf-got").first().click();
    await page.locator(".cf-party").waitFor();
    await h.shot("celebration");
    await page.locator(".cf-party").waitFor({ state: "detached", timeout: 4000 });
  });
  await h.expectStored("the unlock", "lab-skill-unlocks-v1", (s) => s.awards.some((a) => a.coach === "Coach Priya"));
  await h.overflow("open gym");
  await h.shot("open-gym", { full: true });
  h.errors("coach");
  await page.context().close();
}

await kit.close();
