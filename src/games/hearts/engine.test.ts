import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '../cards/deck';
import {
  TARGET_SCORE,
  aiPass,
  aiPlay,
  applyPass,
  gameWinner,
  isLegalPlay,
  legalPlays,
  newGame,
  passTarget,
  playCard,
  pointsOf,
  resolveTrick,
  startNextRound,
  type HeartsState,
} from './engine';

function card(suit: Suit, rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank, faceUp: true };
}

describe('hearts newGame', () => {
  it('deals 4 hands of 13 with 52 unique cards', () => {
    const s = newGame(123);
    expect(s.hands).toHaveLength(4);
    expect(s.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    const all = s.hands.flat();
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
    expect(s.phase).toBe('passing');
    expect(s.passDir).toBe(0);
    expect(s.round).toBe(0);
  });

  it('is deterministic for a seed', () => {
    const a = newGame(99);
    const b = newGame(99);
    expect(a.hands.flat().map((c) => c.id)).toEqual(b.hands.flat().map((c) => c.id));
    const c = newGame(100);
    expect(a.hands.flat().map((x) => x.id)).not.toEqual(c.hands.flat().map((x) => x.id));
  });
});

describe('hearts passTarget', () => {
  it('handles all 4 directions', () => {
    // left = +1
    expect(passTarget(0, 0)).toBe(1);
    expect(passTarget(3, 0)).toBe(0);
    // right = +3
    expect(passTarget(0, 1)).toBe(3);
    expect(passTarget(1, 1)).toBe(0);
    // across = +2
    expect(passTarget(0, 2)).toBe(2);
    expect(passTarget(3, 2)).toBe(1);
    // none = self
    expect(passTarget(0, 3)).toBe(0);
    expect(passTarget(2, 3)).toBe(2);
  });
});

/** Build a controlled state with explicit hands and no taken cards. */
function stateWithHands(hands: Card[][], overrides: Partial<HeartsState> = {}): HeartsState {
  return {
    seed: 0,
    round: 0,
    hands,
    taken: [[], [], [], []],
    trick: [],
    leader: 0,
    turn: 0,
    heartsBroken: false,
    scores: [0, 0, 0, 0],
    roundPoints: [0, 0, 0, 0],
    passDir: 3,
    phase: 'playing',
    ...overrides,
  };
}

describe('hearts legalPlays', () => {
  it('forces the 2 of clubs lead on the first trick', () => {
    const hands = [
      [card('C', 2), card('C', 5), card('H', 7), card('S', 10)],
      [card('D', 2)],
      [card('D', 3)],
      [card('D', 4)],
    ];
    const s = stateWithHands(hands, { leader: 0, turn: 0 });
    const legal = legalPlays(s, 0);
    expect(legal).toHaveLength(1);
    expect(legal[0]!.id).toBe('C2');
  });

  it('requires following suit', () => {
    const hands = [
      [card('C', 2)],
      [card('C', 9), card('C', 13), card('H', 5)],
      [card('D', 3)],
      [card('D', 4)],
    ];
    // Past the first trick so the no-points rule does not apply.
    const s = stateWithHands(hands, {
      leader: 0,
      turn: 1,
      trick: [{ player: 0, card: card('C', 2) }],
      taken: [[card('D', 7)], [], [], []],
    });
    const legal = legalPlays(s, 1);
    expect(legal.map((c) => c.id).sort()).toEqual(['C13', 'C9']);
  });

  it('does not let hearts be led until broken', () => {
    const hands = [
      [card('H', 5), card('S', 8), card('D', 9)],
      [],
      [],
      [],
    ];
    const s = stateWithHands(hands, {
      leader: 0,
      turn: 0,
      heartsBroken: false,
      taken: [[card('C', 2)], [card('C', 3)], [card('C', 4)], [card('C', 5)]],
    });
    const legal = legalPlays(s, 0);
    expect(legal.map((c) => c.id).sort()).toEqual(['D9', 'S8']);

    // All hearts: must be allowed.
    const allHearts = stateWithHands(
      [[card('H', 5), card('H', 9)], [], [], []],
      {
        leader: 0,
        turn: 0,
        heartsBroken: false,
        taken: [[card('C', 2)], [], [], []],
      },
    );
    expect(legalPlays(allHearts, 0).map((c) => c.id).sort()).toEqual(['H5', 'H9']);

    // Once broken, hearts can be led.
    const broken = stateWithHands(hands, {
      leader: 0,
      turn: 0,
      heartsBroken: true,
      taken: [[card('C', 2)], [], [], []],
    });
    expect(legalPlays(broken, 0).map((c) => c.id)).toContain('H5');
  });

  it('forbids point cards on the first trick when sluffing (unless all points)', () => {
    const hands = [
      [card('C', 2)],
      [card('C', 9)],
      // North is void in clubs, has a heart, Q♠ and a safe diamond.
      [card('H', 9), card('S', 12), card('D', 4)],
      [card('C', 5)],
    ];
    const s = stateWithHands(hands, {
      leader: 0,
      turn: 2,
      trick: [
        { player: 0, card: card('C', 2) },
        { player: 1, card: card('C', 9) },
      ],
    });
    const legal = legalPlays(s, 2);
    expect(legal.map((c) => c.id)).toEqual(['D4']);

    // If hand is all points, points become legal on the first trick.
    const allPoints = stateWithHands(
      [
        [card('C', 2)],
        [card('C', 9)],
        [card('H', 9), card('S', 12)],
        [card('C', 5)],
      ],
      {
        leader: 0,
        turn: 2,
        trick: [
          { player: 0, card: card('C', 2) },
          { player: 1, card: card('C', 9) },
        ],
      },
    );
    expect(legalPlays(allPoints, 2).map((c) => c.id).sort()).toEqual(['H9', 'S12']);
  });
});

describe('hearts playCard and resolveTrick', () => {
  it('determines the right winner and moves points', () => {
    const hands = [
      [card('C', 2)],
      [card('C', 13)],
      [card('H', 4)], // North void in clubs, sluffs a heart
      [card('C', 7)],
    ];
    const s = stateWithHands(hands, {
      leader: 0,
      turn: 0,
      taken: [[card('D', 9)], [], [], []], // not the first trick
    });
    playCard(s, 0, card('C', 2));
    expect(s.turn).toBe(1);
    playCard(s, 1, card('C', 13));
    playCard(s, 2, card('H', 4));
    expect(s.heartsBroken).toBe(true);
    playCard(s, 3, card('C', 7));
    expect(s.trick).toHaveLength(4);
    // turn unchanged when trick full
    expect(s.turn).toBe(3);

    const winner = resolveTrick(s);
    expect(winner).toBe(1); // K of clubs highest of led suit
    expect(s.taken[1]).toHaveLength(4);
    expect(pointsOf(s.taken[1]!)).toBe(1); // the heart
    expect(s.leader).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.trick).toHaveLength(0);
  });

  it('rejects illegal plays', () => {
    const hands = [
      [card('C', 2), card('H', 5)],
      [],
      [],
      [],
    ];
    const s = stateWithHands(hands, { leader: 0, turn: 0 });
    // First trick forces the 2 of clubs.
    expect(isLegalPlay(s, 0, card('H', 5))).toBe(false);
    expect(() => playCard(s, 0, card('H', 5))).toThrow();
  });
});

