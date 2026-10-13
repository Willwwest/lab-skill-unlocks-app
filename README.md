# The LAB · Skill Unlocks

React app built by Codex with Claude Opus implementation review and Opus-authored domain tests. Uses Vite, React, Lucide icons, the original LAB logo, the observed brand palette and Argentum heading font. Shirt/obstacle artwork is original SVG UI artwork. Shirt designs are concepts.

## Run

```powershell
cd C:\Documents\personal\labs\app
npm.cmd install
npm.cmd run dev -- --port 5173
```

Open http://127.0.0.1:5173/. `npm.cmd run build` produces `dist/`; `npm.cmd run preview` serves that build. `npm.cmd test` runs domain tests using Node's built-in runner. Use a current Node release compatible with Vite 7 (this build was tested on Node 25).

## Try the app

1. Start as Theo: 7/10 Tier 1 skills earned. Explore skills, choose up to three next goals, switch tiers, and filter/search.
2. Change **Demo view** to **Coach**, open **Coach desk**, and verify the three remaining Tier 1 skills: First Roll, Ball Control (10 dribbles), First Combination. Confirmation is required; insufficient measured values are rejected.
3. Open Rewards. One Spark shirt entitlement appears when the tier is complete. Parent view can select a size; Coach can advance Reserved → Ready → Collected.
4. Open Activity to see the measurement, setup, rubric version, date and coach. Coach can correct a record with a reason. Dependent progress and affected rewards are rechecked; collected reward history stays recorded and can be flagged for review.
5. Maya has two completed chapters, useful for reviewing later tiers and rewards. Leo has no achievements, showing the first-visit experience.
6. Refresh to verify persistence. Use Reset in the footer to restore synthetic demo data. Export on Activity downloads a JSON progress record for the selected demo athlete.

## Implemented

- 55 achievement definitions across four incremental tiers: 10 / 12 / 15 / 18.
- Distinct catch/top-out achievements for three sample warped-wall assets; rung counts, timed hangs, basketball and parkour/course skills.
- Prerequisite enforcement, measurement validation, duplicate prevention, separate bonus badges, practice recording, three personal next goals.
- Athlete, Parent and Coach demo surfaces; child switching, category/status/search filters, progress timeline/export.
- Automatic tier/one-shirt entitlement calculation, size selection and fulfillment status, audited award correction and reward review.
- Browser-local persistence and malformed-state fallback; responsive layouts, keyboard focus indicators, modal focus containment/Escape close, reduced-motion and print styles.

## Deliberate prototype boundaries

**Do not enter real children's data.** The role/athlete selectors are demonstration controls, not authentication or authorization. Everything is stored in localStorage on this browser, with no server, shared database, account system or cross-device synchronization. Do not deploy this as a live member-record system.

The catalog is a sample fixed checklist, not an approved athletic assessment system. Equipment names/configurations, readiness, age eligibility, rest/attempt limits and safety rubrics need head-coach approval. No elevated drop height is prescribed or enabled as a named default task. Pending production work includes equipment/rubric administration, individualized approved checklist substitutions, staff identity/access controls, parent-child association, consent/data-retention processes, backup/export recovery, immutable server audit, and actual shirt inventory/order integration.

No real notification, purchase, shipment, membership import or medical assessment is performed. The browser may load Work Sans from Google Fonts; Argentum is locally copied from the reviewed LAB website for this private preview. Confirm font/artwork distribution rights before publication.

## Collaboration and verification

Opus wrote the initial 32 domain tests; Codex added five regression tests for fractions, invalid dates, dependent corrections, goal limits and corrupted duplicates. All 37 passed after implementation. The production build passed. Browser control verified below-target rejection, valid award creation, final-tier-item shirt entitlement, fulfillment transitions, reload persistence, and phone navigation/layout.

Review records: `OPUS-IMPLEMENTATION-REVIEW.md`, `IMPLEMENTATION-DECISIONS.md`, and raw Opus JSON outputs. The parent project holds the full PRD and discovery sources. Later test counts may increase as new functionality is added.

