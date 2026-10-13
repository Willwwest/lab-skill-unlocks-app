// The gym floor plan and what each zone is doing right now. The plan is a
// set of rectangles in feet on the building footprint (north up, the front
// door on the south wall); the TV draws it in 3D and the owners reshape
// it in the layout editor. Status comes from the day's schedule, the class
// plans and running rotations in gym.js, and station pauses in floor.js.
import { sessionPhase, sessions, stations } from "./club.js";
import { planFor, rotation, runOf, staffName } from "./gym.js";
import { gymMinutes as minutesAt, toMinutes } from "./gym-time.js";

// Feet. The front door is in the south-east corner of the south wall,
// door feet from the west wall.
export const BUILDING = { w: 190, d: 240, door: 172 };
// A class that starts this soon flags its zones on the board.
export const SOON_MINUTES = 30;

// What the 3D scene builds for a zone. The labels are for the editor.
export const arts = {
  rig: "Ninja rig",
  wall: "Warped wall",
  field: "Vault blocks",
  track: "Run track",
  court: "Basketball court",
  beam: "Balance beam",
  toddler: "Little ninjas",
  arcade: "Active games",
  golf: "Golf simulator",
  cafe: "Tables",
  desk: "Front desk",
  lounge: "Lounge",
  room: "Room",
  merch: "Merch racks",
  fitgames: "Treadmill & bike games",
};

// Which way a zone's model faces, by its rotation (clockwise, seen from
// above). At 0 the front of the model (a wall's run-up, the court's open
// side, the screens' viewers) faces the front of the building.
export const facing = {
  0: "the front",
  90: "the left wall",
  180: "the back wall",
  270: "the right wall",
};
// What a zone is, in a line, for the TV's spotlight card.
export const NOTE_MAX = 90;

/*
 * The head coach's corrected plan (October 12, 2026), traced from the floor
 * plan editor, with Charlie's October 13 edits to the back wall: the court,
 * restrooms, golf simulator and track wall turned, and L1–L2 drawn as rig.
 * North is the back wall; the front door is in the south-east corner. Inside the door: the front desk with the fitness room behind it,
 * the merch divider, then the interactive games and Little ninjas to the
 * left. Café and viewing in front of the rig, whose sections run east-west
 * across the middle; the run track and parent lounge run up the east wall.
 * Back half: advanced rig (A1–A4), track wall, vault blocks (SP), and along
 * the back wall the treadmill and bike games, party tables, basketball
 * court, restrooms and golf simulator. Sizes are traced, not measured.
 */
const z = (id, name, art, station, x, y, w, d, extra = {}) => ({
  id,
  name,
  art,
  station,
  x,
  y,
  w,
  d,
  photo: null,
  rotation: 0,
  ...extra,
});
const defaultZones = [
  // Back wall
  z("bike-games", "Treadmill & bike games", "fitgames", null, 3, 15, 47, 18, {
    note: "Run or pedal to play: the game on the TV speeds up as you go faster.",
  }),
  z("court", "Basketball court", "court", "court", 53, 0, 59, 32, {
    photo: "court",
    rotation: 270,
  }),
  z("restrooms", "Restrooms & water", "room", null, 143, 0, 27, 12, {
    rotation: 90,
  }),
  z("golf", "Golf simulator", "golf", null, 139, 13, 50, 19, {
    rotation: 90,
  }),
  z("party", "Party tables", "cafe", null, 16, 34, 43, 20, { photo: "party" }),
  z("vault", "Vault blocks", "field", "movement", 66, 32, 88, 22, {
    code: "SP",
    photo: "vault",
  }),
  // Rig, back to front
  z("advanced", "Advanced rig", "rig", "course", 0, 54, 129, 28, {
    code: "A1–A4",
    photo: "advanced",
  }),
  z("track-wall", "Track wall", "wall", "wall", 129, 60, 27, 26, {
    photo: "track-wall",
    rotation: 270,
  }),
  z("rig-course", "Course lanes", "rig", "course", 17, 87, 138, 32, {
    code: "L4–L6",
    photo: "rig-course",
  }),
  z("rig-grip", "Grip lanes", "rig", "grip", 16, 119, 139, 26, {
    code: "L1–L3",
    photo: "rig-grip",
  }),
  z("red-walls", "L1–L2", "rig", "wall", 16, 145, 139, 23, {
    code: "WW",
    photo: "red-walls",
  }),
  z("beam", "Balance beam", "beam", "movement", 115, 168, 34, 8),
  // East wall
  z("track", "Run track", "track", null, 156, 38, 14, 146, { photo: "track" }),
  z("lounge", "Parent lounge", "lounge", null, 170, 40, 16, 146, {
    photo: "lounge",
  }),
  // Front
  z("toddler", "Little ninjas", "toddler", null, 3, 168, 53, 71, {
    photo: "toddler",
  }),
  z("cafe", "Café & viewing", "cafe", null, 63, 176, 87, 33, { photo: "cafe" }),
  // The game TVs hang on the front wall, facing into the gym.
  z("arcade", "Interactive games", "arcade", null, 61, 212, 54, 28, {
    photo: "arcade",
    rotation: 180,
  }),
  z("merch", "Merch", "merch", null, 116, 211, 28, 29),
  // Its window looks back over the floor.
  z("fitness", "Fitness room", "room", null, 156, 187, 31, 16, {
    photo: "fitness",
    rotation: 180,
  }),
  z("desk", "Front desk", "desk", null, 154, 204, 36, 15, { photo: "desk" }),
];

