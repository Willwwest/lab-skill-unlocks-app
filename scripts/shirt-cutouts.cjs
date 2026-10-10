// Cuts the four shirt mockups in ../brandkit/shirts into transparent front/back
// WebP files under public/shirts. One-off asset step; needs the sharp package:
//   npm i --no-save sharp && node scripts/shirt-cutouts.cjs public/shirts
// The cream studio background is flood-filled from the border and removed; the
// soft contact shadow is kept as translucent navy.

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const SRC = path.join(__dirname, "..", "..", "brandkit", "shirts");
const OUT = process.argv[2] || path.join(__dirname, "..", "public", "shirts");
fs.mkdirSync(OUT, { recursive: true });
const tiers = [
  [1, "tier-01-spark-concept.png"],
  [2, "tier-02-momentum-concept.png"],
  [3, "tier-03-ascent-concept.png"],
  [4, "tier-04-apex-concept.png"],
];
const CREAM_LUM = 243;
function cutout(data, w, h) {
  // 1. flood fill background from the border
  const n = w * h;
  const bg = new Uint8Array(n);
  const isBgLike = (i) => {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return mx - mn < 22 && lum > 165;
  };
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !isBgLike(i)) continue;
    bg[i] = 1;
    const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  // 2. build RGBA
  const out = Buffer.alloc(n * 4);
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let a;
    if (bg[i]) {
      // soft contact shadow: darker cream -> translucent black
      a = Math.round(Math.max(0, Math.min(1, (CREAM_LUM - 6 - lum) / 90)) * 0.55 * 255);
      out[i * 4] = 10; out[i * 4 + 1] = 12; out[i * 4 + 2] = 30;
    } else {
      const x = i % w, y = (i - x) / w;
      let rim = false;
      for (let dy = -1; dy <= 1 && !rim; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        if (bg[yy * w + xx]) { rim = true; break; }
      }
      if (rim) {
        const d = Math.hypot(r - 248, g - 243, b - 236);
        a = Math.round(Math.max(0.3, Math.min(1, d / 110)) * 255);
      } else a = 255;
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b;
    }
    out[i * 4 + 3] = a;
    if (a > 40) { const x = i % w, y = (i - x) / w; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { out, box: { minX, minY, maxX, maxY } };
}
(async () => {
  const sheet = [];
  for (const [tier, file] of tiers) {
    const img = sharp(path.join(SRC, file));
    const meta = await img.metadata();
    const regions = { front: { left: 0, top: 112, width: 768, height: 832 }, back: { left: 768, top: 112, width: meta.width - 768, height: 832 } };
    for (const [view, region] of Object.entries(regions)) {
      const { data, info } = await sharp(path.join(SRC, file)).extract(region).raw().toBuffer({ resolveWithObject: true });
      const { out, box } = cutout(data, info.width, info.height);
      const pad = 12;
      const left = Math.max(0, box.minX - pad), top = Math.max(0, box.minY - pad);
      const width = Math.min(info.width, box.maxX + pad) - left, height = Math.min(info.height, box.maxY + pad) - top;
      const png = sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).extract({ left, top, width, height });
      const base = path.join(OUT, `tier-${tier}-${view}`);
      await png.clone().resize({ height: 1000, withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 90, effort: 5 }).toFile(base + ".webp");
      await png.clone().resize({ height: 360 }).png().toFile(base + "-preview.png");
      const st = fs.statSync(base + ".webp");
      console.log(`tier ${tier} ${view}: box ${width}x${height} -> ${base}.webp ${(st.size / 1024).toFixed(0)}KB`);
      sheet.push(base + "-preview.png");
    }
  }
  // contact sheet on navy to check edges
  const tiles = await Promise.all(sheet.map(async (f, i) => ({ input: f, left: 20 + (i % 4) * 380, top: 20 + Math.floor(i / 4) * 390 })));
  await sharp({ create: { width: 1560, height: 800, channels: 4, background: "#0f0e54" } }).composite(tiles).png().toFile(path.join(OUT, "contact-sheet.png"));
  console.log("contact sheet written");
})().catch((e) => { console.error(e); process.exit(1); });