## UI redesign review
Claude Opus implemented the React artwork and stylesheet redesign. Larger typography, stronger tier badges, category illustrations, card treatments, hero composition, and earned-shirt artwork preserve the original LAB identity. Codex subsequently raised all CSS text sizes below 12px to a 12px minimum and added React interaction regressions.

Validation: 37 domain tests and 4 React interaction tests pass; production build passes. Interaction coverage includes athlete goal selection and restricted verification, quantitative coach validation, tier completion and parent shirt sizing, bonus exclusion and prerequisite locks. Run `npm.cmd run test:ui` for the interaction suite. This suite uses an in-memory Storage implementation because the installed Node 25 runtime exposes a conflicting native localStorage.

Visual browser QA for this redesign remains unverified: browser control rejected access under its URL policy. No new screenshot or alternate browser workaround was used. The preview is http://127.0.0.1:5173/. This remains a local synthetic-data demo with browser storage and role switching, without production authentication or a backend.

## UI v3: brand system redesign (October 10, 2026)

The dashboard-template shell was replaced with a single design system built from the brand kit (navy, cyan, mint; Argentum headings; pill buttons; dot texture). Both the skill app and the Clubhouse now share it.

- Navy app bar with pill navigation and compact athlete/role switchers; on phones the navigation becomes a bottom tab bar, and between 760 and 1100 px inactive items collapse to icons.
- Hand-drawn category scenes were replaced by hexagonal skill badges (`src/ui.jsx`): a category icon and color, with earned badges filled navy with a check seal and locked badges dashed with a lock.
- Progress rings replace stat tiles in the hero, the chapter rail and Clubhouse milestones. The hero shows the current chapter, remaining skills and the next shirt.
- Redrawn tier shirts with the real LAB logo, cleaner rewards cards, a badge-led timeline, and restyled dialogs, forms, toasts and Clubhouse panels.
- Previous versions are kept in `design-v1-backup/` and `design-v2-backup/` (the latter includes the old dashboard screenshot).

Validation: 51 domain tests and 7 React interaction tests pass; production build passes. Visual QA was done with headless Chrome against the dev server at 1440, 900 and 390 px widths; the captures in `screenshots/` are from that run. Functionality, demo roles and the prototype boundaries above are unchanged.

### Shirt photography and the trophy case

The four concept mockups in `../brandkit/shirts/` (front and back on a studio background) were cut out with a flood-fill background removal that keeps the soft contact shadow, and exported to `public/shirts/tier-{1..4}-{front|back}.webp` at 1000 px tall (45 to 60 KB each). `ShirtImage` in `src/ui.jsx` renders them; the earlier SVG shirt drawing is gone.

- **Rewards** is now a dark trophy case: a stage with the focused shirt floating over a tier-colored glow and an oversized tier numeral, a Front/Back toggle, the shirt's motto, progress ring, and either the fulfillment controls or an explore button. Locked shirts are dimmed with a lock seal; earned shirts get an EARNED seal. The collection strip below shows all four and switches the stage. The stage opens on the first shirt that still needs action (size, pickup) or on the current chapter.
- **My journey** hero shows the next shirt with the progress ring overlapping it, and the Next reward card shows the back print.
- Images load eagerly where they are above the fold and lazily elsewhere. A navy LAB favicon was added.

The cutout step is `scripts/shirt-cutouts.cjs` (needs `sharp`, installed on demand with `npm i --no-save sharp`); re-run it if the mockups change.

## Clubhouse: participation and recognition

Open **Clubhouse** in the navigation. This extends the skill system with class stars, trainer shoutouts, station participation, weekly crowns and star rewards. The detailed product rules and production requirements are in `../PRD-LAB-Clubhouse.md`; the original skill PRD now points to that extension.

Try the full flow:

