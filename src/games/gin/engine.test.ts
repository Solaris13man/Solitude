import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '../cards/deck';
import {
  GIN_BONUS,
  TARGET_SCORE,
  UNDERCUT_BONUS,
  aiChooseDiscard,
  aiChooseDraw,
  bestMelds,
  canDrawDiscard,
  canKnock,
  cardValue,
  deadwoodValue,
  discard,
  drawDiscard,
  drawStock,
  gameWinner,
  knock,
  newGame,
  startNextRound,
  type GinState,
} from './engine';

function card(suit: Suit, rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank, faceUp: true };
}

/** Build a controlled state with explicit hands. */
function stateWith(overrides: Partial<GinState> = {}): GinState {
  return {
    seed: 0,
    round: 0,
    hands: [[], []],
    stock: [],
    discard: [],
    turn: 0,
    dealer: 0,
    phase: 'draw',
    scores: [0, 0],
    lastResult: null,
    justDrewDiscard: false,
    ...overrides,
  };
}

describe('gin cardValue', () => {
  it('Ace=1, face cards=10, others face value', () => {
    expect(cardValue(card('S', 1))).toBe(1);
    expect(cardValue(card('H', 5))).toBe(5);
    expect(cardValue(card('D', 10))).toBe(10);
    expect(cardValue(card('C', 11))).toBe(10);
    expect(cardValue(card('S', 12))).toBe(10);
    expect(cardValue(card('H', 13))).toBe(10);
  });
});

describe('gin newGame', () => {
  it('deals 10 + 10, one upcard, ~31 stock, 52 unique', () => {
    const s = newGame(42);
    expect(s.hands).toHaveLength(2);
    expect(s.hands.map((h) => h.length)).toEqual([10, 10]);
    expect(s.discard).toHaveLength(1);
    expect(s.stock).toHaveLength(31);

    const all = [...s.hands.flat(), ...s.discard, ...s.stock];
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);

    expect(s.dealer).toBe(0);
    expect(s.turn).toBe(1); // non-dealer moves first
    expect(s.phase).toBe('draw');
    expect(s.scores).toEqual([0, 0]);
    expect(s.lastResult).toBeNull();
  });

  it('is deterministic for a seed', () => {
    const a = newGame(7);
    const b = newGame(7);
    expect(a.hands.flat().map((c) => c.id)).toEqual(b.hands.flat().map((c) => c.id));
    const c = newGame(8);
    expect(a.hands.flat().map((c) => c.id)).not.toEqual(c.hands.flat().map((c) => c.id));
  });
});

