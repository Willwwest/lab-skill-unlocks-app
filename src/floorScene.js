// The gym floor for the TV board, drawn like an architectural model: a dark
// slab, one plinth per zone whose colour is the zone's status, and the
// equipment as plain white massing on top. Plain three.js, no React:
// FloorTV owns the overlay and calls in here to build zones, colour them,
// switch between the 3D view and the overhead plan, and project labels.
// Units are feet; the plan's (x, y) maps to (X, Z) with the building
// centered on the origin, north (the back wall) toward -Z.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BUILDING } from "./layout.js";
import { color as C, scene as S, zone as Z } from "./ds/tokens.js";

const W = BUILDING.w;
const D = BUILDING.d;
// The 3D view looks in from the front-door corner.
const HERO = { azimuth: 0.48, polar: 0.9 };
const PLINTH = 0.8;

const matte = (color, roughness = 0.9) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
const M = {
  slab: matte(S.floor, 1),
  mass: matte(S.white, 0.85),
  soft: matte(C.gray300, 0.95),
  dark: matte(S.black, 0.8),
  glass: new THREE.MeshStandardMaterial({
    color: S.white,
    transparent: true,
    opacity: 0.22,
    roughness: 0.2,
  }),
  line: new THREE.MeshBasicMaterial({ color: S.white }),
  screen: new THREE.MeshBasicMaterial({
    color: new THREE.Color(S.void).lerp(new THREE.Color(S.screen), 0.35),
  }),
};
const shared = new Set(Object.values(M));
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 32);