1. In Athlete view, choose Leo, open Clubhouse and check into a class. Tap “I tried this station.” Both requests wait for trainer confirmation.
2. Switch to Coach, select Trainer tools, and confirm attendance followed by station participation. Return to My passport to see Leo's class star, first badge and station stamp, with no physical skill required.
3. Trainer tools supports selecting several demo athletes and giving the whole selected roster a class star once. Confirm attendance before giving a “Kept trying” recognition or recording a specific obstacle completion.
4. Station crowns lets a parent opt in with a nickname; trainers assign the age/skill group. Crown scores use unique completion days in the current Phoenix week, with shared ties.
5. In Star rewards, parents or trainers reserve a reward; trainers collect or cancel. Lifetime earnings remain visible separately from spendable stars. Existing verified skill badges contribute stars too.
6. Generate QR signs in Trainer tools. Each sign encodes a station-specific link; the class sign opens attendance. Use the links on this device or enter the printed LAB-GRIP / LAB-WALL / LAB-MOVE / LAB-HOOPS / LAB-COURSE codes. QR generation is real, but cross-device scanning at localhost cannot reach the desktop. Hosted authentication, shared records and session validation are still required for live gym use.

Daily sessions, station inventory, point weights and reward costs are pilot proposals. Class stars and stamps start empty so prior attendance is not fabricated. The same browser save/reset/export includes Clubhouse records. No production inventory, real-member identity, camera reader inside the app, or archived seasonal crown badges are implemented.

Validation: 51 domain tests and 7 React interaction tests pass. Tests cover pending approvals, duplicate scans, a 100-try milestone with zero skill unlocks, daily recognition limits, weekly crown ties/cohorts, point reservation and correction, roster attendance and six generated QR signs. Production build passes. Visual browser review remains blocked by the previously reported browser-control policy.

## UI v4: icon and shape cleanup (October 10, 2026)

Decorative icons and badge-like "bubbles" were removed so the brand, type and real artwork carry the design. Rules now in force:

- **Icons only where they do a job:** search field, select carets, close/dismiss, the phone bottom tab bar, a trailing → on text links, and done/not-yet marks in the prerequisite checklist. No icons in buttons, headings, cards, notes, toasts or empty states. Desktop and tablet navigation is text only (short labels between 760 and 1100 px instead of icon-only), and the Achievements count badge is gone.
- **Skill badges are numbered patches:** the hexagon shows the skill number in the category color (filled when earned, outlined when open, dashed when locked). The generic category glyphs and check/lock seals are gone.
- **Status is text, not a pill:** "Unlocked", "My goal", "Up next" and so on are colored labels.
- **One ring per page at most:** the hero keeps its ring around the next shirt. Tier cards, the rewards stage and Clubhouse milestones use thin linear meters.
- **Clubhouse:** the star total is a large gold number rather than a medallion, the four stat tiles are one divided strip, station cards use a colored edge instead of icon tiles, and the 14 milestone ring tiles are a two-column list of progress rows.
- **Rewards:** the EARNED/LOCKED seals and spec pills are gone; specs are one line of text.

Previous files are in `design-v3-backup/`. The two UI test assertions that relied on the nav count and the uppercase "UNLOCKED" chip were updated. Domain and React tests pass and the production build passes. The new design was checked in headless Chrome at 1440, 1000 and 390 px; the captures in `screenshots/` still show v3.

## UI v5: website alignment (October 10, 2026)

The app now uses the visual language of https://thelab.life/ instead of a dashboard template.

- **Masthead panel:** every page opens on an inset, rounded royal-to-navy gradient panel with the square-dot halftone and the outlined LEARN / ADAPT / BUILD lettering. The app bar floats over it and turns into an ink capsule on scroll. Page titles, the tier rail (Achievements, Coach desk), the Clubhouse star total and the Rewards stage live inside it.
- **Cutouts break the frame:** the home shirt and the Rewards stage shirt extend below the bottom edge of the panel, and collection shirts rise out of the top of their cards. The low-alpha contact shadow in `public/shirts/*.webp` was feathered toward the image edges so it no longer shows as a grey box on white.
- **Website surfaces:** pastel stat tiles (sky `#A1E2F7`, mint `#C2E6DB`, lime `#F0FEE0`) joined into one strip on Home, Clubhouse and the bonus achievements. Ink cards with the logo's A as a faint overlay for the tier rail and the Clubhouse milestone. A full-bleed ink footer with a slanted top edge and the LAB logo as a watermark.
- **Fewer colors:** the five rainbow category hues and the hexagon patches are gone. Skill numbers sit in rounded tiles: brand gradient when earned, pale cyan when open, an outlined numeral when locked. Tier colors are now used only for tier names and progress.
- **Buttons** follow the site: cyan primary, mint secondary.
- Home's three overview cards became the stat strip, and the hero stats moved into it.

