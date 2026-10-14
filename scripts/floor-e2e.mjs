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
  // Software WebGL in CI can take a while to draw the first frame.
  await page.locator(".ftv-label:not(.is-minor)").first().waitFor({ timeout: 90000 });
  // Let the camera settle and the labels follow it.
  await page.waitForTimeout(2500);
};
// The board hides its buttons a few seconds after the mouse stops, the way
// a TV should. Move the mouse first, as a person would, before using them.
const wake = async (page) => {
  await page.mouse.move(40, 40);
  await page.mouse.move(80, 60, { steps: 3 });
  await page.waitForTimeout(300);
};

{
  const { context, page, h } = await kit.page("tv", { label: "board" });
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
    // Foundations warms up on the track at 3:30; its stations follow at 3:35.
    await page.locator(".ftv-block.is-open .ftv-rows small", { hasText: "Class 3:35" }).first().waitFor();
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
    await wake(page);
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
    await wake(page);
    await page.getByRole("radio", { name: "3D" }).click();
  });
  await h.step("a coach who isn't an owner can't edit the floor", async () => {
    await page.goto(`${BASE}?tv&edit`);
    await page.getByText("Only the owners change the floor plan").waitFor();
  });
  // Each page holds a WebGL context; free it before the next one.
  await context.close();
}

{
  const { context, page, h } = await kit.page("desktop", { label: "editor" });
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
    // Each quarter turn moves the facing one step clockwise and swaps width
    // and depth; four turns come back to the start.
    const order = ["the front", "the left wall", "the back wall", "the right wall"];
    const note = () => page.getByText(/\d+ × \d+ ft at .* · faces /).first().textContent();
    const read = async () => {
      const t = await note();
      const [, w, d] = t.match(/(\d+) × (\d+)/);
      return { w, d, facing: order.findIndex((f) => t.endsWith(f)) };
    };
    const start = await read();
    await page.getByRole("button", { name: "Rotate a quarter turn (R)" }).click();
    await page.getByText(new RegExp(`${start.d} × ${start.w} ft .* faces ${order[(start.facing + 1) % 4]}`)).waitFor();
    for (const key of ["r", "r", "r"]) await page.getByRole("application").press(key);
    await page.getByText(new RegExp(`${start.w} × ${start.d} ft .* faces ${order[start.facing]}`)).waitFor();
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
  // Each page holds a WebGL context; free it before the next one.
  await context.close();
}

{
  const { context, page, h } = await kit.page("desktop", { label: "station-coach" });
  await seed(page, SAM);
  await h.step("a station coach sees the editor locked", async () => {
    await page.goto(`${BASE}?tv&edit`);
    await page.getByText("Sign in as Charlie, Ally or Travis").waitFor();
  });
  // Each page holds a WebGL context; free it before the next one.
  await context.close();
}