function box(g, m, x, z, w, h, d, y = 0) {
  const mesh = new THREE.Mesh(boxGeo, m);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function cyl(g, m, x, z, r, h, y = 0) {
  const mesh = new THREE.Mesh(cylGeo, m);
  mesh.scale.set(r, h, r);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// A painted line or flat panel on the plinth.
const paint = (g, m, x, z, w, d) => box(g, m, x, z, w, 0.04, d, 0.02);

/* ---------- Equipment ---------- */

// The runner game on the treadmill and bike TVs: a strip that wraps and
// scrolls at each rider's pace. Drawn once, cloned per screen.
let gameTexture = null;
function gameArt() {
  if (gameTexture) return gameTexture;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = S.void;
  x.fillRect(0, 0, 512, 256);
  x.fillStyle = S.screen;
  x.globalAlpha = 0.5;
  x.fillRect(0, 170, 512, 3);
  for (let i = 0; i < 512; i += 48) x.fillRect(i, 200, 22, 3);
  x.globalAlpha = 0.9;
  for (const h of [96, 300, 430]) x.fillRect(h, 130, 6, 40);
  x.fillStyle = S.white;
  x.fillRect(150, 128, 12, 42);
  gameTexture = new THREE.CanvasTexture(c);
  gameTexture.wrapS = THREE.RepeatWrapping;
  gameTexture.repeat.set(0.5, 1);
  gameTexture.colorSpace = THREE.SRGBColorSpace;
  return gameTexture;
}

/*
 * One builder per kind of zone. Each draws on a w x d footprint centered on
 * the origin with its front (a wall's run-up, the court's open side, the
 * side screens face) toward +Z, and returns how tall it stands so labels
 * clear it. The zone's rotation turns the result.
 */
const build = {
  rig(g, w, d, z) {
    const advanced = z.id.includes("advanced");
    const H = advanced ? 15 : 12;
    const deck = advanced ? 3 : 0;
    if (deck) box(g, M.soft, 0, 0, w - 3, deck, d - 3);
    const along = w >= d;
    const L = along ? w : d;
    const S2 = along ? d : w;
    const at = (a, b) => (along ? [a, b] : [b, a]);
    const bays = Math.max(2, Math.round(L / 16));
    const step = (L - 4) / bays;
    for (let i = 0; i <= bays; i++) {
      const t = -L / 2 + 2 + i * step;
      for (const side of [-1, 1]) {
        const [x, zz] = at(t, (side * (S2 - 3)) / 2);
        box(g, M.mass, x, zz, 1.1, H, 1.1);
      }
      const [x, zz] = at(t, 0);
      box(
        g,
        M.mass,
        x,
        zz,
        ...(along ? [0.6, 0.6, S2 - 3] : [S2 - 3, 0.6, 0.6]),
        H,
      );
    }
    for (const side of [-1, 1]) {
      const [x, zz] = at(0, (side * (S2 - 3)) / 2);
      box(
        g,
        M.mass,
        x,
        zz,
        ...(along ? [L - 4, 0.7, 0.7] : [0.7, 0.7, L - 4]),
        H,
      );
    }
    // Landing mats under every other bay.
    for (let i = 0; i < bays; i += 2) {
      const [x, zz] = at(-L / 2 + 2 + (i + 0.5) * step, 0);
      box(
        g,
        M.soft,
        x,
        zz,
        ...(along ? [step * 0.7, 1, S2 * 0.45] : [S2 * 0.45, 1, step * 0.7]),
        deck,
      );
    }
    return H + 2;
  },
  wall(g, w, d) {
    const count = Math.min(4, Math.max(1, Math.round(w / 30)));
    const width = (w / count) * 0.78;
    const H = Math.min(15, 8 + d * 0.3);
    const R = Math.max(3, Math.min(d - 5, H));
    // Quarter-pipe profile, extruded across each wall's width.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(R, 0);
    shape.lineTo(R, H);
    shape.lineTo(R - 1, H);
    shape.absarc(0, H, R - 1, 0, -Math.PI / 2, true);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: false,
    });
    const back = -d / 2 + 3;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, M.mass);
      m.castShadow = m.receiveShadow = true;
      // A quarter turn sends the run-up toward +Z and the extrusion along +X.
      m.rotation.y = Math.PI / 2;
      const left = -w / 2 + (i + 0.5) * (w / count) - width / 2;
      m.position.set(left, 0, back + R);
      g.add(m);
      box(g, M.dark, left + width / 2, back - 1.5, width, 1, 3, H - 1);
    }
    return H + 2;
  },
  field(g, w, d, z) {
    // Vault blocks in tidy rows, alternating direction.
    const wedge = new THREE.ExtrudeGeometry(
      new THREE.Shape([
        new THREE.Vector2(-2, 0),
        new THREE.Vector2(2, 0),
        new THREE.Vector2(2, 2.4),
      ]),
      { depth: 3, bevelEnabled: false },
    );
    wedge.translate(0, 0, -1.5);
    const cols = Math.max(1, Math.floor(w / 10));
    const rows = Math.max(1, Math.floor(d / 9));
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = -w / 2 + ((i + 0.5) * w) / cols;
        const zz = -d / 2 + ((j + 0.5) * d) / rows;
        if ((i + j + z.id.length) % 3 === 0) {
          box(g, M.soft, x, zz, 3, 1.6, 3);
          continue;
        }
        const m = new THREE.Mesh(wedge, (i + j) % 2 ? M.mass : M.soft);
        m.position.set(x, 0, zz);
        m.rotation.y = (i + j) % 2 ? 0 : Math.PI;
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }
    return 5;
  },
  track(g, w, d) {
    const along = d >= w;
    const S2 = along ? w : d;
    for (let i = 1; i < 5; i++) {
      const off = -S2 / 2 + (i * S2) / 5;
      if (along) paint(g, M.line, off, 0, 0.25, d - 3);
      else paint(g, M.line, 0, off, w - 3, 0.25);
    }
    return 2;
  },
  court(g, w, d) {
    const base = -d / 2 + 1.5;
    paint(g, M.line, 0, base, w - 4, 0.3);
    paint(g, M.line, 0, d / 2 - 1.5, w - 4, 0.3);
    const r = Math.min(w * 0.36, d - 5);
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.35, 64, 1, Math.PI, Math.PI),
      M.line,
    );
    arc.rotation.x = -Math.PI / 2;
    arc.position.set(0, 0.06, base);
    g.add(arc);
    for (const x of [-5, 5]) paint(g, M.line, x, base + 6, 0.3, 12);
    paint(g, M.line, 0, base + 12, 10, 0.3);
    box(g, M.mass, 0, base, 0.5, 10, 0.5);
    box(g, M.mass, 0, base + 0.8, 6, 3.5, 0.25, 9);
    return 13;
  },
  beam(g, w, d) {
    const along = d >= w;
    const L = (along ? d : w) - 3;
    box(g, M.mass, 0, 0, along ? 0.6 : L, 0.5, along ? L : 0.6, 2);
    for (const s of [-1, 1])
      box(
        g,
        M.soft,
        ...(along ? [0, (s * L) / 2.6] : [(s * L) / 2.6, 0]),
        1.2,
        2,
        1.2,
      );
    return 4;
  },
  toddler(g, w, d) {
    const r = Math.min(w, d) / 5;
    const dome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshBasicMaterial({
        color: S.white,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
      }),
    );
    dome.position.set(w / 5, 0, -d / 5);
    g.add(dome);
    box(g, M.mass, -w / 4, -d / 4, 5, 4, 4);
    box(g, M.soft, -w / 5, d / 5, w / 3, 0.6, d / 3);
    return r + 3;
  },
  arcade(g, w, d) {
    const n = Math.max(2, Math.round(w / 12));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      box(g, M.dark, x, -d / 2 + 1.2, 7, 6.5, 0.8);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.6), M.screen);
      s.position.set(x, 4.4, -d / 2 + 1.65);
      g.add(s);
    }
    return 8;
  },
  fitgames(g, w, d) {
    const n = Math.max(2, Math.floor(w / 9));
    const art = gameArt();
    const screens = [];
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      const wall = -d / 2 + 1.2;
      box(g, M.dark, x, wall - 0.4, 6.6, 4.2, 0.5, 4);
      const tex = art.clone();
      tex.needsUpdate = true;
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 3.4),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      screen.position.set(x, 6.1, wall);
      g.add(screen);
      const at = -d / 2 + 6.5;
      if (i % 2 === 0) {
        // Treadmill: deck and console toward the screen.
        box(g, M.mass, x, at + 1, 2.6, 0.7, 6);
        box(g, M.mass, x, at - 1.8, 2.6, 0.8, 0.8, 3.6);
        for (const s of [-1, 1])
          box(g, M.mass, x + s * 1.1, at - 1.8, 0.25, 3.6, 0.25);
      } else {
        // Bike: frame, flywheel and seat.
        box(g, M.mass, x, at + 0.5, 0.8, 0.5, 4);
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.2, 10, 28),
          M.mass,
        );
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(x, 1.2, at - 1.3);
        g.add(wheel);
        box(g, M.mass, x, at + 1.6, 0.3, 3, 0.3, 0.5);
        box(g, M.mass, x, at + 1.6, 1, 0.3, 1.4, 3.5);
      }
      screens.push({ tex, phase: i * 1.7 });
    }
    // Riders speed up and ease off; each game keeps its rider's pace.
    g.userData.tick = (t, dt) => {
      for (const s of screens) {
        const pace = 0.5 + 0.5 * Math.sin(t * 0.45 + s.phase);
        s.tex.offset.x = (s.tex.offset.x + (0.04 + pace * 0.3) * dt) % 1;
      }
    };
    return 9;
  },
  golf(g, w, d) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 8), M.screen);
    s.position.set(0, 5, -d / 2 + 2);
    g.add(s);
    for (const x of [-w * 0.32, w * 0.32])
      box(g, M.mass, x, -d / 2 + 2, 0.7, 10, 0.7);
    box(g, M.mass, 0, -d / 2 + 2, w * 0.64 + 0.7, 0.7, 0.7, 10);
    box(g, M.soft, 0, d / 6, 5, 0.3, 5);
    box(g, M.dark, 0, d / 3, w * 0.45, 2, 2.6);
    return 12;
  },
  cafe(g, w, d, z) {
    if (/party/i.test(z.name)) {
      const rows = Math.max(1, Math.floor(d / 9));
      const cols = Math.max(1, Math.floor(w / 13));
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = -w / 2 + ((i + 0.5) * w) / cols;
          const zz = -d / 2 + ((j + 0.5) * d) / rows;
          box(g, M.mass, x, zz, 9, 0.4, 3, 2.4);
          for (const s of [-1, 1]) box(g, M.soft, x, zz + s * 2.3, 9, 1.5, 0.9);
        }
      return 4;
    }
    const cols = Math.max(1, Math.floor(w / 11));
    const rows = Math.max(1, Math.floor(d / 11));
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = -w / 2 + ((i + 0.5) * w) / cols;
        const zz = -d / 2 + ((j + 0.5) * d) / rows;
        cyl(g, M.mass, x, zz, 1.5, 0.2, 3.2);
        cyl(g, M.soft, x, zz, 0.15, 3.2);
      }
    return 5;
  },
  desk(g, w, d) {
    box(g, M.soft, 0, -d / 5, w * 0.7, 9, d * 0.45);
    box(g, M.mass, 0, d / 5, w * 0.6, 3.4, 2.2);
    return 11;
  },
  lounge(g, w, d) {
    const along = d >= w;
    const L = along ? d : w;
    const n = Math.max(2, Math.round(L / 22));
    for (let i = 0; i < n; i++) {
      const t = -L / 2 + ((i + 0.5) * L) / n;
      const [x, z] = along ? [w / 5, t] : [t, d / 5];
      if (i % 2) box(g, M.glass, x, z, 4, 7.5, 4);
      else box(g, M.dark, x, z, along ? 3 : 10, 2, along ? 10 : 3);
    }
    return 8;
  },
  room(g, w, d) {
    for (const [x, z, ww, dd] of [
      [0, -d / 2 + 0.4, w, 0.8],
      [-w / 2 + 0.4, 0, 0.8, d],
      [w / 2 - 0.4, 0, 0.8, d],
    ])
      box(g, M.soft, x, z, ww, 8, dd);
    box(g, M.glass, 0, d / 2 - 0.4, w - 1, 8, 0.3);
    return 10;
  },
  merch(g, w, d) {
    const along = w >= d;
    const L = along ? w : d;
    const n = Math.max(2, Math.round(L / 9));
    for (let i = 0; i < n; i++) {
      const t = -L / 2 + ((i + 0.5) * L) / n;
      box(
        g,
        M.dark,
        ...(along ? [t, 0] : [0, t]),
        along ? 5 : 2,
        5,
        along ? 2 : 5,
      );
    }
    return 7;
  },
};

