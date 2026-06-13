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
  /** Engine family; future entries might be 'dominoes', 'board', 'puzzle'… */
  category: 'cards' | 'dominoes' | 'board' | 'puzzle';
}

export const GAMES: GameInfo[] = [
  {
    id: 'klondike',
    name: 'Klondike',
    href: '/klondike/',
    tagline: 'The classic solitaire',
    category: 'cards',
  },
  {
    id: 'spider',
    name: 'Spider',
    href: '/spider/',
    tagline: 'Build suit runs across ten columns',
    category: 'cards',
  },
  {
    id: 'freecell',
    name: 'FreeCell',
    href: '/freecell/',
    tagline: 'Every deal is open — and almost all are winnable',
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
    id: 'sudoku',
    name: 'Sudoku',
    href: '/sudoku/',
    tagline: 'Pure logic, four difficulties, pencil marks included',
    category: 'puzzle',
  },
  {
    id: 'mahjong',
    name: 'Mahjong',
    href: '/mahjong/',
    tagline: 'Match free tiles and dismantle the turtle — every deal solvable',
    category: 'puzzle',
  },
  {
    id: 'daily',
    name: 'Daily Challenge',
    href: '/daily-challenge/',
    tagline: 'One deal a day, the same for everyone — keep your streak alive',
    category: 'cards',
  },
];
