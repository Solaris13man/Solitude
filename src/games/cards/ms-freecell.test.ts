import { describe, it, expect } from 'vitest';
import { msFreecellDealOrder } from './ms-freecell';
import type { Card } from './deck';

// Card → standard notation (rank letter + suit letter), e.g. JD, TC, AS.
const RANK_LETTER = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
function notation(c: Card): string {
  return `${RANK_LETTER[c.rank]}${c.suit}`;
}

/**
 * Canonical published layouts (deal order, row-major across the 8 cascades) for
 * the standard Microsoft FreeCell deal numbering. Source: the Rosetta Code
 * "Deal cards for FreeCell" reference outputs. These are the ground-truth test
 * vectors that prove our numbering matches Windows exactly.
 */
const GAME_1 = `
JD 2D 9H JC 5D 7H 7C 5H
KD KC 9S 5S AD QC KH 3H
2S KS 9D QD JS AS AH 3C
4C 5C TS QH 4H AC 4D 7S
3S TD 4S TH 8H 2C JH 7D
6D 8S 8D QS 6C 3D 8C TC
6S 9C 2H 6H`;

const GAME_617 = `
7D AD 5C 3S 5S 8C 2D AH
TD 7S QD AC 6D 8H AS KH
TH QC 3H 9D 6S 8D 3D TC
KD 5H 9S 3C 8S 7H 4D JS
4C QS 9C 9H 7C 6H 2C 2S
4S TS 2H 5D JC 6C JH QH
JD KS KC 4H`;

function expectedOrder(layout: string): string[] {
  return layout.trim().split(/\s+/);
}

describe('Microsoft FreeCell deal numbering', () => {
  it('reproduces the canonical layout for game #1', () => {
    const got = msFreecellDealOrder(1).map(notation);
    expect(got).toEqual(expectedOrder(GAME_1));
  });

  it('reproduces the canonical layout for game #617', () => {
    const got = msFreecellDealOrder(617).map(notation);
    expect(got).toEqual(expectedOrder(GAME_617));
  });

  it('deals a complete, unique 52-card deck for any game number', () => {
    for (const n of [1, 617, 11982, 32000, 999_999]) {
      const ids = new Set(msFreecellDealOrder(n).map((c) => c.id));
      expect(ids.size).toBe(52);
    }
  });

  it('is deterministic — the same number always deals the same cards', () => {
    expect(msFreecellDealOrder(11982).map(notation)).toEqual(
      msFreecellDealOrder(11982).map(notation),
    );
  });
});