describe('gin bestMelds', () => {
  it('finds a pure set', () => {
    const cards = [card('S', 7), card('H', 7), card('D', 7)];
    const r = bestMelds(cards);
    expect(r.melds).toHaveLength(1);
    expect(r.melds[0]!.type).toBe('set');
    expect(r.deadwood).toHaveLength(0);
    expect(r.deadwoodValue).toBe(0);
  });

  it('finds a pure run (Ace low)', () => {
    const cards = [card('S', 1), card('S', 2), card('S', 3)];
    const r = bestMelds(cards);
    expect(r.melds).toHaveLength(1);
    expect(r.melds[0]!.type).toBe('run');
    expect(r.deadwoodValue).toBe(0);
  });

  it('does NOT treat Q-K-A as a run', () => {
    const cards = [card('S', 12), card('S', 13), card('S', 1)];
    const r = bestMelds(cards);
    expect(r.melds).toHaveLength(0);
    // deadwood = 10 + 10 + 1
    expect(r.deadwoodValue).toBe(21);
  });

  it('picks the optimal split on overlapping set/run', () => {
    // 7S 7H 7D form a set (value 21). 7D 8D 9D form a run (value 24).
    // The 7D is contested. Optimal: use the run (24) + keep 7S,7H as deadwood?
    // Actually best is run 7D-8D-9D (24) AND we still have 7S,7H (14 dw),
    // vs set 7s/7h/7d (21) leaving 8D,9D (17 dw). Run wins: 14 < 17.
    const cards = [card('S', 7), card('H', 7), card('D', 7), card('D', 8), card('D', 9)];
    const r = bestMelds(cards);
    expect(r.melds).toHaveLength(1);
    expect(r.melds[0]!.type).toBe('run');
    expect(r.deadwoodValue).toBe(14); // 7S + 7H
  });

  it('prefers a set+run split over a 4-set when it melds more', () => {
    // Cards: 5S 5H 5C 5D 6D 7D.
    //  - 4-set {5S5H5C5D}=20 leaves 6D,7D deadwood (13).
    //  - set {5S5H5C}=15 + run {5D6D7D}=18 = 33 melded, deadwood 0.
    // The optimal decomposition melds everything.
    const cards = [
      card('S', 5),
      card('H', 5),
      card('C', 5),
      card('D', 5),
      card('D', 6),
      card('D', 7),
    ];
    const r = bestMelds(cards);
    expect(r.deadwoodValue).toBe(0);
    expect(r.melds).toHaveLength(2);
  });

  it('uses a 4-set when splitting cannot meld the extra cards', () => {
    // 5 of each suit (a clean 4-set, 0 deadwood) plus an isolated 6D, 7D pair
    // that cannot form a run without the 5D.
    //  - 4-set {5S5H5C5D}=20 leaves 6D(6)+7D(7)=13 deadwood.
    //  - run {5D6D7D}=18 leaves 5S+5H+5C=15 deadwood.
    // The 4-set wins (13 < 15). Note: a clean 5-6-7 run would also be 0, so we
    // exclude the contiguous case by leaving 6D/7D non-adjacent to a run start.
    const cards = [
      card('S', 5),
      card('H', 5),
      card('C', 5),
      card('D', 5),
      card('D', 6),
      card('D', 7),
      card('S', 6),
      card('S', 7), // S5-S6-S7 is now also a run; gives a richer optimum
    ];
    const r = bestMelds(cards);
    // Optimal: run S5-S6-S7 (18) + run D5-D6-D7 (18) = 36 melded, leaving
    // 5H + 5C = 10 deadwood.
    expect(r.deadwoodValue).toBe(10);
  });

  it('recognises a gin hand with 0 deadwood', () => {
    // Two runs + a set = 10 cards, all melded.
    const cards = [
      card('S', 1),
      card('S', 2),
      card('S', 3),
      card('H', 5),
      card('H', 6),
      card('H', 7),
      card('D', 9),
      card('C', 9),
      card('S', 9),
      card('H', 9),
    ];
    const r = bestMelds(cards);
    expect(r.deadwoodValue).toBe(0);
    expect(r.deadwood).toHaveLength(0);
  });

  it('deadwoodValue matches bestMelds', () => {
    const cards = [card('S', 7), card('H', 7), card('D', 7), card('C', 2), card('D', 9)];
    expect(deadwoodValue(cards)).toBe(bestMelds(cards).deadwoodValue);
    expect(deadwoodValue(cards)).toBe(11); // C2 + D9
  });
});

describe('gin draw actions', () => {
  it('canDrawDiscard requires draw phase, turn, non-empty discard', () => {
    const s = stateWith({ turn: 0, phase: 'draw', discard: [card('S', 5)] });
    expect(canDrawDiscard(s, 0)).toBe(true);
    expect(canDrawDiscard(s, 1)).toBe(false);
    const s2 = stateWith({ turn: 0, phase: 'discard', discard: [card('S', 5)] });
    expect(canDrawDiscard(s2, 0)).toBe(false);
    const s3 = stateWith({ turn: 0, phase: 'draw', discard: [] });
    expect(canDrawDiscard(s3, 0)).toBe(false);
  });

  it('drawStock moves top of stock and sets discard phase', () => {
    const s = stateWith({
      turn: 0,
      phase: 'draw',
      hands: [[card('H', 3)], []],
      stock: [card('C', 9), card('D', 4)], // top = D4
    });
    drawStock(s, 0);
    expect(s.hands[0]!.map((c) => c.id)).toContain('D4');
    expect(s.stock).toHaveLength(1);
    expect(s.phase).toBe('discard');
    expect(s.justDrewDiscard).toBe(false);
  });

  it('drawDiscard moves the upcard and sets justDrewDiscard', () => {
    const s = stateWith({
      turn: 0,
      phase: 'draw',
      hands: [[card('H', 3)], []],
      discard: [card('S', 8), card('D', 4)], // top = D4
    });
    drawDiscard(s, 0);
    expect(s.hands[0]!.map((c) => c.id)).toContain('D4');
    expect(s.discard.map((c) => c.id)).toEqual(['S8']);
    expect(s.phase).toBe('discard');
    expect(s.justDrewDiscard).toBe(true);
  });
});