Previous files are in `design-v4-backup/`. 51 domain tests and 7 React interaction tests pass, and the production build passes. Checked in headless Chrome at 1440 and 390 px, as Athlete (Theo) and as Coach (Maya).

### Movement pictograms on skill cards

Each skill card shows a faded pictogram of the movement behind its content (`src/moves.jsx`). The 18 poses are hang, monkey bars, wall catch, wall top-out, balance, stepping stones, landing, roll, shot, dribble, course, rings, cargo net, precision jump, rope, vault, pass and personal project. Each pose is a set of joint coordinates with its equipment drawn alongside. `skillPose` maps all 55 skill ids to a pose. The figures sit at 10% opacity (6% when locked) and fade out toward the text, rising slightly on hover. To use photography instead, swap `MoveArt` for an image per skill. The card CSS already handles opacity and the fade.

## Coach center, front desk kiosk and family moments (October 10, 2026)

A floor tool for coaches on a tablet or phone, a check-in kiosk for the front desk, and a parent Family page.

### Routes

- `?coach` opens the coach center directly (or choose Coach in the demo view and open **Coach center**). Coaches pick their name and enter a PIN. Demo PINs: Jordan 1111, Sam 2222, Priya 3333, Alex 9999 (head coach). The device locks after 10 minutes without a tap.
- `?kiosk` is the front desk. Parents hold up the family pass QR or type the family PIN, pick which kids are here, and check in or out.
- Parent view → **Family** shows the family pass QR and PIN, a kid pass QR per child, photo consent switches and the Moments gallery.

### Coach center

- **Now:** who is in the building, check-ins to confirm, rewards to hand out to kids who are here, care notes, kids one or two skills from a shirt, birthdays this week, today's schedule and latest arrivals.
- **Class:** the roster for a class with each kid's front-desk status. One button confirms everyone who checked in; tiles confirm one kid or mark a walk-in. Select mode gives a group "tried" or shoutout. A rotation timer cycles stations on this device.
- **Station:** pick your station; kids who are here are listed with goals at that station first. "Tried +2" records in one tap. Scan a kid or family pass to jump to a kid.
- **Kids:** search by first name, last name, parent name or family PIN; filter to who is here; recently opened kids.
- **Kid panel:** tried / completed (tap a preset task) / photo, shoutouts with the daily cap shown, skills ready at this station with goals first, assessment with a stepper for counts and a stopwatch for holds, tier progress, shirts and star rewards to hand over, staff-only notes with follow-ups, moments, recent records with corrections, check in/out.
- **Wrap-up:** pending check-ins with confirm-all, kids seen today with no shoutout, open follow-ups, and the coach's own totals for the day.
- **Head coach:** pause or reopen stations with a reason, mark reserved shirts ready, recognition by coach for the last 7 days, photo consent overview, kiosk tools.
- Every action shows a toast with Undo for 7 seconds. Unlocks open a full-screen celebration with an optional celebration photo.

### Rules added

- Front-desk check-in records presence. For a kid enrolled in a class that hasn't ended today, it also files a pending class attendance request; a coach confirms it.
- Open gym blocks (12:00–3:15 and 6:00–8:00 in the demo schedule) have no class star. Station tries, completions and shoutouts there need a front-desk check-in instead of class attendance.
- A coach recording anything for a kid confirms that kid's attendance (class) or check-in (open gym) in the same step.
- Gym days now count any day with a coach-confirmed record, so open-gym-only kids reach the gym-day milestones.
- A paused station rejects tries and completions.
- Photos need family consent. Parents can turn consent off (which removes the profile photo), hide a photo from their child's view, save it, or delete it. The coach who took a photo and the head coach can also delete it.

### Data

