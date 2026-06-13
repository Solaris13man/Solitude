/**
 * Generates the brand raster images (public/og.png 1200x630 and
 * public/logo.png 512x512) with zero dependencies: shapes are drawn with
 * signed-distance functions into an RGBA buffer and encoded as PNG by hand.
 * Re-run with: node scripts/generate-brand-images.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---------- tiny PNG encoder ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- SDF drawing ----------

function makeCanvas(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4) };
}

function blendPixel(cv, x, y, r, g, b, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  const ia = 1 - a;
  cv.data[i] = r * a + cv.data[i] * ia;
  cv.data[i + 1] = g * a + cv.data[i + 1] * ia;
  cv.data[i + 2] = b * a + cv.data[i + 2] * ia;
  cv.data[i + 3] = Math.min(255, 255 * a + cv.data[i + 3] * ia);
}

/** Paint an SDF (negative = inside) over its bounding box with 1px AA. */
function paint(cv, bounds, sdf, color) {
  const [x0, y0, x1, y1] = bounds.map(Math.round);
  for (let y = Math.max(0, y0); y < Math.min(cv.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(cv.w, x1); x++) {
      const d = sdf(x + 0.5, y + 0.5);
      const a = Math.max(0, Math.min(1, 0.5 - d));
      if (a > 0) blendPixel(cv, x, y, color[0], color[1], color[2], a * (color[3] ?? 1));
    }
  }
}

const rotate = (x, y, cx, cy, ang) => {
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
};