describe('hearts pointsOf', () => {
  it('counts hearts as 1 and Q of spades as 13 (26 on a full set)', () => {
    const hearts = Array.from({ length: 13 }, (_, i) => card('H', i + 1));
    const full = [...hearts, card('S', 12)];
    expect(pointsOf(full)).toBe(26);
    expect(pointsOf([card('S', 12)])).toBe(13);
    expect(pointsOf([card('H', 1), card('H', 7)])).toBe(2);
    expect(pointsOf([card('C', 5), card('D', 9)])).toBe(0);
  });
});

describe('hearts scoring', () => {
  function emptyHands(): Card[][] {
    return [[], [], [], []];
  }

  it('shooting the moon scores 0 for the shooter and +26 for others', () => {
    // Drive the final trick so endRound fires with all points held by seat 2.
    const hands: Card[][] = [
      [card('D', 2)],
      [card('D', 3)],
      [card('D', 4)],
      [card('D', 5)],
    ];
    const allPoints = [
      ...Array.from({ length: 13 }, (_, i) => card('H', i + 1)),
      card('S', 12),
    ];
    const s = stateWithHands(hands, {
      leader: 2,
      turn: 2,
      heartsBroken: true,
      taken: [[], [], allPoints, []], // seat 2 already holds all 26 points
    });
    // Play out the last trick (seat 2 leads and wins to keep it simple).
    playCard(s, 2, card('D', 4));
    playCard(s, 3, card('D', 5));
    playCard(s, 0, card('D', 2));
    playCard(s, 1, card('D', 3));
    resolveTrick(s);

    expect(s.phase).toBe('roundEnd');
    expect(s.roundPoints).toEqual([26, 26, 0, 26]);
    expect(s.scores).toEqual([26, 26, 0, 26]);
  });

  it('normal round scores each seat its own points', () => {
    const hands: Card[][] = [
      [card('D', 2)],
      [card('D', 3)],
      [card('D', 4)],
      [card('D', 5)],
    ];
    const s = stateWithHands(hands, {
      leader: 0,
      turn: 0,
      heartsBroken: true,
      taken: [[card('H', 5)], [card('S', 12)], [], [card('H', 9), card('H', 2)]],
    });
    playCard(s, 0, card('D', 2));
    playCard(s, 1, card('D', 3));
    playCard(s, 2, card('D', 4));
    playCard(s, 3, card('D', 5));
    resolveTrick(s); // seat 3 wins; just empties hands, adds non-point diamonds

    expect(s.phase).toBe('roundEnd');
    expect(s.roundPoints).toEqual([1, 13, 0, 2]);
    expect(s.scores).toEqual([1, 13, 0, 2]);
  });

  it('sets gameOver and gameWinner picks the lowest score', () => {
    const s = newGame(1);
    s.scores = [50, 105, 30, 90];
    expect(gameWinner(s)).toBe(2);
  });
});

