// Browser check for the gym floor TV board and the floor plan editor.
// Needs the dev server (npm run dev). Usage:
//   node scripts/floor-e2e.mjs [output-folder]
import { launch, sizes } from "./review-kit.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5173/";
sizes.tv = { viewport: { width: 1920, height: 1080 } };
const kit = await launch({ out: process.argv[2] ?? "e2e-out/floor" });
const CHARLIE = "+16025550157";
const SAM = "+16025550151";

async function seed(page, phone) {
  await page.goto(BASE);
  await page.evaluate(async (phone) => {
    const d = await import("/src/domain.js");
    const c = await import("/src/club.js");
    const f = await import("/src/floor.js");
    const g = await import("/src/gym.js");
    const s = { ...d.seed(), club: c.emptyClub(), floor: f.emptyFloor(), gym: g.seedGym(new Date()) };
    localStorage.clear();
    localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(s));
    if (phone)
      localStorage.setItem("lab-session", JSON.stringify({ phone, since: Date.now(), expires: Date.now() + 864e5 }));
  }, phone);
}
const board = async (page, at) => {
  await page.goto(`${BASE}?tv&at=${at}`);
  await page.locator(".ftv-label:not(.is-minor)").first().waitFor();
  // Let the camera settle and the labels follow it.
  await page.waitForTimeout(2500);
};

{
  const { page, h } = await kit.page("tv", { label: "board" });
  await seed(page);
  await h.step("a class lights its zones and lists them in the rail", async () => {
    await board(page, "10:20");
    await page.locator(".ftv-block.is-class").getByRole("heading", { name: "Homeschool ninja" }).waitFor();
    await page.locator(".ftv-label.is-class").first().waitFor();
    const court = page.locator(".ftv-block.is-open .ftv-rows li", { hasText: "Basketball court" });
    if (!(await court.count())) throw Error("the court should be free during homeschool ninja");
  });
  await h.shot("class", { full: false });
  await h.step("open gym shows every station zone free", async () => {
    await board(page, "13:00");
    await page.getByText("Open gym rotation · until 3:15").waitFor();
    if (await page.locator(".ftv-label.is-class").count()) throw Error("no class runs at 1:00");
  });
  await h.shot("open-gym", { full: false });
  await h.step("a class starting soon is flagged on its zones", async () => {
    await board(page, "15:10");
    await page.locator(".ftv-block.is-open .ftv-rows small", { hasText: "Class 3:30" }).first().waitFor();
  });
  await h.shot("soon", { full: false });
  await h.step("before opening the board says closed", async () => {
    await board(page, "08:00");
    await page.getByRole("heading", { name: "Closed" }).waitFor();
    await page.getByText("Doors open at 10:00.").waitFor();
  });
  await h.step("tapping the treadmill and bike games shows how they work", async () => {
    await board(page, "13:00");
    // The label floats over the zone; tap just below it, on the model.
    const box = await page.locator(".ftv-label", { hasText: "Treadmill & bike games" }).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height + 8);
    await page.locator(".ftv-feature", { hasText: "speeds up as you go faster" }).waitFor();
    await page.waitForTimeout(2500);
  });
  await h.shot("bike-games", { full: false });
  await h.step("the overhead view shows the plan, and a tap picks a zone", async () => {
    await board(page, "10:20");
    await page.getByRole("radio", { name: "Overhead" }).click();
    await page.locator("main.ftv.is-top").waitFor();
    await page.waitForTimeout(800);
    // Labels sit on zone centers overhead; tap through the court label.
    const box = await page.locator(".ftv-label", { hasText: "Basketball court" }).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator(".ftv-feature", { hasText: "Basketball court" }).waitFor();
  });
  await h.shot("overhead", { full: false });
  await h.step("the V key switches back to 3D, and the choice is remembered", async () => {
    await page.keyboard.press("v");
    await page.locator("main.ftv.is-3d").waitFor();
    await page.keyboard.press("v");
    await page.reload();
    await page.locator("main.ftv.is-top").waitFor();
    await page.getByRole("radio", { name: "3D" }).click();
  });
  await h.step("a coach who isn't an owner can't edit the floor", async () => {
    await page.goto(`${BASE}?tv&edit`);
    await page.getByText("Only the owners change the floor plan").waitFor();
  });
}

{
  const { page, h } = await kit.page("desktop", { label: "editor" });
  await seed(page, CHARLIE);
  await h.step("an owner opens the editor", async () => {
    await page.goto(`${BASE}?tv&edit`);
    await page.getByRole("heading", { name: "Floor plan" }).waitFor();
  });
  await h.step("drags the court and renames it", async () => {
    const court = page.locator(".lay-zone", { hasText: "Basketball court" }).locator("rect");
    const box = await court.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 6 });
    await page.mouse.up();
    await page.getByRole("textbox", { name: "Name" }).fill("Hoops court");
    await page.getByRole("region", { name: "Unsaved changes" }).waitFor();
  });
  await h.step("rotates the court a quarter, by button and by the R key", async () => {
    await page.getByText(/faces the front/).waitFor();
    await page.getByRole("button", { name: "Rotate a quarter turn (R)" }).click();
    await page.getByText(/56 × 29|29 × 56/).waitFor();
    await page.getByText(/faces the left wall/).waitFor();
    await page.getByRole("application").press("r");
    await page.getByText(/faces the back wall/).waitFor();
    await page.getByRole("application").press("r");
    await page.getByRole("application").press("r");
    await page.getByText(/faces the front/).waitFor();
  });
  await h.step("the treadmill and bike games carry a note for the TV", async () => {
    await page.locator(".lay-zone", { hasText: "Treadmill & bike games" }).locator("rect").click();
    const note = page.getByRole("textbox", { name: "Note for the TV" });
    if (!/speeds up/.test(await note.inputValue())) throw Error("missing note");
  });
  await h.shot("editor", { full: true });
  await h.step("saves, and the board shows the new name", async () => {
    await page.getByRole("button", { name: "Save floor plan" }).click();
    await page.getByText(/Last saved by Charlie Mitchell/).waitFor();
    await page.getByRole("button", { name: "Back to the board" }).click();
    await page.locator(".ftv-label", { hasText: "Hoops court" }).waitFor();
  });
}

{
  const { page, h } = await kit.page("desktop", { label: "station-coach" });
  await seed(page, SAM);
  await h.step("a station coach sees the editor locked", async () => {
    await page.goto(`${BASE}?tv&edit`);
    await page.getByText("Sign in as Charlie, Ally or Travis").waitFor();
  });
}

for (const size of ["laptop", "phone"]) {
  const { page, h } = await kit.page(size, { label: "board", reducedMotion: "reduce" });
  await seed(page);
  await h.step("the board fits", async () => board(page, "10:20"));
  await h.overflow("board", [".ftv-labels", ".ftv-canvas"]);
  await h.shot("board", { full: size === "phone" });
}

await kit.close();
