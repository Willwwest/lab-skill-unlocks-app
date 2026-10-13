// Design system guards: tokens.js matches tokens.css, every token a file
// uses exists, and files built on the system carry no raw colors.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stations } from "./club.js";
import * as tokens from "./ds/tokens.js";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const css = read("./ds/tokens.css");
const defined = Object.fromEntries(
  [...css.matchAll(/(--ds-[\w-]+):\s*([^;]+);/g)].map((m) => [
    m[1],
    m[2].trim(),
  ]),
);
const resolve = (name) => {
  const v = defined[name];
  const ref = v?.match(/^var\((--ds-[\w-]+)\)$/);
  return ref ? resolve(ref[1]) : v;
};

// Files that must use tokens only. Add each new page's files here.
const SYSTEM_FILES = [
  "./ds/components.css",
  "./ds/index.jsx",
  "./ds/StyleGuide.jsx",
  "./ds/styleguide.css",
  "./plans.css",
  "./charts.jsx",
  "./InsightsView.jsx",
  "./floortv.css",
  "./FloorTV.jsx",
  "./LayoutEditor.jsx",
  "./floorScene.js",
  "./layout.js",
];

test("tokens.js mirrors tokens.css", () => {
  for (const [path, name] of Object.entries(tokens.cssNames)) {
    const value = path.split(".").reduce((o, k) => o[k], tokens);
    assert.equal(
      value.toLowerCase(),
      resolve(name)?.toLowerCase(),
      `${path} vs ${name}`,
    );
  }
});

test("station colors in the app data match the station tokens", () => {
  for (const s of stations)
    assert.equal(
      s.color.toLowerCase(),
      resolve(`--ds-station-${s.id}`)?.toLowerCase(),
      s.id,
    );
});

test("every --ds-* name in use is defined", () => {
  for (const file of [...SYSTEM_FILES, "./insights.css"]) {
    for (const [, name] of read(file).matchAll(/var\((--ds-[\w-]+)/g)) {
      // Station colors are picked by id at runtime.
      if (name === "--ds-station-") continue;
      assert.ok(
        name in defined,
        `${file} uses ${name}, which tokens.css doesn't define`,
      );
    }
  }
});

test("system files hold no raw colors", () => {
  for (const file of SYSTEM_FILES) {
    const hex = read(file).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    assert.deepEqual(hex, [], `${file} has raw colors; use a token`);
  }
});