// The front desk TV, with a few opted-in kids so crowns and shoutouts show.
async function seedDesk(page) {
  await seed(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("lab-skill-unlocks-v1"));
    const at = new Date().toISOString();
    const day = at.slice(0, 10);
    s.club.profiles = {
      theo: { optIn: true, alias: "Turbo Theo", group: "6–8 / Foundations" },
      maya: { optIn: true, alias: "Maya the Mighty", group: "9–12 / Foundations" },
      leo: { optIn: false, alias: "", group: "6–8 / Foundations" },
    };
    const ev = (id, childId, kind, extra) => ({ id, childId, kind, status: "approved", at, session: `${day}:2`, ...extra });
    s.club.events = [
      ev("c1", "theo", "complete", { station: "court" }),
      ev("c2", "maya", "complete", { station: "wall" }),
      ev("c3", "leo", "complete", { station: "grip" }),
      ev("p1", "maya", "praise", { category: "Kept trying", coach: "Coach Sam" }),
      ev("p2", "leo", "praise", { category: "Brave first try", coach: "Coach Sam" }),
    ];
    localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(s));
  });
}
{
  const { context, page, h } = await kit.page("tv", { label: "desk" });
  await seedDesk(page);
  await h.step("during a class, only free equipment earns points on the strip", async () => {
    await page.goto(`${BASE}?tv=desk&at=10:20`);
    await page.locator(".dtv-schedule li.is-live", { hasText: "Homeschool ninja" }).waitFor();
    await page.locator(".dtv-schedule li.is-live em", { hasText: "Now" }).waitFor();
    // The class holds only its marked zones; nothing on the strip may be one.
    await page.locator(".ftv-label.is-class").first().waitFor({ timeout: 90000 });
    const held = await page.locator(".ftv-label.is-class .ftv-label-name").allTextContents();
    const where = await page.locator(".dtv-move footer span").allTextContents();
    if (!where.length || where.some((w) => held.some((z) => w.startsWith(z))))
      throw Error(`moves on zones the class holds: ${where.join(", ")} (held: ${held.join(", ")})`);
  });
  await h.step("in open gym the strip shows five movements across the floor", async () => {
    await page.goto(`${BASE}?tv=desk&at=13:00`);
    await page.locator(".dtv-move").nth(4).waitFor();
    await page.locator(".ftv-label:not(.is-minor)").first().waitFor();
    await page.waitForTimeout(2500);
  });
  await h.shot("open-gym", { full: false });
  await h.step("the strip turns to crowns and shoutouts, opted-in nicknames only", async () => {
    await page.locator(".dtv-strip h2", { hasText: "This week's crowns" }).waitFor({ timeout: 20000 });
    await page.locator(".dtv-crown", { hasText: "Turbo Theo" }).waitFor();
    if (await page.locator(".dtv-crown", { hasText: "Monkey bars" }).count())
      throw Error("Leo isn't opted in, so grip has no crown");
    await h.shot("crowns", { full: false });
    await page.locator(".dtv-strip h2", { hasText: "Coach shoutouts" }).waitFor({ timeout: 20000 });
    await page.locator(".dtv-shout", { hasText: "Maya the Mighty" }).waitFor();
    if (await page.locator(".dtv-shout", { hasText: "Brave first try" }).count())
      throw Error("Leo's shoutout shouldn't show");
  });
  await h.shot("shoutouts", { full: false });
  await h.step("closed, the strip says when points open up", async () => {
    await page.goto(`${BASE}?tv=desk&at=08:00`);
    await page.getByText("Points open up when the gym does.").waitFor();
  });
  // Each page holds a WebGL context; free it before the next one.
  await context.close();
}
{
  const { context, page, h } = await kit.page("phone", { label: "desk", reducedMotion: "reduce" });
  await seedDesk(page);
  await h.step("the desk screen stacks on a phone", async () => {
    await page.goto(`${BASE}?tv=desk&at=13:00`);
    await page.locator(".dtv-move").first().waitFor();
  });
  await h.overflow("desk", [".ftv-labels", ".ftv-canvas"]);
  await h.shot("desk", { full: true });
  // Each page holds a WebGL context; free it before the next one.
  await context.close();
}

// A closed day (a holiday on the schedule): both screens say so.
{
  const { context, page, h } = await kit.page("tv", { label: "closed" });
  await seed(page);
  await page.evaluate(async () => {
    const sc = await import("/src/schedule.js");
    const c = await import("/src/club.js");
    const s = JSON.parse(localStorage.getItem("lab-skill-unlocks-v1"));
    s.schedule = { ...sc.seedSchedule(), exceptions: [{ id: "x1", day: c.dayKey(new Date()), kind: "closed", note: "Holiday" }] };
    localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(s));
  });
  await h.step("the desk screen says closed today and when it reopens", async () => {
    await page.goto(`${BASE}?tv=desk&at=13:00`);
    await page.locator(".dtv-closed", { hasText: "Closed today" }).waitFor();
    await page.getByText("Open again tomorrow at 10:00.").waitFor();
    await page.getByText("The gym is closed today.").waitFor();
  });
  await h.shot("desk", { full: false });
  await h.step("the floor board says closed today", async () => {
    await page.goto(`${BASE}?tv&at=13:00`);
    await page.getByRole("heading", { name: "Closed today" }).waitFor();
    await page.getByText("Open again tomorrow at 10:00.").waitFor();
  });
  await context.close();
}

