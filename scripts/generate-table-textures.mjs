/**
 * Generates seamless, tileable table-surface textures into public/textures/:
 *   wood-walnut.webp, wood-oak.webp, marble.webp, granite.webp
 * All are produced from seeded tileable value-noise (periodic over the tile),
 * so they repeat without visible seams. Original/owned art.
 * Re-run: node scripts/generate-table-textures.mjs
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

const S = 512;
const mul = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const grid = (gx, gy, rnd) => { const a = new Float32Array(gx * gy); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
const sm = (t) => t * t * (3 - 2 * t);
function vn(x, y, gx, gy, gr) {
  const fx = x * gx, fy = y * gy;
  let x0 = Math.floor(fx) % gx, y0 = Math.floor(fy) % gy; if (x0 < 0) x0 += gx; if (y0 < 0) y0 += gy;
  const x1 = (x0 + 1) % gx, y1 = (y0 + 1) % gy, tx = sm(fx - Math.floor(fx)), ty = sm(fy - Math.floor(fy));
  const a = gr[y0 * gx + x0], b = gr[y0 * gx + x1], c = gr[y1 * gx + x0], d = gr[y1 * gx + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
const fbm = (x, y, octs) => { let s = 0, m = 0; for (const o of octs) { s += vn(x, y, o.gx, o.gy, o.gr) * o.amp; m += o.amp; } return s / m; };
const octaves = (seed, specs) => { const rnd = mul(seed); return specs.map(([gx, gy, amp]) => ({ gx, gy, amp, gr: grid(gx, gy, rnd) })); };
const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));
const mix = (c1, c2, t) => [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];

// --- surfaces ---
const woodN = octaves(11, [[18, 3, 1], [36, 6, 0.5], [72, 10, 0.25]]);
const woodWarp = octaves(12, [[3, 3, 1], [6, 6, 0.5]]);
function wood(toneA, toneB, bands) {
  return (x, y) => {
    const warp = (fbm(x, y, woodWarp) - 0.5) * 0.12;
    const n = fbm(x + warp, y, woodN);
    let g = Math.abs(Math.sin((x * bands + (n - 0.5) * 1.4) * Math.PI * 2));
    g = Math.pow(g, 0.7);
    const t = clamp(g * 0.8 + (n - 0.5) * 0.5 + 0.12, 0, 1);
    return mix(toneA, toneB, t);
  };
}
const marbN = octaves(21, [[2, 2, 1], [4, 4, 0.6], [8, 8, 0.32], [16, 16, 0.16]]);
const marbN2 = octaves(22, [[3, 3, 1], [6, 6, 0.5], [12, 12, 0.25]]);
function marble(x, y) {
  const turb = fbm(x, y, marbN) - 0.5;
  // soft warped banding = flowing marble swirl (not isolines)
  const band = 0.5 + 0.5 * Math.sin((x * 2 + y * 1 + turb * 5) * Math.PI * 2);
  let c = mix([243, 240, 236], [205, 204, 208], Math.pow(band, 1.3) * 0.7);
  // a few thin, sparse dark veins from a second warped field
  const turb2 = fbm(x, y, marbN2) - 0.5;
  const vein = Math.pow(Math.max(0, 1 - Math.abs(Math.sin((x * 1 - y * 1 + turb2 * 8) * Math.PI * 2))), 8);
  c = mix(c, [118, 116, 122], vein * 0.45);
  return c;
}
const grBase = octaves(31, [[40, 40, 1], [80, 80, 0.5], [16, 16, 0.6]]);
const grSpeck = octaves(32, [[210, 210, 1]]);
function granite(x, y) {
  const n = fbm(x, y, grBase);
  let c = mix([96, 95, 103], [132, 130, 138], n);
  const s = vn(x, y, 210, 210, grSpeck[0].gr);
  if (s > 0.80) c = mix(c, [212, 210, 216], ((s - 0.80) / 0.20) * 0.95);
  else if (s < 0.17) c = mix(c, [38, 38, 46], ((0.17 - s) / 0.17) * 0.95);
  return c;
}

function buffer(fn) {
  const buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = fn(x / S, y / S), i = (y * S + x) * 4;
    buf[i] = clamp(c[0]); buf[i + 1] = clamp(c[1]); buf[i + 2] = clamp(c[2]); buf[i + 3] = 255;
  }
  return buf;
}
mkdirSync('public/textures', { recursive: true });
const set = {
  'wood-walnut': wood([96, 60, 38], [50, 30, 17], 4),
  'wood-oak': wood([196, 152, 95], [150, 104, 58], 6),
  marble,
  granite,
};
for (const [name, fn] of Object.entries(set)) {
  const raw = buffer(fn);
  const png = await sharp(raw, { raw: { width: S, height: S, channels: 4 } }).webp({ quality: 82, effort: 6 }).toBuffer();
  writeFileSync(`public/textures/${name}.webp`, png);
  // 2x2 seam-check preview
  const prev = await sharp({ create: { width: S * 2, height: S * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: png, tile: true, blend: 'over' }]).png().toBuffer();
  writeFileSync(`/tmp/${name}-tiled.png`, prev);
}
console.log('wrote', Object.keys(set).join(', '));