- `roster.js` adds 21 synthetic kids, 19 families, guardian names, family PINs, birthdays, class enrollment, four care notes and two families without photo consent. Seed progress for the new kids varies by position.
- `floor.js` holds presence, moments, notes, profile photos, consent and station pauses, plus selectors. Its records live in the same browser save as the rest of the app (`state.floor`).
- Photos are stored in this browser's IndexedDB (`media.js`) as a 1600 px JPEG and a 480 px thumbnail. Reset clears them.
- QR decoding uses the native BarcodeDetector where available and jsQR elsewhere. The camera needs HTTPS or localhost; over plain HTTP the photo button falls back to the device camera picker and the scanner falls back to typed codes.
- Tabs on the same device share saves, so a kiosk tab and a coach tab stay in step.

### Boundaries

Everything is still local to one browser. A kiosk tablet and a coach phone do not share check-ins, photos or stars until there is a backend with staff accounts, server-side rules, private photo storage and a signed, rotating family pass. PINs are a device lock, not authentication. Parent notifications are not sent.

Validation: 70 domain/club/floor tests and 13 React interaction tests pass (`npm.cmd test`, `npm.cmd run test:ui`); production build passes. Checked in headless Chrome at 390 × 844, 820 × 1180 and 1180 × 820, including the photo flow with Chrome's fake camera through to the parent Family page.

## Phone sign-in (October 12, 2026)

The app opens on a sign-in page. Parents and coaches enter their phone number and a 6-digit code. There are no passwords.

- **Who you are comes from your number.** A guardian's number opens their own family: the athlete picker lists only their kids, and the view picker offers Parent and Kid view. A staff number opens the Coach Center and can also view as Parent or Kid. Numbers that aren't on file are told to ask the front desk.
- **Sessions last 90 days** on that browser. Signing out is in the footer and in the Coach Center menu.
- **Code rules:** codes expire after 5 minutes, a new code can be sent after 30 seconds, and 5 wrong tries lock the number for 10 minutes. The code field uses `autocomplete="one-time-code"`, so phones offer to fill it from the text.
- **Coaches on their own phone** skip the PIN. **A shared gym iPad** is set up by the head coach (Head coach › Shared gym iPad); coaches then switch with their 4-digit PIN and it locks after 10 idle minutes.
- **The front desk kiosk** (`?kiosk`) does not sign in. In production it would be a registered device.

Demo: no text is sent; the code appears on screen. Demo numbers are listed under "Demo accounts" on the sign-in page (all in the fictional 555-0100–0199 range). `src/auth.js` holds the rules and a demo code service; a real texting service (for example Supabase phone auth with Twilio Verify) replaces `demoCodes` once LAB has those accounts.

## Coach floor MVP (October 12, 2026, `dev` branch)

Built from the Oct 10 call (Travis and Charlie) and the Oct 12 kickoff. Coaches are the users for now; parents see nothing new. Staff now sign in to **My day**, and the older tabbed Coach Center moved to the menu under **More tools**.

- **My day:** the coach's own blocks and their role in each (head coach, station coach, open gym), the live or next block with one button to start it, who works every block today, and "Covering for someone?" for picking up any block. Classes that ended while the coach still owes bonus picks show first.
- **Open gym:** one search box (name, last name, parent name, family PIN or any part of a parent's phone) that lists the whole family and checks several siblings in at once. Kids checked in at the front desk but not yet on the floor are listed with how long they've waited. Past due and "not at the front desk" are flagged but don't block the check-in, and they go on the manager's front-desk list. Each kid shows their next skill with a one-tap **Got it**. End of shift: 3 bonus picks.
- **Head coach, one class:** four steps.
  1. *Attendance:* tap kids in, mark every front-desk arrival at once, search anyone, and set beginner/intermediate/advanced the first time.
  2. *Groups:* sorted by age first, then level. The age rule (placeholder: a 5-year-old only with 6-year-olds, 7–12 within two years, teens within three) adds groups rather than mixing ages. Kids can be dragged or tapped between groups, and a coach is suggested for each station.
  3. *Class:* a shared rotation timer that flashes and beeps 90 seconds before each rotation, plus Rotate now and End class.
  4. *Wrap-up:* bonus picks by coach and skills unlocked.
- **Station coach:** the group currently at their station, each kid's next skill there (the head coach's chosen skills for the week come first), one-tap Got it, the next group, then bonus picks.
- **Colors:** only tenure gets color (first visit, first week, first 30 days, first 60 days). Levels are neutral chips.
- **Points:** Lab Coins under 10 and XP from 10. 5 for a class or open-gym check-in, 20–50 for a skill, 10 for each bonus pick (3 per coach per class).
- **Manage (gym manager):** *Team* shows per coach their check-ins, desk-to-floor wait, how many minutes after the start attendance got done, skills unlocked and bonus picks. *Front desk* shows today's flags. *Members* takes a pasted Spark export (`first,last,status,past_due,joined`). *Plans & crew* holds the weekly stations, skills to push and minutes per rotation, and who works each block.