export const defaultLayout = () => ({
  version: 1,
  zones: structuredClone(defaultZones),
  by: null,
  at: null,
});

const MIN = 4;
const inside = (z) =>
  z.x >= 0 &&
  z.y >= 0 &&
  z.w >= MIN &&
  z.d >= MIN &&
  z.x + z.w <= BUILDING.w &&
  z.y + z.d <= BUILDING.d;

export function validZone(z) {
  return (
    !!z &&
    typeof z.id === "string" &&
    /^[a-z0-9-]{1,40}$/.test(z.id) &&
    typeof z.name === "string" &&
    z.name.trim().length > 0 &&
    z.name.length <= 40 &&
    z.art in arts &&
    (z.station === null || stations.some((s) => s.id === z.station)) &&
    ["x", "y", "w", "d"].every((k) => Number.isFinite(z[k])) &&
    [undefined, 0, 90, 180, 270].includes(z.rotation) &&
    (z.note === undefined ||
      (typeof z.note === "string" && z.note.length <= NOTE_MAX)) &&
    inside(z)
  );
}

export function validLayout(l) {
  return (
    !!l &&
    l.version === 1 &&
    Array.isArray(l.zones) &&
    l.zones.length > 0 &&
    l.zones.length <= 60 &&
    l.zones.every(validZone) &&
    new Set(l.zones.map((z) => z.id)).size === l.zones.length
  );
}

export const layoutOf = (state) =>
  validLayout(state?.layout) ? state.layout : defaultLayout();

// Keeps a dragged or resized zone on the footprint, on a 1-foot grid.
export function clampZone(z) {
  const w = Math.round(Math.min(Math.max(z.w, MIN), BUILDING.w));
  const d = Math.round(Math.min(Math.max(z.d, MIN), BUILDING.d));
  return {
    ...z,
    w,
    d,
    x: Math.round(Math.min(Math.max(z.x, 0), BUILDING.w - w)),
    y: Math.round(Math.min(Math.max(z.y, 0), BUILDING.d - d)),
  };
}

// Turns a zone a quarter clockwise about its center: the footprint swaps
// width and depth and the model turns with it.
export function turnZone(z) {
  const cx = z.x + z.w / 2;
  const cy = z.y + z.d / 2;
  return clampZone({
    ...z,
    w: z.d,
    d: z.w,
    x: cx - z.d / 2,
    y: cy - z.w / 2,
    rotation: ((z.rotation ?? 0) + 90) % 360,
  });
}

export function newZoneId(zones, name) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "zone";
  let id = base;
  for (let n = 2; zones.some((z) => z.id === id); n++) id = `${base}-${n}`;
  return id;
}