/* ---------- Status colours ---------- */

const mix = (tone, k) =>
  new THREE.Color(S.floor).lerp(new THREE.Color(tone), k);
// The plinth's fill and its edge for each status. Classes read strongest;
// shared spaces stay quiet.
const look = {
  class: { fill: mix(Z.class, 0.62), edge: new THREE.Color(Z.class) },
  open: { fill: mix(Z.open, 0.34), edge: new THREE.Color(Z.open) },
  paused: { fill: mix(Z.paused, 0.5), edge: new THREE.Color(Z.paused) },
  amenity: { fill: mix(Z.amenity, 0.16), edge: mix(Z.amenity, 0.4) },
  closed: { fill: mix(Z.closed, 0.2), edge: mix(Z.closed, 0.5) },
};
const selectedEdge = new THREE.Color(S.white);

/* ---------- Scene ---------- */

export function createFloorScene(canvas, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(S.void);

  scene.add(new THREE.HemisphereLight(S.white, S.void, 1.1));
  const sun = new THREE.DirectionalLight(S.white, 1.4);
  sun.position.set(70, 220, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -140,
    right: 140,
    top: 160,
    bottom: -160,
    near: 10,
    far: 600,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);

  // The building: a slab, a faint 10-foot grid and a marker at the door.
  const slabMesh = box(scene, M.slab, 0, 0, W + 4, 2, D + 4, -2);
  slabMesh.castShadow = false;
  const grid = new THREE.GridHelper(
    Math.max(W, D),
    Math.max(W, D) / 10,
    S.white,
    S.white,
  );
  grid.material.transparent = true;
  grid.material.opacity = 0.035;
  grid.position.y = 0.02;
  scene.add(grid);
  const door = new THREE.Mesh(
    boxGeo,
    new THREE.MeshBasicMaterial({ color: Z.open }),
  );
  door.scale.set(10, 0.1, 1.2);
  door.position.set(-W / 2 + (BUILDING.door ?? W / 2), 0.05, D / 2 + 1.4);
  scene.add(door);

  // Cameras: a perspective camera for 3D and an orthographic one for the
  // overhead plan, north up. Each has its own controls; one is live.
  const persp = new THREE.PerspectiveCamera(30, 16 / 9, 1, 4000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  ortho.up.set(0, 0, -1);
  ortho.position.set(0, 800, 0);
  ortho.lookAt(0, 0, 0);
  const orbit = new OrbitControls(persp, canvas);
  Object.assign(orbit, {
    enableDamping: true,
    dampingFactor: 0.08,
    minDistance: 60,
    maxDistance: 900,
    maxPolarAngle: 1.3,
  });
  const plan = new OrbitControls(ortho, canvas);
  Object.assign(plan, {
    enableRotate: false,
    enableDamping: true,
    dampingFactor: 0.1,
    screenSpacePanning: true,
    minZoom: 0.8,
    maxZoom: 5,
  });
  let view = "3d";
  let camera = persp;
  plan.enabled = false;

  let zones = new Map();
  const root = new THREE.Group();
  scene.add(root);

  function clear() {
    for (const z of zones.values())
      z.group.traverse((o) => {
        if (o.geometry && o.geometry !== boxGeo && o.geometry !== cylGeo)
          o.geometry.dispose();
        if (o.material?.map && o.material.map !== gameTexture)
          o.material.map.dispose();
        if (o.material && !shared.has(o.material)) o.material.dispose();
      });
    root.clear();
    zones = new Map();
  }

  function setZones(list) {
    clear();
    for (const z of list) {
      const group = new THREE.Group();
      group.position.set(z.x + z.w / 2 - W / 2, 0, z.y + z.d / 2 - D / 2);
      // The plinth carries the status colour; a hairline edge outlines it.
      const plinth = box(
        group,
        matte(S.floor, 0.95),
        0,
        0,
        z.w - 1.2,
        PLINTH,
        z.d - 1.2,
      );
      plinth.castShadow = false;
      const edgeMat = new THREE.MeshBasicMaterial({ color: S.white });
      for (const [x, zz, ww, dd] of [
        [0, -(z.d - 1.2) / 2, z.w - 1.2, 0.35],
        [0, (z.d - 1.2) / 2, z.w - 1.2, 0.35],
        [-(z.w - 1.2) / 2, 0, 0.35, z.d - 1.2],
        [(z.w - 1.2) / 2, 0, 0.35, z.d - 1.2],
      ]) {
        const e = new THREE.Mesh(boxGeo, edgeMat);
        e.scale.set(ww, 0.06, dd);
        e.position.set(x, PLINTH + 0.03, zz);
        group.add(e);
      }
      // Models are built facing the front, then turned with the zone. A
      // quarter turn builds on the swapped footprint so it lands on w x d.
      const turn = z.rotation ?? 0;
      const [bw, bd] = turn % 180 ? [z.d, z.w] : [z.w, z.d];
      const art = new THREE.Group();
      const top = (build[z.art] ?? build.room)(art, bw - 2, bd - 2, z) + PLINTH;
      art.rotation.y = (-turn * Math.PI) / 180;
      art.position.y = PLINTH;
      group.add(art);
      const hit = new THREE.Mesh(
        boxGeo,
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.scale.set(z.w, top, z.d);
      hit.position.y = top / 2;
      hit.userData.zoneId = z.id;
      group.add(hit);
      root.add(group);
      zones.set(z.id, {
        zone: z,
        group,
        plinth,
        edgeMat,
        hit,
        top,
        tick: art.userData.tick,
        status: "closed",
      });
    }
    paint();
  }

  let selected = null;
  function paint() {
    for (const [id, z] of zones) {
      const l = look[z.status] ?? look.amenity;
      z.plinth.material.color.copy(l.fill);
      z.edgeMat.color.copy(id === selected ? selectedEdge : l.edge);
    }
  }
  function setStatus(list) {
    for (const s of list) {
      const z = zones.get(s.id);
      if (z) z.status = s.status;
    }
    paint();
  }

  /* Camera moves: eased flights that stop once they arrive or the moment
     someone grabs the view. */
  let flight = null;
  const sph = new THREE.Spherical();
  const v = new THREE.Vector3();
  const fitDistance = () => {
    const r = Math.hypot(W, D) / 2;
    const vHalf = THREE.MathUtils.degToRad(persp.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * persp.aspect);
    return (r / Math.sin(Math.min(vHalf, hHalf))) * 0.82;
  };
  const fly = (target, radius) => {
    flight = {
      target: target.clone(),
      radius,
      theta: HERO.azimuth,
      phi: HERO.polar,
    };
    if (reducedMotion) step(1);
  };
  function step(k) {
    if (!flight) return;
    orbit.target.lerp(flight.target, k);
    sph.setFromVector3(v.copy(persp.position).sub(orbit.target));
    sph.radius += (flight.radius - sph.radius) * k;
    sph.theta += (flight.theta - sph.theta) * k;
    sph.phi += (flight.phi - sph.phi) * k;
    persp.position.setFromSpherical(sph).add(orbit.target);
    persp.lookAt(orbit.target);
    if (
      orbit.target.distanceTo(flight.target) < 0.2 &&
      Math.abs(sph.radius - flight.radius) < 0.5
    )
      flight = null;
  }
  const stopFlight = () => (flight = null);
  canvas.addEventListener("pointerdown", stopFlight);
  canvas.addEventListener("wheel", stopFlight, { passive: true });

  function fitPlan() {
    const a = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const halfH = Math.max(D / 2, W / 2 / a) * 1.08;
    Object.assign(ortho, {
      left: -halfH * a,
      right: halfH * a,
      top: halfH,
      bottom: -halfH,
    });
    ortho.zoom = 1;
    plan.target.set(0, 0, 0);
    ortho.position.set(0, 800, 0);
    ortho.updateProjectionMatrix();
  }

  function home() {
    selected = null;
    paint();
    if (view === "top") return fitPlan();
    fly(new THREE.Vector3(0, 0, 0), fitDistance());
  }
  // Highlight a zone; in 3D, fly in to it.
  function focus(id) {
    selected = id && zones.has(id) ? id : null;
    paint();
    if (!selected) return home();
    if (view !== "3d") return;
    const z = zones.get(selected);
    fly(
      new THREE.Vector3(z.group.position.x, z.top * 0.2, z.group.position.z),
      Math.max(90, Math.max(z.zone.w, z.zone.d) * 2.4),
    );
  }
  function setView(next) {
    view = next === "top" ? "top" : "3d";
    camera = view === "top" ? ortho : persp;
    orbit.enabled = view === "3d";
    plan.enabled = view === "top";
    flight = null;
    resize();
    if (view === "top") fitPlan();
    else if (selected) focus(selected);
    else home();
  }

  const ray = new THREE.Raycaster();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    const hits = ray.intersectObjects(
      [...zones.values()].map((z) => z.hit),
      false,
    );
    return hits[0]?.object.userData.zoneId ?? null;
  }

  // Where each zone's label goes, in CSS pixels: above the model in 3D, on
  // the zone's center in the plan.
  function project() {
    const r = canvas.getBoundingClientRect();
    const out = {};
    for (const [id, z] of zones) {
      v.set(
        z.group.position.x,
        view === "top" ? 0 : z.top,
        z.group.position.z,
      ).project(camera);
      out[id] = {
        x: ((v.x + 1) / 2) * r.width,
        y: ((1 - v.y) / 2) * r.height,
        behind: v.z > 1,
      };
    }
    return out;
  }

  let first = true;
  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.fov = w / h < 1.2 ? 46 : 30;
    persp.updateProjectionMatrix();
    if (view === "top") fitPlan();
    if (first) {
      first = false;
      sph.set(fitDistance(), HERO.polar, HERO.azimuth);
      persp.position.setFromSpherical(sph);
      persp.lookAt(0, 0, 0);
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let frame = 0;
  let onFrame = null;
  let last = 0;
  const clock = new THREE.Clock();
  function tick() {
    frame = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, t - last);
    last = t;
    if (!reducedMotion) for (const z of zones.values()) z.tick?.(t, dt);
    if (view === "3d") {
      step(0.06);
      if (!flight) orbit.update();
    } else plan.update();
    renderer.render(scene, camera);
    onFrame?.(project(), view);
  }
  tick();

  return {
    setZones,
    setStatus,
    setView,
    focus,
    home,
    pick,
    set onFrame(fn) {
      onFrame = fn;
    },
    dispose() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", stopFlight);
      canvas.removeEventListener("wheel", stopFlight);
      orbit.dispose();
      plan.dispose();
      clear();
      renderer.dispose();
    },
  };
}
