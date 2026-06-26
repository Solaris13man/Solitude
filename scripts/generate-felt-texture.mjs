/**
 * Generates a subtle, seamless felt-grain overlay (public/textures/felt.webp):
 * a transparent RGBA tile of soft dark/light specks. Layered over the felt
 * colour gradient it reads as woven cloth and works for every felt colour, so
 * one tile serves green/blue/slate/crimson. Re-run: node scripts/generate-felt-texture.mjs
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 256, H = 256;
const idx = (x, y) => ((y + H) % H) * W + ((x + W) % W);

// fine random grain
let n = new Float32Array(W * H);
for (let i = 0; i < n.length; i++) n[i] = Math.random();

// wrap-around box blur to clump the static into soft fibres (stays seamless)
function blur(src, rx, ry) {
  const dst = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let dy = -ry; dy <= ry; dy++)
        for (let dx = -rx; dx <= rx; dx++) { s += src[idx(x + dx, y + dy)]; c++; }
      dst[y * W + x] = s / c;
    }
  return dst;
}
// soft clumps + a faint horizontal fibre direction
const clump = blur(blur(n, 1, 1), 1, 1);
const fibre = blur(n, 3, 0);
for (let i = 0; i < n.length; i++) n[i] = clump[i] * 0.7 + fibre[i] * 0.3;

// normalise to ~[-1,1]
let mean = 0; for (const v of n) mean += v; mean /= n.length;
let sd = 0; for (const v of n) sd += (v - mean) ** 2; sd = Math.sqrt(sd / n.length) || 1;

const MAX_ALPHA = 0.11; // subtlety
const buf = Buffer.alloc(W * H * 4);
for (let i = 0; i < n.length; i++) {
  const z = Math.max(-1, Math.min(1, (n[i] - mean) / (sd * 2.2)));
  const a = Math.round(Math.abs(z) * MAX_ALPHA * 255);
  const light = z > 0;
  buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = light ? 255 : 0;
  buf[i * 4 + 3] = a;
}
mkdirSync('public/textures', { recursive: true });
const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 82, effort: 6 }).toBuffer();
writeFileSync('public/textures/felt.webp', png);

// preview: tile the grain over a felt-green square so we can eyeball it
const tile = await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const base = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 29, g: 122, b: 69, alpha: 1 } } })
  .composite([
    { input: tile, tile: true, blend: 'over' },
    // top sheen + bottom vignette approximations are skipped; this is just the grain check
  ]).png().toBuffer();
writeFileSync('/tmp/felt-preview.png', base);
console.log('wrote public/textures/felt.webp and /tmp/felt-preview.png');
