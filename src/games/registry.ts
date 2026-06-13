/**
 * Site-wide catalogue of games. The menu, sitemap, and cross-links are all
 * driven from here, so adding a game (card, domino, board, or otherwise) is
 * one entry here plus a page under src/pages/.
 */
export interface GameInfo {
  id: string;
  name: string;
  href: string;
  tagline: string;
  /** Optional trust-building badge shown on the menu card (e.g. a guarantee). */
  highlight?: string;
  /** Engine family; future entries might be 'dominoes', 'board', 'puzzle'… */
  category: 'cards' | 'dominoes' | 'board' | 'puzzle';
  /** Variant landing pages surfaced under this game (for SEO + navigation). */
  variants?: { label: string; href: string }[];
}

export const GAMES: GameInfo[] = [
  {
    id: 'klondike',
    name: 'Klondike',
    href: '/klondike/',
    tagline: 'The classic solitaire',
    category: 'cards',
    variants: [{ label: 'Draw 3', href: '/klondike-draw-3/' }],
  },
  {
    id: 'spider',
    name: 'Spider',
    href: '/spider/',
    tagline: 'Build suit runs across ten columns',
    category: 'cards',
    variants: [
      { label: '2 Suits', href: '/spider-2-suits/' },
      { label: '4 Suits', href: '/spider-4-suits/' },
    ],
  },
  {
    id: 'freecell',
    name: 'FreeCell',
    href: '/freecell/',
    tagline: 'Every deal is open — and almost all are winnable',
    highlight: 'Almost every deal winnable',
    category: 'cards',
  },
  {
    id: 'pyramid',
    name: 'Pyramid',
    href: '/pyramid/',
    tagline: 'Pair cards that sum to thirteen and level the pyramid',
    category: 'cards',
  },
  {
    id: 'tripeaks',
    name: 'TriPeaks',
    href: '/tripeaks/',
    tagline: 'Ride the streak and clear all three peaks',
    category: 'cards',
  },
  {
    id: 'golf',
    name: 'Golf',
    href: '/golf/',
    tagline: 'Quick rounds: play up or down and clear the course',
    category: 'cards',
  },
  {
    id: 'yukon',
    name: 'Yukon',
    href: '/yukon/',
    tagline: 'Move any face-up pile — no stock, pure skill',
    category: 'cards',
  },
  {
    id: 'scorpion',
    name: 'Scorpion',
    href: '/scorpion/',
    tagline: 'Build suits and untangle the sting',
    category: 'cards',
  },
  {
    id: 'fortythieves',
    name: 'Forty Thieves',
    href: '/forty-thieves/',
    tagline: 'Two decks, eight foundations — a serious challenge',
    category: 'cards',
  },
  {
    id: 'eightoff',
    name: 'Eight Off',
    href: '/eight-off/',
    tagline: 'Eight free cells — almost every deal is winnable',
    category: 'cards',
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    href: '/sudoku/',
    tagline: 'Pure logic, four difficulties, pencil marks included',
    highlight: 'Every puzzle logic-solvable — no guessing',
    category: 'puzzle',
    variants: [
      { label: 'Easy', href: '/sudoku-easy/' },
      { label: 'Hard', href: '/sudoku-hard/' },
      { label: 'Expert', href: '/sudoku-expert/' },
    ],
  },
  {
    id: 'mahjong',
    name: 'Mahjong',
    href: '/mahjong/',
    tagline: 'Match free tiles and dismantle the turtle — every deal solvable',
    highlight: 'Every board guaranteed solvable',
    category: 'puzzle',
    variants: [{ label: 'Turtle', href: '/mahjong-turtle/' }],
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    href: '/minesweeper/',
    tagline: 'Read the numbers, dodge the mines',
    category: 'puzzle',
    variants: [{ label: 'Expert', href: '/minesweeper-expert/' }],
  },
  {
    id: '2048',
    name: '2048',
    href: '/2048/',
    tagline: 'Slide, merge, and chase the famous tile',
    category: 'puzzle',
  },
  {
    id: 'daily',
    name: 'Daily Challenge',
    href: '/daily-challenge/',
    tagline: 'A different game each day, the same for everyone — keep your streak alive',
    category: 'cards',
  },
];