function roundedRectSdf(cx, cy, hw, hh, r) {
  return (x, y) => {
    const qx = Math.abs(x - cx) - (hw - r);
    const qy = Math.abs(y - cy) - (hh - r);
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

const circleSdf = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

function triangleSdf(p0, p1, p2) {
  // standard exact triangle SDF
  return (px, py) => {
    const seg = (ax, ay, bx, by) => {
      const pax = px - ax, pay = py - ay;
      const bax = bx - ax, bay = by - ay;
      const t = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
      return [pax - bax * t, pay - bay * t];
    };
    const [d0x, d0y] = seg(p0[0], p0[1], p1[0], p1[1]);
    const [d1x, d1y] = seg(p1[0], p1[1], p2[0], p2[1]);
    const [d2x, d2y] = seg(p2[0], p2[1], p0[0], p0[1]);
    const d = Math.sqrt(Math.min(d0x * d0x + d0y * d0y, d1x * d1x + d1y * d1y, d2x * d2x + d2y * d2y));
    const cross = (ax, ay, bx, by, cx2, cy2) => (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
    const s0 = cross(p0[0], p0[1], p1[0], p1[1], px, py);
    const s1 = cross(p1[0], p1[1], p2[0], p2[1], px, py);
    const s2 = cross(p2[0], p2[1], p0[0], p0[1], px, py);
    const inside = (s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0);
    return inside ? -d : d;
  };
}

const unionSdf = (...fns) => (x, y) => Math.min(...fns.map((f) => f(x, y)));

/** Suit shapes in a box centered (cx, cy) with half-size s. */
function heartSdf(cx, cy, s) {
  const r = s * 0.5;
  return unionSdf(
    circleSdf(cx - s * 0.42, cy - s * 0.3, r),
    circleSdf(cx + s * 0.42, cy - s * 0.3, r),
    triangleSdf([cx - s * 0.88, cy - s * 0.12], [cx + s * 0.88, cy - s * 0.12], [cx, cy + s]),
  );
}

function spadeSdf(cx, cy, s) {
  const r = s * 0.46;
  return unionSdf(
    circleSdf(cx - s * 0.4, cy + s * 0.12, r),
    circleSdf(cx + s * 0.4, cy + s * 0.12, r),
    triangleSdf([cx - s * 0.84, cy + s * 0.06], [cx + s * 0.84, cy + s * 0.06], [cx, cy - s]),
    triangleSdf([cx - s * 0.42, cy + s], [cx + s * 0.42, cy + s], [cx, cy + s * 0.1]),
  );
}

function diamondSdf(cx, cy, s) {
  return triangleSdf([cx, cy - s], [cx + s * 0.72, cy], [cx, cy + s])
    && ((x, y) => {
      const dx = Math.abs(x - cx) / (s * 0.72);
      const dy = Math.abs(y - cy) / s;
      return (dx + dy - 1) * s * 0.55;
    });
}

// ---------- scenes ----------

function feltBackground(cv) {
  // vertical gradient with a warm hearth glow at the bottom center
  for (let y = 0; y < cv.h; y++) {
    const t = y / cv.h;
    for (let x = 0; x < cv.w; x++) {
      const i = (y * cv.w + x) * 4;
      let r = 19 + (12 - 19) * t;
      let g = 92 + (58 - 92) * t;
      let b = 50 + (30 - 50) * t;
      // glow
      const gx = (x - cv.w / 2) / (cv.w * 0.45);
      const gy = (y - cv.h * 1.05) / (cv.h * 0.55);
      const glow = Math.max(0, 1 - Math.hypot(gx, gy));
      r += 70 * glow * glow;
      g += 38 * glow * glow;
      b += 8 * glow * glow;
      cv.data[i] = r;
      cv.data[i + 1] = g;
      cv.data[i + 2] = b;
      cv.data[i + 3] = 255;
    }
  }
}

const WHITE = [251, 251, 245];
const INK = [29, 34, 48];
const RED = [194, 39, 58];
const SHADOW = [0, 0, 0, 0.35];

function drawCard(cv, cx, cy, hw, hh, ang, suit, suitColor) {
  const rot = (f) => (x, y) => {
    const [rx, ry] = rotate(x, y, cx, cy, ang);
    return f(rx, ry);
  };
  const pad = hw * 1.9;
  const bounds = [cx - pad, cy - pad, cx + pad, cy + pad];
  // drop shadow
  paint(cv, bounds, (x, y) => rot(roundedRectSdf(cx + hw * 0.06, cy + hw * 0.12, hw, hh, hw * 0.12))(x, y), SHADOW);
  // card face
  paint(cv, bounds, rot(roundedRectSdf(cx, cy, hw, hh, hw * 0.12)), [...WHITE, 1]);
  // border
  paint(cv, bounds, (x, y) => {
    const d = rot(roundedRectSdf(cx, cy, hw, hh, hw * 0.12))(x, y);
    return Math.abs(d) - 1.4;
  }, [...INK, 0.22]);
  // center pip
  const pip = suit(cx, cy, hw * 0.52);
  paint(cv, bounds, rot(pip), [...suitColor, 1]);
  // corner pips
  const corner = suit(cx - hw * 0.62, cy - hh * 0.62, hw * 0.16);
  paint(cv, bounds, rot(corner), [...suitColor, 1]);
  const corner2 = suit(cx + hw * 0.62, cy + hh * 0.62, hw * 0.16);
  paint(cv, bounds, rot(corner2), [...suitColor, 1]);
}

function ogImage() {
  const cv = makeCanvas(1200, 630);
  feltBackground(cv);
  const hw = 105;
  const hh = hw * 1.4;
  drawCard(cv, 430, 330, hw, hh, -0.24, heartSdf, RED);
  drawCard(cv, 770, 330, hw, hh, 0.24, diamondHybrid, RED);
  drawCard(cv, 600, 295, hw, hh, 0, spadeSdf, INK);
  writeFileSync('public/og.png', encodePng(cv.w, cv.h, cv.data));
}

// diamond as a clean rhombus SDF
function diamondHybrid(cx, cy, s) {
  return (x, y) => {
    const dx = Math.abs(x - cx) / 0.72;
    const dy = Math.abs(y - cy);
    return ((Math.hypot(0, 0), dx + dy) - s) * 0.7071;
  };
}

function logoImage() {
  const cv = makeCanvas(512, 512);
  // transparent background, green disc
  paint(cv, [0, 0, 512, 512], circleSdf(256, 256, 248), [19, 92, 50, 1]);
  paint(cv, [0, 0, 512, 512], (x, y) => Math.abs(circleSdf(256, 256, 244)(x, y)) - 4, [255, 255, 255, 0.25]);
  drawCard(cv, 256, 262, 108, 151, 0.1, heartSdf, RED);
  writeFileSync('public/logo.png', encodePng(cv.w, cv.h, cv.data));
}

mkdirSync('public', { recursive: true });
ogImage();
logoImage();
console.log('wrote public/og.png and public/logo.png');