Code: `src/gym.js` (rules, tested in `src/gym.test.js`), `src/CoachApp.jsx` and `src/coachapp.css` (UI, tested in `src/coachapp.test.jsx`). The coach floor uses the same shell as the kid and parent app: the floating bar with pill navigation (Today, Floor, Kids, Team or Plans), the gradient masthead, pastel stat tiles and ink highlight cards. A live class stays pinned in the bar.

Browser check: with `npm run dev` running, `node scripts/coach-e2e.mjs` drives Chrome through every coach flow at phone, tablet and desktop sizes (head coach to bonus picks, station, open gym, manager, permissions, kiosk and the kid and parent views), checks results, console errors and sideways overflow, and saves screenshots to `e2e-out/`.

The roster now has 38 synthetic kids, 27 families and 7 coaches, including a mixed-age homeschool class (10:00–11:00) to show the grouping.

Demo logins: Coach Jordan (head coach, homeschool and foundations), Coach Sam (station coach), Coach Priya (open gym), and Coach Alex (manager). Use **Simulate front-desk arrivals** in the coach menu, or the kiosk tab, to stand in for Spark/ABC check-ins.

Still not done: data stays in one browser. Tabs on one device share it, separate phones don't, so a station coach on their own phone won't see the head coach's groups until there's a shared backend. A Spark import only updates kids already on the roster. The age rule, station counts and point values are placeholders until the gym confirms them.

## Gym floor TV board (October 12, 2026)

Open `?tv` on the TVs in the gym. It's a 3D model of the building, built from the walkthrough photos and the coaches' Ninja Rotation Map, with every zone lit by what it's doing right now:

- **Gold:** a class is using the zone. A floating halo, the class name, and, once the class is running in Coach center, the group at that zone and a countdown to the next rotation.
- **Mint:** free for open gym. If a class will take the zone within 30 minutes, it says so ("class 3:30").
- **Red:** the station is paused by the head coach, with the reason.
- Shared spaces (café, lounge, golf, Little ninjas, arcade, front desk) get small grey labels. Outside opening hours everything reads closed, and the rail shows when the doors open.

The right rail shows the clock, each class in session with its zones, how many zones are free, paused stations, and the next three blocks. A spotlight card in the lower left tours the training zones every 10 seconds with a real photo of each (`public/floor/*.webp`), and the camera leans toward the toured zone. Tap a zone to hold it for 45 seconds. Drag to orbit and scroll to zoom. Moving the mouse shows **Whole floor** and **Edit floor**. Reduced-motion turns off the sway and pulse.

Zone status comes from the same records as the rest of the app: the day's schedule (`club.js`), class plans and running rotations (`gym.js`), and station pauses (`floor.js`). A zone takes part in classes through its station (grip, wall, movement, court or course). The rig is split so a class can hold L1–L3 while open gym uses L4–L6.

**Rotating and notes:** every zone has a facing. **Rotate** in the editor (or the R key) turns the tile a quarter turn about its center, and its 3D model turns with it. An arrow on the plan shows which way walls, the court, screens and rooms face. A zone can also carry a short note for the TV. The treadmill and bike games use one to explain that the game speeds up as you run or pedal faster, and their 3D model shows treadmills and bikes facing TVs whose games scroll at each rider's pace. Tapping any zone on the TV flies the camera to it.