// The demo day: pause it, jump the timeline to each moment, check the line.
{
  const { context, page, h } = await kit.page("tv", { label: "demo" });
  await seed(page);
  const START = 9 * 60 + 45;
  const END = 20 * 60 + 30;
  const jump = async (hhmm) => {
    const [hr, mn] = hhmm.split(":").map(Number);
    const box = await page.locator(".tv-demo-track").boundingBox();
    const f = (hr * 60 + mn + 0.5 - START) / (END - START);
    await page.mouse.click(box.x + box.width * f, box.y + box.height / 2);
    await page.locator(".tv-demo time", { hasText: `${hr % 12 || 12}:${String(mn).padStart(2, "0")}` }).waitFor();
    await page.waitForTimeout(1800);
  };
  await h.step("the demo day opens paused-able on the desk screen", async () => {
    await page.goto(`${BASE}?tv=desk&demo`);
    await page.getByRole("region", { name: "Demo day" }).waitFor();
    await page.getByRole("button", { name: "Pause the demo" }).click();
    await page.getByRole("button", { name: "Play the demo" }).waitFor();
  });
  for (const [t, line, name] of [
    ["9:50", /^Closed/, "closed"],
    ["10:30", /Homeschool ninja is running/, "class"],
    ["13:15", /^Open gym/, "open-gym"],
    ["14:15", /paused/, "pause"],
    ["15:10", /starts soon/, "soon"],
  ]) {
    await h.step(`at ${t} the zones and the line say what's happening`, async () => {
      await jump(t);
      const text = await page.locator(".tv-demo p").textContent();
      if (!line.test(text)) throw Error(`at ${t}: ${text}`);
    });
    await h.shot(`desk-${name}`, { full: false });
  }
  await h.step("the floor board runs the same demo day", async () => {
    await page.goto(`${BASE}?tv&demo`);
    await page.locator(".ftv-label:not(.is-minor)").first().waitFor({ timeout: 90000 });
    await wake(page);
    await page.getByRole("button", { name: "Pause the demo" }).click();
    await jump("10:30");
    await page.locator(".ftv-block.is-class", { hasText: "Homeschool ninja" }).waitFor();
    if (await page.getByRole("button", { name: "Edit floor" }).count())
      throw Error("no editing during the demo");
  });
  await h.shot("floor-class", { full: false });
  // Each page holds a WebGL context; free it before the next one.
  await context.close();
}

// Class floor use: a class holds only the zones marked for the part it's in.
{
  const { context, page, h } = await kit.page("tv", { label: "use" });
  await seed(page, CHARLIE);
  await h.step("during the warm-up only the track is held; the rig waits its turn", async () => {
    await board(page, "10:02");
    await page.locator(".ftv-label.is-class", { hasText: "Run track" }).waitFor();
    await page.locator(".ftv-label.is-class .ftv-label-state", { hasText: "Warm-up" }).waitFor();
    await page.locator(".ftv-label.is-soon", { hasText: "Grip lanes" }).waitFor();
    if (await page.locator(".ftv-label.is-class", { hasText: "Grip lanes" }).count())
      throw Error("the rig is free until the stations start");
  });
  await h.shot("warmup", { full: false });
  await h.step("during stations the class holds its lanes, not the whole rig", async () => {
    await board(page, "10:20");
    await page.locator(".ftv-label.is-class", { hasText: "Grip lanes" }).waitFor();
    await page.locator(".ftv-label.is-open", { hasText: "Advanced rig" }).waitFor();
    await page.locator(".ftv-label.is-open", { hasText: "Track wall" }).waitFor();
  });
  await h.shot("stations", { full: false });
  await h.step("an owner moves the course station onto the advanced rig", async () => {
    await wake(page);
    await page.getByRole("button", { name: "Class floor use" }).click();
    await page.getByRole("heading", { name: "Class floor use" }).waitFor();
    await page.getByRole("radio", { name: "Homeschool ninja" }).click();
    await page.locator(".use-parts button", { hasText: "Ninja course" }).click();
    await page.getByRole("checkbox", { name: "Advanced rig" }).click();
    await page.getByRole("checkbox", { name: "Course lanes" }).click();
    await page.locator(".use-parts button[aria-pressed=true]", { hasText: "Advanced rig" }).waitFor();
  });
  await h.shot("use-editor", { full: false });
  await h.step("saves, and the board follows the new floor use", async () => {
    await page.getByRole("button", { name: "Save floor use" }).click();
    await page.getByText(/Last marked by Charlie Mitchell/).waitFor();
    await board(page, "10:20");
    await page.locator(".ftv-label.is-class", { hasText: "Advanced rig" }).waitFor();
    await page.locator(".ftv-label.is-open", { hasText: "Course lanes" }).waitFor();
  });
  await context.close();
}
{
  const { context, page, h } = await kit.page("desktop", { label: "use-locked" });
  await seed(page, "+16025550154");
  await h.step("a coach who leads no class sees floor use read-only", async () => {
    await page.goto(`${BASE}?tv&edit=use`);
    await page.getByRole("heading", { name: "Class floor use" }).waitFor();
    await page.getByText("Head coach or owner").waitFor();
    if (await page.getByRole("checkbox").count()) throw Error("zones shouldn't be tappable");
  });
  await context.close();
}

for (const size of ["laptop", "phone"]) {
  const { context, page, h } = await kit.page(size, { label: "board", reducedMotion: "reduce" });
  await seed(page);
  await h.step("the board fits", async () => board(page, "10:20"));
  await h.overflow("board", [".ftv-labels", ".ftv-canvas"]);
  await h.shot("board", { full: size === "phone" });
  // Each page holds a WebGL context; free it before the next one.
  await context.close();
}

await kit.close();
