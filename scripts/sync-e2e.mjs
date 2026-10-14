// Several people on separate devices share one gym's data.
//
// Needs the local database (npx supabase start && npx supabase db reset)
// and the dev server built against it (.env.local with VITE_SUPABASE_URL
// and VITE_SUPABASE_PUBLISHABLE_KEY). Usage:
//   node scripts/sync-e2e.mjs [base url]
// Each browser context is its own device with its own sign-in.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? process.env.BASE ?? "http://127.0.0.1:5199/";
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
});
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

async function device(label, path = "") {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !/favicon|Failed to load resource/.test(m.text())
    )
      page.errors.push(`${label}: ${m.text()}`);
  });
  await page.goto(BASE + path);
  return page;
}

async function signIn(page, phone) {
  await page.fill("#signin-phone", phone);
  await page.press("#signin-phone", "Enter");
  const code = await page
    .locator(".signin-demo b")
    .textContent({ timeout: 15000 });
  await page.fill(".signin-code", code.trim());
  await page.locator(".appbar").waitFor({ timeout: 20000 });
}

async function openSkill(page, id) {
  await page
    .getByRole("button", { name: "Achievements", exact: true })
    .first()
    .click();
  await page
    .locator("button.skill-card", { hasText: `${id} ·` })
    .first()
    .click();
}
const goalButton = (page) => page.locator(".goal-button");
const closeDialog = (page) => page.keyboard.press("Escape");

// Runs one of the app's reducers on a device's live state, the way a tap
// would. Returns the reducer's error message, if any.
const act = (page, mod, fn, ...args) =>
  page.evaluate(
    async ([mod, fn, args]) => {
      const m = await import(mod);
      let err = null;
      window.__lab.setState((s) => {
        try {
          return m[fn](s, ...args);
        } catch (e) {
          err = e.message;
          return s;
        }
      });
      await new Promise((r) => setTimeout(r, 100));
      return err;
    },
    [mod, fn, args],
  );
const read = (page, fn) => page.evaluate(fn);
// Waits until a device's state satisfies `test` (run in the page).
async function until(page, test, arg, ms = 12000) {
  try {
    await page.waitForFunction(test, arg, { timeout: ms, polling: 250 });
    return true;
  } catch {
    return false;
  }
}
const toastText = (page) => page.locator(".toast").allTextContents();