// Only the owners reshape the floor; everyone sees the result.
export function applyLayout(state, action, now = new Date()) {
  const { actor = {} } = action;
  if (actor.role !== "Coach" || !actor.owner)
    throw Error("Only the owners can change the floor plan.");
  switch (action.type) {
    case "save": {
      const zones = (action.zones ?? []).map((z) => ({
        ...z,
        name: String(z.name ?? "").trim(),
        station: z.station || null,
        rotation: z.rotation ?? 0,
        note: z.note?.trim() || undefined,
      }));
      const next = {
        version: 1,
        zones,
        by: actor.name,
        at: new Date(now).toISOString(),
      };
      if (!zones.length) throw Error("Keep at least one zone on the floor.");
      const bad = zones.find((z) => !validZone(z));
      if (bad)
        throw Error(
          bad.name
            ? `${bad.name} needs a name, a type and a spot inside the building.`
            : "Every zone needs a name.",
        );
      if (!validLayout(next)) throw Error("Two zones share an id.");
      return { ...state, layout: next };
    }
    case "reset":
      return { ...state, layout: defaultLayout() };
    default:
      throw Error("Unknown layout action.");
  }
}

/* ---------- What each zone is doing ---------- */

// Open from the first block of the day to the last.
export function openHours(at = new Date()) {
  const list = sessions(at);
  const start = Math.min(...list.map((s) => toMinutes(s.start)));
  const end = Math.max(...list.map((s) => toMinutes(s.end)));
  return { start, end, open: minutesAt(at) >= start && minutesAt(at) < end };
}

// The stations a class block uses: the running rotation if there is one,
// otherwise the saved plan.
export function classStations(state, block) {
  const run = runOf(state, block.id);
  if (run?.stations?.length) return run.stations;
  return planFor(state, block.index).stations.map((s) => s.station);
}

function classAt(state, block, station, at) {
  const run = runOf(state, block.id);
  const r = rotation(run, at);
  const info = {
    session: block.id,
    name: block.name,
    ages: block.ages ?? null,
    lead: block.lead ?? null,
    end: block.end,
    group: null,
    kids: null,
    coach: null,
    rotateIn: null,
  };
  if (run?.groups && r && !r.done) {
    const g = r.groupAt(station);
    if (g >= 0) {
      info.group = g + 1;
      info.kids = run.groups[g]?.length ?? 0;
      info.rotateIn = r.left;
      info.round = r.idx + 1;
      info.rounds = r.total;
    }
  }
  if (run?.coaches?.[station]) info.coach = staffName(run.coaches[station]);
  return info;
}

/*
 * One entry per zone:
 *   status  "class" | "open" | "paused" | "closed" | "amenity"
 *   class   the class using it (name, ages, coach, group, rotation)
 *   soon    a class taking it within SOON_MINUTES ({ name, start })
 *   reason  why a station is paused
 */
export function floorStatus(state, at = new Date()) {
  const layout = layoutOf(state);
  const hours = openHours(at);
  const blocks = sessions(at);
  const live = blocks.filter((s) => sessionPhase(s, at) === "live");
  const liveClasses = live.filter((s) => s.kind === "class");
  const now = minutesAt(at);
  const upcoming = blocks
    .filter(
      (s) =>
        s.kind === "class" &&
        sessionPhase(s, at) === "upcoming" &&
        toMinutes(s.start) - now <= SOON_MINUTES,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const outages = state.floor?.outages ?? {};
  const zones = layout.zones.map((z) => {
    const base = { ...z, class: null, soon: null, reason: null };
    if (!z.station)
      return { ...base, status: hours.open ? "amenity" : "closed" };
    if (!hours.open) return { ...base, status: "closed" };
    if (outages[z.station])
      return { ...base, status: "paused", reason: outages[z.station].reason };
    const using = liveClasses.find((b) =>
      classStations(state, b).includes(z.station),
    );
    if (using)
      return {
        ...base,
        status: "class",
        class: classAt(state, using, z.station, at),
      };
    const next = upcoming.find((b) =>
      classStations(state, b).includes(z.station),
    );
    return {
      ...base,
      status: "open",
      soon: next ? { name: next.name, start: next.start } : null,
    };
  });
  return {
    zones,
    hours,
    live,
    liveClasses,
    next: blocks
      .filter((s) => sessionPhase(s, at) === "upcoming")
      .sort((a, b) => a.start.localeCompare(b.start)),
  };
}