**Reshaping the floor:** at `?tv&edit` (or **Edit floor**), the head coach drags zones to move them, drags the corner to resize, nudges with the arrow keys, and sets each zone's name, rotation-map code, 3D model and class station. Changes save with one **Save floor plan** into the same browser record; any board open in another tab on that device updates straight away. Other coaches see the editor locked. **Reset to the original plan** restores the first-pass layout.

The first-pass layout is an estimate from photos, not a survey: the default layout follows the walkthrough video (front door, merch divider, front desk with the fitness room behind it, interactive games then Little ninjas to the left). The current default is the head coach's corrected plan, with the front door in the south-east corner. Sizes are traced from the editor, in feet on a 190 × 240 ft footprint. **Preview any time of day** with `?tv&at=15:40`.

Files: `src/layout.js` (plan, validation and zone status, tested in `src/layout.test.js`), `src/floorScene.js` (three.js scene), `src/FloorTV.jsx`, `src/LayoutEditor.jsx`, `src/floortv.css`. Zone and scene colors are design tokens (`--ds-zone-*`, `--ds-scene-*`). three.js loads only on `?tv`, in its own chunk (about 147 KB gzipped). `scripts/floor-e2e.mjs` checks the board at 1080p (class, open gym, class soon, closed), the head-coach edit-and-save flow, the locked editor, and laptop and phone widths.

Photos with identifiable people were left out, because `public/` is published to the public Pages repo. The golf simulator has no photo yet.

Like the rest of the prototype, state lives in browser storage. A TV shows the records saved on that TV's own browser, so a live install needs the shared backend listed under the prototype boundaries.

## Coach staffing and the owner level (October 12, 2026, `dev` branch)

From Ally's and Natalie's feedback. A **Shifts** item in the coach bar opens it; a gold count shows requests waiting on a manager.

- **Three levels.** Coach, gym manager and owner. The owners, Charlie and Ally Mitchell (demo numbers 602-555-0157 and 0158), set the rules, standing hours and who manages, and are never booked into a block. Managers decide requests and fix gaps. Coaches see their own shift, requests and time split.
- **Right now / By the hour.** Every coach's status worked out from shifts, the day's crews, floaters and breaks: in class, open gym, floating, on break, available or off. The hour view is a half-hour grid with the current slot ringed.
- **Breaks.** A coach books a break from open slots only. A break that overlaps another coach's break is refused (the owner sets how many may overlap; default 1), as is one inside their own block or outside their shift.
- **Staffing check.** Each block against the class minimum (3), open-gym minimum (1), a required floater per class, and kids per coach (1:8, 1:5 when a class has a kid 6 or under, 1:10 at open gym). Kids come from the class roster or check-ins, or a manager's expected headcount for open gym. Gaps offer the best-fit free coaches to add for the day.
- **Requests.** Cover a block, a day off, or different hours. Free coaches can volunteer to cover; a manager approves or declines with a reply. Approvals change that day only and flow into My day, the class runner and station suggestions (`crewOn` in `gym.js`). Plans & crew still edits the weekly crew.
- **Time portfolios.** Each coach's target split across ninja classes, open gym and floater, at least 10% each (owner setting), shown against what's booked today. Fill-in suggestions favor the coach furthest under target for that kind of work.

Code: `src/staffing.js` (rules, tested in `src/staffing.test.js`), `src/Staffing.jsx` and `src/staffing.css` (screens, design tokens only). Data lives in `state.staffing` in the same browser save.

Placeholders until the gym confirms them: shift times, the three modalities, ratios, break limit and floater window (10 minutes either side of a class). Like everything else here, requests and approvals only reach other people once there's a shared backend.

### Gym map in the coach app, owners edit

The 3D gym floor board (`?tv`) now opens inside the coach app from the coach menu (**Gym map**), with a **Back to the app** button. Everyone on staff can look at it. Only Charlie and Ally Mitchell, the owners, see **Edit floor** and can save or reset the floor plan; anyone else opening `?tv&edit` sees the editor locked. The rule lives in `applyLayout` (`src/layout.js`), and sign-in now carries the owner flag (`src/auth.js`). On a phone the map's tools sit under the class rail so they can be tapped.