describe('gin canKnock', () => {
  it('is true when remaining 10-card deadwood <= 10, false above', () => {
    // 11-card hand: a gin-able 10 + a heavy extra to discard.
    const ginTen = [
      card('S', 1),
      card('S', 2),
      card('S', 3),
      card('H', 5),
      card('H', 6),
      card('H', 7),
      card('D', 9),
      card('C', 9),
      card('S', 9),
      card('H', 9),
    ];
    const s = stateWith({
      turn: 0,
      phase: 'discard',
      hands: [[...ginTen, card('C', 13)], []],
    });
    // Discarding the K leaves a 0-deadwood hand.
    expect(canKnock(s, 0, card('C', 13))).toBe(true);
    // Discarding part of a meld leaves big deadwood -> cannot knock.
    expect(canKnock(s, 0, card('S', 1))).toBe(false);
  });
});

describe('gin knock scoring', () => {
  it('GIN: knocker scores opponent deadwood + 25, no layoff', () => {
    const ginEleven = [
      card('S', 1),
      card('S', 2),
      card('S', 3),
      card('H', 5),
      card('H', 6),
      card('H', 7),
      card('D', 9),
      card('C', 9),
      card('S', 9),
      card('H', 9),
      card('C', 2), // the discard
    ];
    const oppHand = [
      card('D', 1),
      card('D', 2),
      card('D', 3), // run (0)
      card('C', 5),
      card('C', 6),
      card('C', 7), // run (0)
      card('S', 13),
      card('H', 13),
      card('C', 13), // set (0)
      card('S', 8), // deadwood 8
    ];
    const s = stateWith({
      turn: 0,
      phase: 'discard',
      hands: [ginEleven, oppHand],
    });
    knock(s, 0, card('C', 2));
    const r = s.lastResult!;
    expect(r.gin).toBe(true);
    expect(r.knockerDeadwood).toBe(0);
    expect(r.opponentDeadwood).toBe(8);
    expect(r.laidOff).toHaveLength(0);
    expect(r.delta).toBe(8 + GIN_BONUS);
    expect(r.winner).toBe(0);
    expect(s.scores[0]).toBe(8 + GIN_BONUS);
    expect(s.phase).toBe('roundEnd');
  });

  it('NORMAL knock with a layoff reducing opponent deadwood', () => {
    // Knocker: run 4-5-6 S (15 melded), set 9 (3x) , deadwood = 5C (5).
    // After discarding, 10-card hand deadwood = 5.
    const knockerEleven = [
      card('S', 4),
      card('S', 5),
      card('S', 6), // run S
      card('D', 9),
      card('C', 9),
      card('H', 9), // set 9
      card('D', 1),
      card('D', 2),
      card('D', 3), // run D
      card('C', 5), // deadwood 5
      card('H', 12), // the discard
    ];
    // Opponent: has S7 which lays off the 4-5-6S run, plus S9 lays off the 9 set.
    const oppHand = [
      card('S', 7), // lays onto run S (extends 4-5-6 -> 7)
      card('S', 9), // lays onto the 9 set
      card('C', 11),
      card('C', 12),
      card('C', 13), // run C (0)
      card('H', 2),
      card('H', 3),
      card('H', 4), // run H (0)
      card('D', 8), // deadwood 8
      card('C', 4), // deadwood 4
    ];
    const s = stateWith({
      turn: 0,
      phase: 'discard',
      hands: [knockerEleven, oppHand],
    });
    expect(canKnock(s, 0, card('H', 12))).toBe(true);
    knock(s, 0, card('H', 12));
    const r = s.lastResult!;
    expect(r.gin).toBe(false);
    expect(r.knockerDeadwood).toBe(5);
    // Opponent deadwood before layoff: S7(7)+S9(9)+D8(8)+C4(4)=28, but S7 & S9
    // lay off. After layoff: D8 + C4 = 12.
    expect(r.laidOff.map((c) => c.id).sort()).toEqual(['S7', 'S9']);
    expect(r.opponentDeadwood).toBe(12);
    expect(r.winner).toBe(0);
    expect(r.delta).toBe(12 - 5); // 7
    expect(s.scores[0]).toBe(7);
  });

  it('UNDERCUT: opponent deadwood <= knocker -> opponent scores diff + 25', () => {
    // Knocker has deadwood 10 (a single 10), opponent has deadwood 3.
    const knockerEleven = [
      card('S', 1),
      card('S', 2),
      card('S', 3), // run
      card('H', 5),
      card('H', 6),
      card('H', 7), // run
      card('D', 11),
      card('C', 11),
      card('S', 11), // set
      card('C', 10), // deadwood 10
      card('H', 2), // discard
    ];
    const oppHand = [
      card('D', 1),
      card('D', 2),
      card('D', 3), // run
      card('C', 5),
      card('C', 6),
      card('C', 7), // run
      card('S', 13),
      card('H', 13),
      card('C', 13), // set
      card('S', 3), // deadwood 3 (does not lay off the knocker's melds)
    ];
    const s = stateWith({
      turn: 0,
      phase: 'discard',
      hands: [knockerEleven, oppHand],
    });
    knock(s, 0, card('H', 2));
    const r = s.lastResult!;
    expect(r.knockerDeadwood).toBe(10);
    expect(r.opponentDeadwood).toBe(3);
    expect(r.undercut).toBe(true);
    expect(r.winner).toBe(1);
    expect(r.delta).toBe(10 - 3 + UNDERCUT_BONUS); // 7 + 25
    expect(s.scores[1]).toBe(7 + UNDERCUT_BONUS);
  });
});

