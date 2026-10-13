// End-to-end walk through the coach floor in real Chrome over CDP.
// Needs the dev server (npm run dev) and Chrome. Usage:
//   node scripts/coach-e2e.mjs <output-folder> [head,station,open,manage,perms,rest]
// CHROME and BASE env vars override the browser path and app URL.
// Every step clicks or types in the real UI, checks the result, records
// console errors and horizontal overflow, and screenshots.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/";
const OUT = resolve(process.argv[2] ?? "e2e-out");
const ONLY = process.argv[3]?.split(",");
mkdirSync(OUT, { recursive: true });
const port = 9335;
const proc = spawn(CHROME, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${OUT}/profile`,
  "--no-first-run",
  "--hide-scrollbars",
  "about:blank",
]);
let chromeError = "";
proc.stderr.on("data", (data) => {
  chromeError = (chromeError + data.toString()).slice(-4000);
});
proc.on("error", (error) => {
  chromeError = error.message;
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browserWs;
for (let i = 0; i < 50; i++) {
  try {
    const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    browserWs = v.webSocketDebuggerUrl;
    break;
  } catch {}
  await sleep(200);
}
if (!browserWs) {
  proc.kill();
  throw new Error(`Chrome CDP did not start (${CHROME}, exit ${proc.exitCode ?? "unknown"}): ${chromeError || "no stderr"}`);
}

// One CDP connection per tab.
async function openTab(url = "about:blank") {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const tab = { ws, errors: [] };
  // Closing the socket alone leaves the page running, and an old page
  // shares storage with the next journey. Close the page itself.
  const closeSocket = ws.close.bind(ws);
  ws.close = async () => {
    await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {});
    closeSocket();
  };
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.exceptionThrown") tab.errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    else if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type))
      tab.errors.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  };
  tab.send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, (msg) => (msg.error ? rej(new Error(method + ": " + msg.error.message)) : res(msg.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  tab.eval = async (expr) => {
    const r = await tab.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await tab.send("Page.enable");
  await tab.send("Runtime.enable");
  return tab;
}

const sizes = { small: [320, 640, true], phone: [390, 844, true], tablet: [820, 1180, true], desktop: [1366, 900, false] };
let results = [];
let shotN = 0;
function log(ok, msg) {
  results.push({ ok, msg });
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
}

function helpers(tab, label) {
  const h = {
    async size(kind) {
      const [w, hh, mobile] = sizes[kind];
      await tab.send("Emulation.setDeviceMetricsOverride", { width: w, height: hh, deviceScaleFactor: 1, mobile });
      await tab.send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    },
    async go(url) {
      await tab.send("Page.navigate", { url });
      await sleep(1600);
    },
    async shot(name, full = false) {
      await sleep(350);
      const { cssContentSize } = await tab.send("Page.getLayoutMetrics");
      const r = await tab.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: full,
        clip: full ? { x: 0, y: 0, width: cssContentSize.width, height: Math.min(cssContentSize.height, 5000), scale: 1 } : undefined,
      });
      const file = `${String(++shotN).padStart(2, "0")}-${label}-${name}.png`;
      writeFileSync(`${OUT}/${file}`, Buffer.from(r.data, "base64"));
    },
    // Click the first visible element matching css whose text or aria-label contains `text`.
    async click(css, text, { scroll = true } = {}) {
      const ok = await tab.eval(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(css)})].filter((e) => e.offsetParent !== null || e.getClientRects().length);
        const t = ${JSON.stringify(text ?? null)};
        const el = t === null ? els[0] : els.find((e) => (e.getAttribute("aria-label") ?? "").includes(t) || e.textContent.replace(/\\s+/g, " ").includes(t));
        if (!el) return false;
        ${scroll ? 'el.scrollIntoView({ block: "center" });' : ""}
        el.click();
        return true;
      })()`);
      await sleep(450);
      log(ok, `${label}: click ${css}${text ? ` "${text}"` : ""}`);
      return ok;
    },
    async type(css, value) {
      const ok = await tab.eval(`(() => {
        const i = document.querySelector(${JSON.stringify(css)});
        if (!i) return false;
        const proto = i.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(i, ${JSON.stringify(value)});
        i.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      await sleep(400);
      log(ok, `${label}: type "${value}" into ${css}`);
    },
    async select(css, value) {
      const ok = await tab.eval(`(() => {
        const s = document.querySelector(${JSON.stringify(css)});
        if (!s) return false;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, ${JSON.stringify(value)});
        s.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`);
      await sleep(400);
      log(ok, `${label}: select ${value} in ${css}`);
    },
    async has(text, css = "body") {
      const ok = await tab.eval(`[...document.querySelectorAll(${JSON.stringify(css)})].some((e) => e.textContent.replace(/\\s+/g, " ").includes(${JSON.stringify(text)}))`);
      log(ok, `${label}: sees "${text}"${css !== "body" ? ` in ${css}` : ""}`);
      return ok;
    },
    async lacks(text, css = "body") {
      const ok = await tab.eval(`![...document.querySelectorAll(${JSON.stringify(css)})].some((e) => e.textContent.includes(${JSON.stringify(text)}))`);
      log(ok, `${label}: does not show "${text}"`);
    },
    async count(css) {
      return tab.eval(`document.querySelectorAll(${JSON.stringify(css)}).length`);
    },
    async state() {
      return tab.eval(`JSON.parse(localStorage.getItem("lab-skill-unlocks-v1"))`);
    },
    async check(desc, fn) {
      let ok = false;
      try {
        ok = !!(await fn());
      } catch (e) {
        desc += ` (${e.message})`;
      }
      log(ok, `${label}: ${desc}`);
    },
    async overflow(where) {
      const r = await tab.eval(`(() => {
        const w = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll("body *")].filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width && (b.right > w + 1 || b.left < -1) && getComputedStyle(e).position !== "fixed" && !e.closest(".cf-board, .cf-table, .masthead-art, .cc-filter, .outline-words, .cf-steps, .cf-hero-tabs, .pl-rail, .ds-seg, .cc-toast, .cf-dock, .primary-nav");
        }).slice(0, 4).map((e) => e.className || e.tagName);
        return { scroll: document.documentElement.scrollWidth > w, wide };
      })()`);
      log(!r.scroll && !r.wide.length, `${label}: no sideways overflow on ${where}${r.wide.length ? ` (${r.wide.join(" | ")})` : ""}`);
    },
    async scrollTo(y) {
      await tab.eval(`window.scrollTo(0, ${y})`);
      await sleep(400);
    },
  };
  return h;
}

// Seed a fresh demo world, then sign in as `phone`.
async function signIn(tab, phone, extra = "") {
  await tab.send("Page.navigate", { url: BASE });
  await sleep(1500);
  await tab.eval(`(async () => {
    const d = await import("/src/domain.js");
    const c = await import("/src/club.js");
    const f = await import("/src/floor.js");
    const g = await import("/src/gym.js");
    const now = new Date();
    const today = c.sessions(now);
    const ago = (m) => new Date(now.getTime() - m * 60000);
    let s = JSON.parse(localStorage.getItem("lab-skill-unlocks-v1") || "null");
    if (!s || ${JSON.stringify(!!extra.fresh)}) s = { ...d.seed(), club: c.emptyClub(), floor: f.emptyFloor(), gym: g.seedGym(now) };
    ${extra.build ?? ""}
    localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(s));
    localStorage.setItem("lab-session", JSON.stringify({ phone: ${JSON.stringify(phone)}, since: Date.now(), expires: Date.now() + 864e5 }));
    sessionStorage.clear();
  })()`);
}
const JORDAN = "+16025550150",
  SAM = "+16025550151",
  PRIYA = "+16025550152",
  ALEX = "+16025550153",
  DANA = "+16025550101";
const deskArrivals = `f.rosterFor(0).map((p) => p.id).filter((id) => id !== "jonah").forEach((id, i) => { s = f.applyFloor(s, { type: "checkIn", childIds: [id], by: "Front desk" }, ago(22 - i)); });`;

const journeys = {
  // Head coach runs a class from Today to bonus picks, with a station coach
  // following along in a second tab (tabs share storage).
  async head(kind) {
    const tab = await openTab();
    const h = helpers(tab, `head-${kind}`);
    await h.size(kind);
    await signIn(tab, JORDAN, { fresh: true, build: deskArrivals });
    await h.go(BASE + "?coach");
    await h.has("Good");
    await h.has("Today at the gym");
    await h.overflow("Today");
    await h.shot("today", true);
    // Floor tab goes to the next block; the hero button does too.
    await h.click(".cf-next .button", "Take attendance");
    await h.has("Ninja foundations");
    await h.has("Attendance", ".cf-steps li.now");
    await h.shot("attendance-empty");
    await h.click(".tile-mint .text-button", "Mark all");
    await h.check("front-desk arrivals marked", async () => (await h.state()).gym.checkins.length >= 10);
    // Levels for first-timers.
    const unrated = await h.count(".cf-att .cf-levelpick");
    await h.check(`level pickers shown for unrated kids (${unrated})`, async () => unrated > 0);
    await h.click(".cf-att .cf-levelpick button", "Beginner");
    await h.check("one fewer level picker", async () => (await h.count(".cf-att .cf-levelpick")) === unrated - 1);
    // Walk-in by search, with siblings listed.
    await h.type(".cf-main .cf-search input", "hart");
    await h.has("Willa Hart", ".cf-hits");
    await h.click(".cf-hits .chip", "Rhys Hart");
    await h.check("walk-in Rhys checked in", async () => (await h.state()).gym.checkins.some((c) => c.childId === "rhys"));
    await h.has("Rhys Hart", ".cf-hits .chip[aria-pressed=true]");
    await h.overflow("attendance");
    await h.shot("attendance-marked", true);
    // Untap a kid by mistake and redo.
    await h.click(".cf-att-main", "Theo Parker");
    await h.check("Theo unmarked", async () => !(await h.state()).gym.checkins.some((c) => c.childId === "theo"));
    await h.click(".cc-toast .cc-undo");
    await h.check("undo restores Theo", async () => (await h.state()).gym.checkins.some((c) => c.childId === "theo"));
    // Dock appears after scrolling past the hero.
    await h.scrollTo(1400);
    await h.check("dock shows when the hero button scrolls away", async () => (await h.count(".cf-dock")) === 1);
    await h.shot("attendance-dock");
    await h.scrollTo(0);
    await h.click(".cf-hero-actions .button", "Attendance complete");
    await h.has("Groups", ".cf-steps li.now");
    const groups = await h.count(".cf-group");
    await h.check(`grouped into ${groups} groups`, async () => groups >= 2);
    await h.check("no group breaks the age rule", async () => (await h.count(".cf-group .cf-flag.f-pastDue")) === 0);
    await h.overflow("groups");
    await h.shot("groups", true);
    // Change group count, move a kid, change a coach.
    await h.click(".cf-count button", "2");
    await h.check("re-sorted (age rule may add groups)", async () => (await h.count(".cf-group")) >= 2);
    await h.click(".cf-group:nth-of-type(1) .cf-kidchip");
    await h.check("move targets appear", async () => (await h.count(".cf-movehere")) >= 1);
    await h.click(".cf-movehere");
    await h.has("moved to group");
    await h.select(".cf-group:nth-of-type(1) .cf-field select", "dev");
    await h.check("coach changed to Dev", async () => {
      const s = await h.state();
      return Object.values(Object.values(s.gym.runs)[0].coaches).includes("dev");
    });
    // Second tab: Priya on her station.
    const tab2 = await openTab();
    const p = helpers(tab2, `station-${kind}`);
    await p.size("phone");
    await tab2.send("Page.navigate", { url: BASE });
    await sleep(1200);
    // Same browser profile: switch this tab's session to Priya without touching the shared record.
    await tab2.eval(`sessionStorage.clear()`);
    // Background tabs pause rendering (and scroll observers); bring the head coach back.
    await tab.send("Page.bringToFront");
    await h.click(".cf-hero-actions .button", "Start class");
    // Moving a 5-year-old into the 7–8 group trips the age rule: the app asks once more.
    await h.has("mixes ages outside the rule", ".cf-hero-actions");
    await h.click(".cf-hero-actions .button", "Start anyway");
    await h.has("Rotation 1 of", ".cf-timer");
    await h.check("live pill in the bar", async () => (await h.count(".cf-live")) === 1);
    await h.overflow("live class");
    await h.shot("live", true);
    await h.click(".cf-hero-actions .button", "Rotate now");
    await h.has("Rotation 2 of", ".cf-timer");
    await h.scrollTo(1200);
    await sleep(700);
    const away = await tab.eval(`document.querySelector(".cf-hero-actions").getBoundingClientRect().bottom < 90`);
    if (away) await h.check("dock shows live actions without spilling off screen", async () =>
      tab.eval(`(() => { const d = document.querySelector(".cf-dock"); if (!d) return false; return [...d.querySelectorAll(".button")].every((b) => b.getBoundingClientRect().right <= innerWidth + 1); })()`));
    if (away) await h.check("hero buttons are out of the tab order while the dock shows", async () => tab.eval(`document.querySelector(".cf-hero-actions").inert === true`));
    await h.shot("live-dock");
    await h.scrollTo(0);
    // Kids nav, then back to the class through the live pill.
    await h.click(".primary-nav .nav-item", "Kids");
    await h.has("Find a");
    await h.click(".cf-live");
    await h.has("Rotation 2 of", ".cf-timer");
    // Rotate through to the end.
    for (let i = 0; i < 4; i++) await tab.eval(`[...document.querySelectorAll(".cf-hero-actions .button")].find((b) => b.textContent.includes("Rotate now"))?.click()`);
    await sleep(500);
    await h.has("Rotations done");
    await h.click(".cf-hero-actions .button", "End class");
    await h.has("Wrap-up", ".cf-steps li.now");
    await h.click(".cf-bonus-kid");
    await h.click(".cf-bonus-kid:not([aria-pressed='true'])");
    await h.click(".cf-bonus-kid:not([aria-pressed='true'])");
    await h.check("a fourth pick is blocked", async () => tab.eval(`[...document.querySelectorAll(".cf-bonus-kid")].filter((b) => b.disabled).length > 0`));
    await h.click(".cf-bonus > .button", "Give bonus to 3");
    await h.has("Your bonus picks are in");
    await h.check("3 bonus events by Jordan", async () => (await h.state()).club.events.filter((e) => e.kind === "bonus" && e.coach === "Coach Jordan").length === 3);
    await h.overflow("wrap-up");
    await h.shot("wrap", true);
    await h.click(".primary-nav .nav-item", "Today");
    await h.has("Class done");
    report(tab, `head-${kind}`);
    report(tab2, `station-${kind}`);
    await tab.ws.close();
    await tab2.ws.close();
  },

  // Station coach on a phone while the class runs.
  async station(kind) {
    const tab = await openTab();
    const h = helpers(tab, `station-${kind}`);
    await h.size(kind);
    await signIn(tab, PRIYA, {
      fresh: true,
      build: `${deskArrivals}
        const jordan = { role: "Coach", name: "Coach Jordan", staffId: "jordan" };
        const ids = f.rosterFor(0).map((p) => p.id);
        s = g.applyGym(s, { type: "checkIn", session: today[0].id, childIds: ids, asLead: true, actor: jordan }, ago(10));
        s = g.applyGym(s, { type: "attendanceDone", session: today[0].id, actor: jordan }, ago(8));`,
    });
    await h.go(BASE + "?coach");
    // Before start: the station view says the group that starts here.
    await h.click(".cf-cover .chip", "A station");
    await h.click(".cf-cover .button", "Ninja foundations");
    await h.has("group starts with you");
    await h.shot("before-start");
    // Jordan starts the class (shared storage); this tab picks it up.
    await tab.eval(`(async () => {
      const g = await import("/src/gym.js"); const c = await import("/src/club.js");
      const s = JSON.parse(localStorage.getItem("lab-skill-unlocks-v1"));
      const next = g.applyGym(s, { type: "startClass", session: c.sessions(new Date())[0].id, actor: { role: "Coach", name: "Coach Jordan", staffId: "jordan" } });
      localStorage.setItem("lab-skill-unlocks-v1", JSON.stringify(next));
      window.dispatchEvent(new StorageEvent("storage", { key: "lab-skill-unlocks-v1", newValue: JSON.stringify(next) }));
    })()`);
    await sleep(800);
    await h.has("Rotation 1 of", ".cf-timer");
    await h.has("With you now");
    const rows = await h.count(".cf-row");
    await h.check(`group kids listed (${rows})`, async () => rows > 0);
    await h.click(".cf-row .cf-got");
    await h.has("unlocked");
    await h.check("award saved by Priya", async () => (await h.state()).awards.some((a) => a.coach === "Coach Priya"));
    await h.click(".cf-row-who");
    await h.has("Next skills by station", ".cf-sheet");
    await h.click(".cf-sheet .button", "Worked on it");
    await h.has("Practice logged");
    await h.shot("kid-sheet");
    await h.click(".cf-sheet .kp-close");
    await h.overflow("station");
    await h.shot("station", true);
    // Pick another station from the hero.
    await h.select(".cf-pill-select select", (await tab.eval(`[...document.querySelectorAll(".cf-pill-select option")].map((o) => o.value)[1]`)));
    await h.check("switched station title", async () => tab.eval(`document.querySelector(".cf-hero h1").textContent.length > 0`));
    report(tab, `station-${kind}`);
    await tab.ws.close();
  },

  // Open gym: search a parent's phone, check in a family, the desk queue,
  // a skill, then end-of-shift picks.
  async open(kind) {
    const tab = await openTab();
    const h = helpers(tab, `open-${kind}`);
    await h.size(kind);
    await signIn(tab, PRIYA, {
      fresh: true,
      build: `["ava","mateo","zoe","nora","finn","sofia","luca","ben"].forEach((id, i) => { s = f.applyFloor(s, { type: "checkIn", childIds: [id], by: "Front desk" }, ago(25 - i * 2)); });`,
    });
    await h.go(BASE + "?coach");
    await h.click(".cf-next .button", "Start open gym");
    await h.has("gym.");
    await h.type(".cf-search input", "555-0127");
    await h.has("Ortiz family");
    await h.click(".cf-family .text-button", "Select all");
    await h.has("Flags go to the front desk list", ".cf-dock");
    await h.shot("family-picked");
    await h.click(".cf-dock .button", "Check in 2");
    await h.check("Dani and Gabe on the floor, flagged", async () => {
      const s = await h.state();
      const c = s.gym.checkins.filter((x) => ["dani", "gabe"].includes(x.childId));
      return c.length === 2 && c.every((x) => x.pastDue && !x.deskAt);
    });
    await h.click(".cf-section .button", "Check in all");
    await h.check("desk queue empty", async () => (await h.count(".cf-waiting")) === 0);
    await h.check("wait minutes recorded", async () => (await h.state()).gym.checkins.some((c) => c.deskAt));
    await h.click(".cf-row .cf-got");
    await h.has("unlocked");
    // A kid without a level gets the picker inline.
    await h.check("level picker on an unrated kid", async () => (await h.count(".cf-row .cf-levelpick")) > 0);
    await h.click(".cf-row .cf-levelpick button", "Advanced");
    await h.overflow("open gym");
    await h.shot("open", true);
    await h.click(".cf-bonus-kid");
    await h.click(".cf-bonus > .button", "Give bonus");
    await h.has("Pick 2 kids");
    // Empty search and no-match states.
    await h.scrollTo(0);
    await h.type(".cf-search input", "zzzz");
    await h.has("No kids match");
    await h.type(".cf-search input", "");
    report(tab, `open-${kind}`);
    await tab.ws.close();
  },

  // Manager: team stats, front desk list, Spark import, plans and crews.
  async manage(kind) {
    const tab = await openTab();
    const h = helpers(tab, `manage-${kind}`);
    await h.size(kind);
    await signIn(tab, ALEX, {
      fresh: true,
      build: `const priya = { role: "Coach", name: "Coach Priya", staffId: "priya" };
        ["ava","mateo"].forEach((id, i) => { s = f.applyFloor(s, { type: "checkIn", childIds: [id], by: "Front desk" }, ago(20)); });
        s = g.applyGym(s, { type: "checkIn", session: today[2].id, childIds: ["ava","mateo","dani"], actor: priya }, ago(8));`,
    });
    await h.go(BASE + "?coach");
    await h.has("not on the floor schedule");
    await h.click(".primary-nav .nav-item", "Insights");
    await h.has("New members, first 60 days");
    await h.click(".cf-hero-tabs button", "Coaches");
    await h.has("The team");
    await h.has("Coach Priya", ".cf-table");
    await h.click(".cc-filter button", "30 days");
    await h.overflow("team");
    await h.shot("team", true);
    await h.click(".cf-hero-tabs button", "Front desk");
    await h.has("Dani Ortiz");
    await h.click(".cf-hero-tabs button", "Members");
    await h.type(".cf-field textarea", "first,last,status,past_due,joined\nTheo,Parker,active,yes,2026-10-01\nNobody,Here,active,no,");
    await h.click(".cf-panel .button", "Update members");
    await h.has("Membership updated");
    await h.has("not on the roster: Nobody Here");
    await h.check("Theo now past due", async () => (await h.state()).gym.members.theo.pastDue);
    await h.overflow("members");
    await h.shot("members", true);
    await h.click(".cf-hero-tabs button", "Plans & crew");
    await h.type("textarea[aria-label='What to work on at station 1']", "Dead hangs only this week");
    await h.click(".pl-station .pl-more");
    await h.click(".pl-station .ds-chip");
    await h.has("Unsaved", ".pl-block");
    await h.click(".ds-savebar .button", "Save");
    await h.has("Homeschool ninja saved");
    await h.check("plan saved with a skill", async () => {
      const p = (await h.state()).gym.plans[4];
      return p.stations[0].focus === "Dead hangs only this week" && p.stations[0].skills.length === 1;
    });
    await h.click(".pl-block", "Ninja foundations");
    await h.click(".pl-coach:nth-child(2) .ds-seg button", "Head");
    await h.click(".pl-station .ds-iconbtn", "Move station 1 later");
    await h.click(".ds-savebar .button", "Save");
    await h.check("one save stores crew and plan", async () => {
      const g = (await h.state()).gym;
      return g.crew[0].filter((c) => c.role === "head").length === 1 && g.crew[0][1].role === "head" && g.plans[0].stations[0].station === "wall";
    });
    await h.overflow("plans");
    await h.shot("plans", true);
    report(tab, `manage-${kind}`);
    await tab.ws.close();
  },

  // Non-manager coach: Plans are read-only except their own class; the
  // head-coach view of someone else's class offers a take-over.
  async perms(kind) {
    const tab = await openTab();
    const h = helpers(tab, `perms-${kind}`);
    await h.size(kind);
    await signIn(tab, SAM, {
      fresh: true,
      build: `const jordan = { role: "Coach", name: "Coach Jordan", staffId: "jordan" };
        s = g.applyGym(s, { type: "checkIn", session: today[0].id, childIds: ["theo","ava"], asLead: true, actor: jordan }, ago(3));`,
    });
    await h.go(BASE + "?coach");
    await h.click(".primary-nav .nav-item", "Plans");
    await h.click(".pl-block", "Ninja foundations");
    await h.has("View only", ".pl-head");
    await h.check("Sam can't edit Jordan's class plan", async () => tab.eval(`!document.querySelector("textarea[aria-label^='What to work on']")`));
    await h.check("Sam has no crew controls", async () => tab.eval(`!document.querySelector(".pl-coach .ds-seg, .pl-add-coach")`));
    await h.click(".pl-block", "Ninja progressions");
    await h.check("Sam edits his own class", async () => tab.eval(`!!document.querySelector("textarea[aria-label^='What to work on']")`));
    await h.overflow("plans-coach");
    await h.shot("plans-coach", true);
    await h.click(".primary-nav .nav-item", "Today");
    await h.click(".cf-cover .chip", "Head coach");
    await h.click(".cf-cover .button", "Ninja foundations");
    await h.has("is running this class");
    await h.click(".cf-hero-actions .button", "Attendance complete");
    await h.has("Coach Jordan is running this class", ".cc-toast");
    await h.click(".cf-takeover .button", "Take over");
    await h.click(".cf-hero-actions .button", "Attendance complete");
    await h.has("Groups", ".cf-steps li.now");
    await h.shot("takeover");
    report(tab, `perms-${kind}`);
    await tab.ws.close();
  },

  // The rest of the app still works: More tools, kid and parent views with
  // Lab Coins / XP, the kiosk feeding the coach floor.
  async rest(kind) {
    const tab = await openTab();
    const h = helpers(tab, `rest-${kind}`);
    await h.size(kind);
    await signIn(tab, JORDAN, { fresh: true });
    await h.go(BASE + "?kiosk");
    await h.type("input", "4000");
    await h.click("button", "Enter");
    await h.click("button", "Check in");
    await h.has("checked in");
    await h.go(BASE + "?coach");
    await h.check("kiosk arrival counts in the building", async () => tab.eval(`document.querySelector(".tile-sky .stat-value").textContent.trim() !== "0"`));
    await h.click(".cf-me");
    await h.click(".ds-menu [role=menuitem]", "More tools");
    await h.check("legacy coach center open", async () => (await h.count(".cc-nav")) === 1);
    await h.click(".cc-me");
    await h.click(".ds-menu [role=menuitem]", "Leave coach center");
    await h.check("back on the coach floor", async () => (await h.count(".cf")) === 1);
    await h.click(".cf-me");
    await h.click(".ds-menu [role=menuitem]", "Kid and parent views");
    await h.has("journey");
    await h.has("Lab Coins");
    await h.shot("kid-view");
    await signIn(tab, DANA);
    await h.go(BASE);
    await h.click(".nav-item", "Clubhouse");
    await h.has("Lab Coins");
    await h.shot("parent-club");
    report(tab, `rest-${kind}`);
    await tab.ws.close();
  },
};

function report(tab, label) {
  const errs = tab.errors.filter((e) => !/Download the React DevTools|vite/i.test(e));
  log(!errs.length, `${label}: no console errors${errs.length ? ` → ${errs.slice(0, 3).join(" || ")}` : ""}`);
}

const plan = [
  ["head", "desktop"],
  ["head", "phone"],
  ["head", "small"],
  ["station", "phone"],
  ["station", "tablet"],
  ["open", "phone"],
  ["open", "desktop"],
  ["manage", "desktop"],
  ["manage", "phone"],
  ["perms", "desktop"],
  ["rest", "desktop"],
];
try {
  for (const [j, kind] of plan) {
    if (ONLY && !ONLY.includes(j)) continue;
    try {
      await journeys[j](kind);
    } catch (e) {
      log(false, `${j}-${kind}: crashed: ${e.message}`);
    }
  }
} finally {
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length} passed, ${fails.length} failed`);
  fails.forEach((f) => console.log("  ✗ " + f.msg));
  proc.kill();
  process.exit(fails.length ? 1 : 0);
}
