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
    href: '/klondike',
    tagline: 'The classic solitaire',
    category: 'cards',
  },
  {
    id: 'spider',
    name: 'Spider',
    href: '/spider',
    tagline: 'Build suit runs across ten columns',
    category: 'cards',
  },
  {
    id: 'freecell',
    name: 'FreeCell',
    href: '/freecell',
    tagline: 'Every deal is open — and almost all are winnable',
    category: 'cards',
  },
];