describe('gin wash', () => {
  it('ends the round with no score when stock hits <= 2', () => {
    const s = stateWith({
      turn: 0,
      phase: 'discard',
      hands: [[card('S', 5), card('H', 9)], [card('C', 4), card('D', 8)]],
      stock: [card('S', 1), card('S', 2), card('S', 3)], // 3 cards; after... see below
      discard: [card('D', 2)],
    });
    // We need stock to drop to <= 2 after the discard. The discard itself does
    // not remove from stock, so set stock to exactly 2 to trigger the wash.
    s.stock = [card('S', 1), card('S', 2)];
    discard(s, 0, card('S', 5));
    expect(s.phase).toBe('roundEnd');
    const r = s.lastResult!;
    expect(r.winner).toBe(-1);
    expect(r.knocker).toBe(-1);
    expect(s.scores).toEqual([0, 0]);
  });

  it('passes the turn normally when stock is healthy', () => {
    const s = stateWith({
      turn: 0,
      phase: 'discard',
      hands: [[card('S', 5), card('H', 9)], []],
      stock: Array.from({ length: 20 }, (_, i) => card('C', (i % 10) + 1)),
      discard: [card('D', 2)],
    });
    discard(s, 0, card('S', 5));
    expect(s.phase).toBe('draw');
    expect(s.turn).toBe(1);
    expect(s.discard[s.discard.length - 1]!.id).toBe('S5');
  });
});

describe('gin gameWinner', () => {
  it('picks the higher score', () => {
    const s = stateWith({ scores: [40, 105] });
    expect(gameWinner(s)).toBe(1);
    s.scores = [120, 90];
    expect(gameWinner(s)).toBe(0);
  });
});

describe('gin startNextRound', () => {
  it('increments round, rotates dealer, re-deals, keeps scores', () => {
    const s = newGame(11);
    s.scores = [12, 34];
    s.phase = 'roundEnd';
    startNextRound(s);
    expect(s.round).toBe(1);
    expect(s.dealer).toBe(1);
    expect(s.turn).toBe(0); // non-dealer
    expect(s.phase).toBe('draw');
    expect(s.scores).toEqual([12, 34]);
    const all = [...s.hands.flat(), ...s.discard, ...s.stock];
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
  });
});

describe('gin aiChooseDiscard', () => {
  it('returns a card in hand with a sensible knock flag', () => {
    const ginTen = [
      card('S', 1),
      card('S', 2),
      card('S', 3),
      card('H', 5),
      card('H', 6),
      card('H', 7),
      card('D', 9),
      card('C', 9),
      card('S', 9),
      card('H', 9),
    ];
    const s = stateWith({
      turn: 0,
      phase: 'discard',
      hands: [[...ginTen, card('C', 13)], []],
    });
    const { card: chosen, knock: doKnock } = aiChooseDiscard(s, 0);
    expect(s.hands[0]!.some((c) => c.id === chosen.id)).toBe(true);
    expect(chosen.id).toBe('C13'); // discard the heavy useless king
    expect(doKnock).toBe(true); // remaining deadwood is 0 (gin)
  });

  it('does not knock on a heavy hand', () => {
    const heavy = [
      card('S', 13),
      card('H', 12),
      card('D', 11),
      card('C', 10),
      card('S', 8),
      card('H', 6),
      card('D', 4),
      card('C', 2),
      card('S', 5),
      card('H', 9),
      card('D', 13),
    ];
    const s = stateWith({ turn: 0, phase: 'discard', hands: [heavy, []] });
    const { card: chosen, knock: doKnock } = aiChooseDiscard(s, 0);
    expect(heavy.some((c) => c.id === chosen.id)).toBe(true);
    expect(doKnock).toBe(false);
  });

  it('respects justDrewDiscard (cannot re-discard the drawn upcard)', () => {
    const hand = [
      card('S', 1),
      card('S', 2),
      card('S', 3),
      card('H', 5),
      card('H', 6),
      card('H', 7),
      card('D', 9),
      card('C', 9),
      card('S', 9),
      card('C', 13), // worst card, normally discarded
      card('H', 13), // pretend this was just drawn from discard
    ];
    const s = stateWith({
      turn: 0,
      phase: 'discard',
      hands: [hand, []],
      justDrewDiscard: true,
    });
    const { card: chosen } = aiChooseDiscard(s, 0);
    expect(chosen.id).not.toBe('H13'); // blocked
  });
});