describe('hearts startNextRound', () => {
  it('rotates pass direction and re-deals', () => {
    const s = newGame(7);
    s.phase = 'roundEnd';
    startNextRound(s);
    expect(s.round).toBe(1);
    expect(s.passDir).toBe(1);
    expect(s.phase).toBe('passing');
    expect(s.hands.flat()).toHaveLength(52);
    expect(s.taken.every((t) => t.length === 0)).toBe(true);

    // Advance to a 'none' round (passDir 3) -> straight to playing.
    s.round = 2;
    s.phase = 'roundEnd';
    startNextRound(s);
    expect(s.round).toBe(3);
    expect(s.passDir).toBe(3);
    expect(s.phase).toBe('playing');
    const holder = s.hands.findIndex((h) => h.some((c) => c.suit === 'C' && c.rank === 2));
    expect(s.leader).toBe(holder);
    expect(s.turn).toBe(holder);
  });
});

describe('hearts aiPass', () => {
  it('passes the 3 most dangerous cards', () => {
    const hand = [
      card('S', 12), // Q♠ danger 100
      card('S', 1), // A♠ danger 80
      card('H', 13), // high heart
      card('C', 3),
      card('D', 5),
      card('D', 6),
    ];
    const s = stateWithHands([hand, [], [], []]);
    const passed = aiPass(s, 0);
    expect(passed).toHaveLength(3);
    const ids = passed.map((c) => c.id);
    expect(ids).toContain('S12');
    expect(ids).toContain('S1');
  });
});

describe('hearts aiPlay full game', () => {
  it('plays a whole all-AI game to completion with legal moves', () => {
    let s = newGame(2024);

    function autoPass(state: HeartsState): void {
      if (state.phase !== 'passing') return;
      const passes = [0, 1, 2, 3].map((seat) => aiPass(state, seat));
      applyPass(state, passes);
    }

    function playRound(state: HeartsState): void {
      // 13 tricks.
      for (let t = 0; t < 13; t++) {
        for (let i = 0; i < 4; i++) {
          const seat = state.turn;
          const choice = aiPlay(state, seat);
          // aiPlay must always return a legal card.
          expect(isLegalPlay(state, seat, choice)).toBe(true);
          playCard(state, seat, choice);
        }
        resolveTrick(state);
      }
    }

    let safety = 0;
    while (s.phase !== 'gameOver' && safety < 200) {
      safety++;
      if (s.phase === 'passing') {
        autoPass(s);
      }
      if (s.phase === 'playing') {
        playRound(s);
        // All 52 cards distributed among the taken piles each round.
        expect(s.taken.flat()).toHaveLength(52);
      }
      if (s.phase === 'roundEnd') {
        startNextRound(s);
      }
    }

    expect(s.phase).toBe('gameOver');
    // Someone reached the target.
    expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(TARGET_SCORE);
    const winner = gameWinner(s);
    expect(s.scores[winner]).toBe(Math.min(...s.scores));
  });
});