try {
  // Two guardians of the same kid, each on their own phone.
  const dana = await device("Dana");
  const jamie = await device("Jamie");
  await signIn(dana, "6025550101");
  await signIn(jamie, "6025550140");
  check(true, "two guardians signed in on separate devices");

  // Dana drops a goal; Jamie's screen follows without a reload.
  await openSkill(dana, "S09");
  await openSkill(jamie, "S09");
  check(
    (await goalButton(dana).textContent()).includes("Remove"),
    "S09 starts as one of Theo's goals on both phones",
  );
  await goalButton(dana).click();
  await goalButton(jamie)
    .filter({ hasText: "Make this my next goal" })
    .waitFor({ timeout: 10000 })
    .then(
      () => check(true, "Jamie sees Dana's change live"),
      () => check(false, "Jamie sees Dana's change live"),
    );

  // Jamie puts it back; Dana sees that.
  await goalButton(jamie).click();
  await goalButton(dana)
    .filter({ hasText: "Remove from my goals" })
    .waitFor({ timeout: 10000 })
    .then(
      () => check(true, "Dana sees Jamie's change live"),
      () => check(false, "Dana sees Jamie's change live"),
    );
  await closeDialog(dana);
  await closeDialog(jamie);

  // A new device opens later and starts from the same data.
  const later = await device("Later");
  await signIn(later, "6025550101");
  await openSkill(later, "S09");
  check(
    (await goalButton(later).textContent()).includes("Remove"),
    "a device signed in later sees the same goals",
  );

  // Screens sign themselves in at the location.
  const tv = await device("Desk TV", "?tv=desk");
  await tv.waitForTimeout(4000);
  check(
    !(await tv.locator("text=Can’t reach the gym’s data").count()),
    "the front-desk TV loads as a screen",
  );
  const kiosk = await device("Kiosk", "?kiosk");
  await kiosk.waitForTimeout(4000);
  check(
    !(await kiosk.locator("text=Can’t reach the gym’s data").count()),
    "the kiosk loads as a screen",
  );

  /* ---------- Coaches, parents and screens on one gym's data ---------- */
  const jordan = await device("Coach Jordan");
  await signIn(jordan, "6025550150");
  const jordanActor = {
    role: "Coach",
    name: "Coach Jordan",
    staffId: "jordan",
    head: false,
  };

  // A coach verifies Theo's last three Tier 1 skills.
  for (const [skillId, value] of [
    ["S07", "Demonstrated"],
    ["S09", 10],
    ["S10", "Demonstrated"],
  ]) {
    const err = await act(jordan, "/src/domain.js", "apply", {
      type: "award",
      childId: "theo",
      skillId,
      coach: "Coach Jordan",
      value,
      confirmed: true,
    });
    check(!err, `coach verifies ${skillId}${err ? `: ${err}` : ""}`);
  }
  check(
    await until(dana, () =>
      ["S07", "S09", "S10"].every((id) =>
        window.__lab.state.awards.some(
          (a) => a.childId === "theo" && a.skillId === id && !a.revoked,
        ),
      ),
    ),
    "the parent's phone shows the new awards",
  );
  // Tier 1 complete: the server makes the shirt, both see it.
  check(
    await until(dana, () =>
      window.__lab.state.rewards.some((r) => r.id === "theo-1"),
    ),
    "the server creates Theo's Tier 1 shirt and the parent sees it",
  );
  let err = await act(dana, "/src/domain.js", "apply", {
    type: "reward",
    id: "theo-1",
    status: "Reserved",
    size: "Youth M",
  });
  check(!err, `the parent picks a size${err ? `: ${err}` : ""}`);
  check(
    await until(
      jordan,
      () =>
        window.__lab.state.rewards.find((r) => r.id === "theo-1")?.status ===
        "Reserved",
    ),
    "the coach sees the reserved shirt",
  );

  // A coach can't correct an award; the server refuses and the screen
  // goes back to what the server holds.
  const award = await read(
    jordan,
    () =>
      window.__lab.state.awards.find(
        (a) => a.childId === "theo" && a.skillId === "S07",
      ).id,
  );
  await act(jordan, "/src/domain.js", "apply", {
    type: "revoke",
    id: award,
    reason: "Wrong kid",
  });
  check(
    await until(jordan, () =>
      [...document.querySelectorAll(".sync-notice")].some((t) =>
        /manager/i.test(t.textContent),
      ),
    ),
    "the coach is told a manager corrects awards",
  );
  check(
    await until(
      jordan,
      (id) =>
        window.__lab.state.awards.find((a) => a.id === id)?.revoked === false,
      award,
    ),
    "the refused correction is undone on the coach's screen",
  );

  // The front-desk kiosk checks Theo in; the coach sees him arrive.
  const kioskErr = await act(kiosk, "/src/floor.js", "applyFloor", {
    type: "checkIn",
    childIds: ["theo"],
    familyId: "parker",
  });
  check(
    !kioskErr,
    `the kiosk checks Theo in${kioskErr ? `: ${kioskErr}` : ""}`,
  );
  check(
    await until(jordan, () =>
      window.__lab.state.floor.presence.some(
        (p) => p.childId === "theo" && !p.out,
      ),
    ),
    "the coach sees the front-desk check-in",
  );

  // A coach checks Maya into today's class on the floor.
  const today = await read(jordan, async () =>
    (await import("/src/gym-time.js")).gymDayKey(new Date()),
  );
  const sam = await device("Coach Sam");
  await signIn(sam, "6025550151");
  err = await act(sam, "/src/gym.js", "applyGym", {
    type: "checkIn",
    session: `${today}:1`,
    childIds: ["maya"],
    actor: { role: "Coach", name: "Coach Sam", staffId: "sam", head: false },
  });
  check(!err, `a coach checks Maya into class${err ? `: ${err}` : ""}`);
  check(
    await until(
      jordan,
      (s) =>
        window.__lab.state.gym.checkins.some(
          (c) => c.childId === "maya" && c.session === s,
        ) &&
        window.__lab.state.club.events.some(
          (e) =>
            e.childId === "maya" && e.session === s && e.status === "approved",
        ),
      `${today}:1`,
    ),
    "another coach sees the check-in and Maya's class star",
  );

  // Two coaches change their own time splits at the same moment; both
  // changes survive.
  const priya = await device("Coach Priya");
  await signIn(priya, "6025550152");
  const riley = await device("Coach Riley");
  await signIn(riley, "6025550154");
  const split = (staffId, name, portfolio) => ({
    type: "portfolio",
    staffId,
    portfolio,
    actor: { role: "Coach", name, staffId, head: false },
  });
  const [e1, e2] = await Promise.all([
    act(
      priya,
      "/src/staffing.js",
      "applyStaffing",
      split("priya", "Coach Priya", { class: 50, open: 30, floater: 20 }),
    ),
    act(
      riley,
      "/src/staffing.js",
      "applyStaffing",
      split("riley", "Coach Riley", { class: 20, open: 60, floater: 20 }),
    ),
  ]);
  check(
    !e1 && !e2,
    `both coaches save their splits${e1 || e2 ? `: ${e1 || e2}` : ""}`,
  );
  const both = () => {
    const p = window.__lab.state.staffing?.portfolios ?? {};
    return p.priya?.class === 50 && p.riley?.open === 60;
  };
  check(await until(priya, both), "Priya's phone has both splits");
  check(await until(riley, both), "Riley's phone has both splits");
  check(await until(jordan, both), "a third coach sees both splits");

  // A coach's photo reaches the family's phone.
  const photo = await jordan.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 48;
    c.getContext("2d").fillRect(0, 0, 64, 48);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg"));
    const { savePhoto } = await import("/src/media.js");
    return savePhoto(blob, "theo");
  });
  err = await act(jordan, "/src/floor.js", "applyFloor", {
    type: "moment",
    childId: "theo",
    photoId: photo,
    caption: "First catch",
    actor: jordanActor,
  });
  check(!err, `the coach posts a moment${err ? `: ${err}` : ""}`);
  check(
    await until(
      dana,
      (id) => window.__lab.state.floor.moments.some((m) => m.photoId === id),
      photo,
    ),
    "the family sees the moment",
  );
  const photoStatus = await dana.evaluate(async (id) => {
    const { signedPhotoUrl } = await import("/src/sync/photos.js");
    const url = await signedPhotoUrl(id, "thumb");
    return url ? (await fetch(url)).status : 0;
  }, photo);
  check(
    photoStatus === 200,
    "the family's phone loads the photo from shared storage",
  );

  // An owner renames a zone; the floor TV redraws it.
  const charlie = await device("Charlie (owner)");
  await signIn(charlie, "6025550157");
  const floorTv = await device("Floor TV", "?tv");
  await floorTv.waitForFunction(() => window.__lab?.state, null, {
    timeout: 15000,
  });
  const zones = await read(
    charlie,
    async () =>
      (await import("/src/layout.js")).layoutOf(window.__lab.state).zones,
  );
  err = await act(charlie, "/src/layout.js", "applyLayout", {
    type: "save",
    zones: zones.map((z, i) =>
      i === 0 ? { ...z, name: "Bike games (moved)" } : z,
    ),
    actor: {
      role: "Coach",
      name: "Charlie Mitchell",
      staffId: "charlie",
      owner: true,
      head: false,
    },
  });
  check(!err, `the owner saves the floor plan${err ? `: ${err}` : ""}`);
  check(
    await until(
      floorTv,
      () =>
        window.__lab.state.layout?.zones?.[0]?.name === "Bike games (moved)",
    ),
    "the floor TV shows the owner's change",
  );

  const errors = [
    dana,
    jamie,
    later,
    tv,
    kiosk,
    jordan,
    sam,
    priya,
    riley,
    charlie,
    floorTv,
  ].flatMap((p) => p.errors);
  check(
    !errors.length,
    `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`,
  );
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