describe('gin aiChooseDraw', () => {
  it('takes the upcard when it lowers deadwood', () => {
    // Hand of 10 where the upcard completes a run.
    const hand = [
      card('S', 4),
      card('S', 5), // needs S6 or S3
      card('H', 5),
      card('H', 6),
      card('H', 7),
      card('D', 9),
      card('C', 9),
      card('S', 9),
      card('C', 13),
      card('D', 13),
    ];
    const s = stateWith({
      turn: 0,
      phase: 'draw',
      hands: [hand, []],
      discard: [card('S', 6)], // completes 4-5-6 S
    });
    expect(aiChooseDraw(s, 0)).toBe('discard');
  });

  it('takes from stock when the upcard is useless', () => {
    // A near-gin hand: three melds + a single low deadwood card (C2 = 2).
    // The upcard is a high, unconnected K. Taking it and discarding it back is
    // forbidden, and discarding the C2 instead leaves K deadwood (worse), so
    // the AI should keep drawing from stock.
    const hand = [
      card('S', 1),
      card('S', 2),
      card('S', 3), // run
      card('H', 5),
      card('H', 6),
      card('H', 7), // run
      card('D', 9),
      card('C', 9),
      card('S', 9), // set
      card('C', 2), // lone deadwood (2)
    ];
    const s = stateWith({
      turn: 0,
      phase: 'draw',
      hands: [hand, []],
      discard: [card('D', 13)], // a useless king, pairs with nothing
    });
    expect(aiChooseDraw(s, 0)).toBe('stock');
  });
});

describe('gin full all-AI game', () => {
  it('runs round after round to gameOver without illegal states', () => {
    let s = newGame(2024);
    let safety = 0;

    while (s.phase !== 'gameOver' && safety < 5000) {
      safety++;
      if (s.phase === 'roundEnd') {
        startNextRound(s);
        continue;
      }

      const p = s.turn;

      // DRAW
      expect(s.phase).toBe('draw');
      const choice = aiChooseDraw(s, p);
      if (choice === 'discard' && canDrawDiscard(s, p)) {
        drawDiscard(s, p);
      } else {
        if (s.stock.length === 0) {
          // No stock to draw; force a discard-pile draw if possible, else break.
          if (canDrawDiscard(s, p)) drawDiscard(s, p);
          else break;
        } else {
          drawStock(s, p);
        }
      }

      // DISCARD or KNOCK
      expect(s.phase).toBe('discard');
      expect(s.hands[p]).toHaveLength(11);
      const { card: toDiscard, knock: doKnock } = aiChooseDiscard(s, p);
      expect(s.hands[p]!.some((c) => c.id === toDiscard.id)).toBe(true);

      if (doKnock && canKnock(s, p, toDiscard)) {
        knock(s, p, toDiscard);
      } else {
        discard(s, p, toDiscard);
      }

      // Invariant: every card accounted for, hands of 10 between turns.
      const total =
        s.hands[0]!.length + s.hands[1]!.length + s.stock.length + s.discard.length;
      expect(total).toBe(52);
      if (s.phase === 'draw') {
        expect(s.hands[0]).toHaveLength(10);
        expect(s.hands[1]).toHaveLength(10);
      }
    }

    expect(s.phase).toBe('gameOver');
    expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(TARGET_SCORE);
    const w = gameWinner(s);
    expect(s.scores[w]).toBe(Math.max(...s.scores));
  });
});
