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
