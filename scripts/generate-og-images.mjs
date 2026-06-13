/**
 * Generates a distinct Open Graph share image (1200x630 PNG) per game and
 * variant under public/og/<slug>.png. Each one reuses the felt-and-hearth
 * brand look but carries the game's own title + label, so a Klondike link and
 * a Sudoku link no longer share one generic preview.
 *
 * SVG is rasterized with sharp (already a build dependency). Re-run with:
 *   node scripts/generate-og-images.mjs
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

const FONT = 'DejaVu Sans';

// slug -> { title, label, motif }. Variants reuse the base title with a label.
const PAGES = [
  { slug: 'klondike', title: 'Klondike Solitaire', label: 'The classic patience game', motif: '♠' },
  { slug: 'klondike-draw-3', title: 'Klondike Solitaire', label: 'Draw 3', motif: '♠' },
  { slug: 'spider', title: 'Spider Solitaire', label: 'Build suit runs across ten columns', motif: '♣' },
  { slug: 'spider-2-suits', title: 'Spider Solitaire', label: '2 Suits', motif: '♣' },
  { slug: 'spider-4-suits', title: 'Spider Solitaire', label: '4 Suits', motif: '♣' },
  { slug: 'freecell', title: 'FreeCell Solitaire', label: 'Every deal open, almost all winnable', motif: '♦' },
  { slug: 'pyramid', title: 'Pyramid Solitaire', label: 'Pair cards that sum to thirteen', motif: '♥' },
  { slug: 'tripeaks', title: 'TriPeaks Solitaire', label: 'Ride the streak, clear three peaks', motif: '♠' },
  { slug: 'golf', title: 'Golf Solitaire', label: 'Quick rounds, clear the course', motif: '♥' },
  { slug: 'yukon', title: 'Yukon Solitaire', label: 'Move any pile — no stock, pure skill', motif: '♠' },
  { slug: 'scorpion', title: 'Scorpion Solitaire', label: 'Build suits and untangle the sting', motif: '♣' },
  { slug: 'forty-thieves', title: 'Forty Thieves', label: 'Two decks · a serious challenge', motif: '♦' },
  { slug: 'eight-off', title: 'Eight Off Solitaire', label: 'Eight free cells · almost always winnable', motif: '♥' },
  { slug: 'sudoku', title: 'Sudoku', label: 'Pure logic · four difficulties', motif: 'grid' },
  { slug: 'sudoku-easy', title: 'Sudoku', label: 'Easy', motif: 'grid' },
  { slug: 'sudoku-hard', title: 'Sudoku', label: 'Hard', motif: 'grid' },
  { slug: 'sudoku-expert', title: 'Sudoku', label: 'Expert', motif: 'grid' },
  { slug: 'mahjong', title: 'Mahjong Solitaire', label: 'Match free tiles · every deal solvable', motif: 'tile' },
  { slug: 'mahjong-turtle', title: 'Mahjong Solitaire', label: 'Turtle layout', motif: 'tile' },
  { slug: 'minesweeper', title: 'Minesweeper', label: 'Read the numbers, dodge the mines', motif: 'mine' },
  { slug: 'minesweeper-expert', title: 'Minesweeper', label: 'Expert', motif: 'mine' },
  { slug: '2048', title: '2048', label: 'Slide, merge, chase the tile', motif: '2048' },
  { slug: 'daily-challenge', title: 'Daily Challenge', label: 'A new game each day — keep your streak', motif: '★' },
];

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function motifSvg(motif) {
  if (motif === 'grid') {
    let cells = '';
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        cells += `<rect x="${c * 130}" y="${r * 130}" width="118" height="118" rx="14" fill="#ffffff" fill-opacity="0.10"/>`;
    return `<g transform="translate(760 150)">${cells}</g>`;
  }
  if (motif === 'tile') {
    return `<g transform="translate(820 170)"><rect width="300" height="300" rx="34" fill="#ffffff" fill-opacity="0.10"/><rect x="26" y="26" width="248" height="248" rx="22" fill="#ffffff" fill-opacity="0.08"/></g>`;
  }
  if (motif === 'mine') {
    let spikes = '';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      spikes += `<line x1="${150 + Math.cos(a) * 70}" y1="${150 + Math.sin(a) * 70}" x2="${150 + Math.cos(a) * 130}" y2="${150 + Math.sin(a) * 130}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="20" stroke-linecap="round"/>`;
    }
    return `<g transform="translate(810 170)">${spikes}<circle cx="150" cy="150" r="90" fill="#ffffff" fill-opacity="0.12"/></g>`;
  }
  if (motif === '2048') {
    return `<g transform="translate(800 175)"><rect width="320" height="300" rx="34" fill="#ffffff" fill-opacity="0.10"/><text x="160" y="195" font-family="${FONT}" font-weight="bold" font-size="92" fill="#ffffff" fill-opacity="0.22" text-anchor="middle">2048</text></g>`;
  }
  // suit glyph
  return `<text x="980" y="430" font-family="${FONT}" font-size="420" fill="#ffffff" fill-opacity="0.10" text-anchor="middle">${motif}</text>`;
}

function buildSvg(p) {
  const titleSize = p.title.length > 14 ? 78 : 92;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="felt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d7a45"/>
      <stop offset="1" stop-color="#0c3a1e"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="108%" r="70%">
      <stop offset="0" stop-color="#caa24a" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#caa24a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#felt)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  ${motifSvg(p.motif)}
  <g transform="translate(80 96)">
    <rect width="40" height="56" rx="7" fill="#fbfbf5"/>
    <text x="20" y="40" font-family="${FONT}" font-size="34" fill="#c2273a" text-anchor="middle">♥</text>
    <text x="60" y="40" font-family="${FONT}" font-weight="bold" font-size="34" fill="#f3f6f2">CardHearth</text>
  </g>
  <text x="80" y="330" font-family="${FONT}" font-weight="bold" font-size="${titleSize}" fill="#ffffff">${esc(p.title)}</text>
  <text x="82" y="398" font-family="${FONT}" font-size="40" fill="#ffd95e">${esc(p.label)}</text>
  <text x="80" y="566" font-family="${FONT}" font-size="30" fill="#f3f6f2" fill-opacity="0.82">Free · No sign-up · Plays in your browser</text>
</svg>`;
}

mkdirSync('public/og', { recursive: true });
const slugs = [];
for (const p of PAGES) {
  const png = await sharp(Buffer.from(buildSvg(p))).png().toBuffer();
  writeFileSync(`public/og/${p.slug}.png`, png);
  slugs.push(p.slug);
}
console.log(`wrote ${slugs.length} OG images to public/og/: ${slugs.join(', ')}`);
