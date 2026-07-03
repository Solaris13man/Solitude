import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '../cards/deck';
import {
  TARGET_SCORE,
  aiBid,
  aiPlay,
  gameWinner,
  isLegalPlay,
  legalPlays,
  newGame,
  placeBid,
  playCard,
  resolveTrick,
  startNextRound,
  teamOf,
  type SpadesState,
} from './engine';

function card(suit: Suit, rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank: rank as Rank, faceUp: true };
}

/** Build a controlled state with explicit hands. Defaults to a playing phase. */
function stateWithHands(hands: Card[][], overrides: Partial<SpadesState> = {}): SpadesState {
  return {
    seed: 0,
    round: 0,
    hands,
    trickCount: [0, 0, 0, 0],
    trick: [],
    leader: 0,
    turn: 0,
    dealer: 2,
    spadesBroken: false,
    bids: [3, 3, 3, 3],
    scores: [0, 0],
    bags: [0, 0],
    roundScore: [0, 0],
    phase: 'playing',
    ...overrides,
  };
}

describe('spades newGame', () => {
  it('deals 4 hands of 13 with 52 unique cards', () => {
    const s = newGame(123);
    expect(s.hands).toHaveLength(4);
    expect(s.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    const all = s.hands.flat();
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
    expect(s.phase).toBe('bidding');
    expect(s.dealer).toBe(2);
    expect(s.turn).toBe(3); // first bidder left of dealer
    expect(s.bids).toEqual([-1, -1, -1, -1]);
    expect(s.scores).toEqual([0, 0]);
    expect(s.bags).toEqual([0, 0]);
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

describe('spades teamOf', () => {
  it('groups seats into the two partnerships', () => {
    expect(teamOf(0)).toBe(0);
    expect(teamOf(2)).toBe(0);
    expect(teamOf(1)).toBe(1);
    expect(teamOf(3)).toBe(1);
  });
});

describe('spades bidding', () => {
  it('advances turn and transitions to playing once all 4 bid', () => {
    const s = newGame(5); // dealer 2, first bidder 3
    expect(s.turn).toBe(3);
    placeBid(s, 3, 4);
    expect(s.bids[3]).toBe(4);
    expect(s.turn).toBe(0);
    placeBid(s, 0, 3);
    expect(s.turn).toBe(1);
    placeBid(s, 1, 2);
    expect(s.turn).toBe(2);
    expect(s.phase).toBe('bidding');
    placeBid(s, 2, 0); // nil
    expect(s.phase).toBe('playing');
    // Leader is the seat left of the dealer.
    expect(s.leader).toBe(3);
    expect(s.turn).toBe(3);
    expect(s.bids).toEqual([3, 2, 0, 4]);
  });
});

describe('spades legalPlays', () => {
  it('requires following the led suit', () => {
    const hands = [
      [card('H', 2)],
      [card('C', 9), card('C', 13), card('H', 5)],
      [card('D', 3)],
      [card('D', 4)],
    ];
    const s = stateWithHands(hands, {
      leader: 0,
      turn: 1,
      trick: [{ player: 0, card: card('C', 2) }],
    });
    const legal = legalPlays(s, 1);
    expect(legal.map((c) => c.id).sort()).toEqual(['C13', 'C9']);
  });

  it('forbids leading a spade until broken (unless all spades)', () => {
    const hands = [
      [card('S', 5), card('H', 8), card('D', 9)],
      [],
      [],
      [],
    ];
    const s = stateWithHands(hands, { leader: 0, turn: 0, spadesBroken: false });
    expect(legalPlays(s, 0).map((c) => c.id).sort()).toEqual(['D9', 'H8']);

    // All-spades hand: spades become legal to lead.
    const allSpades = stateWithHands([[card('S', 5), card('S', 9)], [], [], []], {
      leader: 0,
      turn: 0,
      spadesBroken: false,
    });
    expect(legalPlays(allSpades, 0).map((c) => c.id).sort()).toEqual(['S5', 'S9']);

    // Once broken, spades may be led.
    const broken = stateWithHands(hands, { leader: 0, turn: 0, spadesBroken: true });
    expect(legalPlays(broken, 0).map((c) => c.id)).toContain('S5');
  });

  it('lets a spade be played when void in the led suit', () => {
    const hands = [
      [card('C', 2)],
      [card('S', 4), card('D', 6)], // void in clubs
      [],
      [],
    ];
    const s = stateWithHands(hands, {
      leader: 0,
      turn: 1,
      spadesBroken: false,
      trick: [{ player: 0, card: card('C', 2) }],
    });
    expect(legalPlays(s, 1).map((c) => c.id).sort()).toEqual(['D6', 'S4']);
  });
});

describe('spades resolveTrick winner logic', () => {
  it('a spade trumps a higher non-spade', () => {
    const hands = [[], [], [], []];
    const s = stateWithHands(hands, {
      leader: 0,
      turn: 3,
      trick: [
        { player: 0, card: card('H', 1) }, // Ace of hearts (led)
        { player: 1, card: card('H', 13) },
        { player: 2, card: card('S', 2) }, // low spade trumps
        { player: 3, card: card('H', 10) },
      ],
    });
    expect(resolveTrick(s)).toBe(2);
    expect(s.trickCount[2]).toBe(1);
    expect(s.leader).toBe(2);
    expect(s.turn).toBe(2);
    expect(s.trick).toHaveLength(0);
  });

  it('highest spade wins when several spades are played', () => {
    const s = stateWithHands([[], [], [], []], {
      trick: [
        { player: 0, card: card('C', 5) }, // led
        { player: 1, card: card('S', 7) },
        { player: 2, card: card('S', 1) }, // Ace of spades highest
        { player: 3, card: card('S', 13) },
      ],
    });
    expect(resolveTrick(s)).toBe(2);
  });

  it('otherwise highest card of the led suit wins', () => {
    const s = stateWithHands([[], [], [], []], {
      trick: [
        { player: 0, card: card('D', 3) }, // led
        { player: 1, card: card('D', 1) }, // Ace of diamonds (high)
        { player: 2, card: card('C', 13) }, // off suit, no spades
        { player: 3, card: card('D', 9) },
      ],
    });
    expect(resolveTrick(s)).toBe(1);
  });
});

describe('spades playCard breaks spades', () => {
  it('marks spadesBroken when a spade is played', () => {
    const hands = [
      [card('C', 2)],
      [card('S', 4)], // void in clubs, trumps
      [card('C', 7)],
      [card('C', 9)],
    ];
    const s = stateWithHands(hands, { leader: 0, turn: 0 });
    playCard(s, 0, card('C', 2));
    expect(s.turn).toBe(1);
    playCard(s, 1, card('S', 4));
    expect(s.spadesBroken).toBe(true);
    playCard(s, 2, card('C', 7));
    playCard(s, 3, card('C', 9));
    expect(s.turn).toBe(3); // unchanged when trick full
    expect(resolveTrick(s)).toBe(1); // the spade wins
  });

  it('rejects illegal plays', () => {
    const hands = [
      [card('C', 2), card('S', 5)],
      [],
      [],
      [],
    ];
    const s = stateWithHands(hands, {
      leader: 1,
      turn: 0,
      trick: [{ player: 1, card: card('C', 9) }],
    });
    // Must follow clubs; the spade is illegal.
    expect(isLegalPlay(s, 0, card('S', 5))).toBe(false);
    expect(() => playCard(s, 0, card('S', 5))).toThrow();
  });
});

/** Drive a trivial final trick (everyone holds one card) so endRound fires. */
function finishRound(s: SpadesState): void {
  // Each seat has exactly one card; seat = leader leads.
  const order = [s.leader, (s.leader + 1) % 4, (s.leader + 2) % 4, (s.leader + 3) % 4];
  for (const seat of order) {
    const c = s.hands[seat]![0]!;
    playCard(s, seat, c);
  }
  resolveTrick(s);
}

describe('spades scoring', () => {
  it('scores a made contract (+10/bid, +1/bag)', () => {
    const s = stateWithHands(
      [[card('D', 2)], [card('D', 3)], [card('D', 4)], [card('D', 5)]],
      {
        leader: 0,
        turn: 0,
        spadesBroken: true,
        trickCount: [3, 4, 1, 4], // before the last trick
        bids: [2, 4, 2, 4],
      },
    );
    finishRound(s);
    // Last trick: D5 (seat3) highest -> seat3 wins. Final counts:
    // team0 = seat0(3)+seat2(1) = 4, contract 4 -> +40, 0 bags.
    // team1 = seat1(4)+seat3(5) = 9, contract 8 -> +80, +1 bag.
    expect(s.trickCount).toEqual([3, 4, 1, 5]);
    expect(s.roundScore[0]).toBe(40);
    expect(s.bags[0]).toBe(0);
    expect(s.roundScore[1]).toBe(81);
    expect(s.bags[1]).toBe(1);
    expect(s.scores).toEqual([40, 81]);
  });

  it('scores a failed contract (-10/bid)', () => {
    const s = stateWithHands(
      [[card('D', 2)], [card('D', 3)], [card('D', 4)], [card('D', 5)]],
      {
        leader: 0,
        turn: 0,
        spadesBroken: true,
        trickCount: [1, 6, 1, 4], // before last trick
        bids: [6, 5, 1, 5], // team0 contract = 6 (seat0) + 1 (seat2) = 7
      },
    );
    finishRound(s);
    // Last trick: D5 seat3 wins. Counts: [1,6,1,5].
    // team0 contract = 6+1 = 7, tricks = 1+1 = 2 < 7 -> -70, no bags.
    expect(s.trickCount).toEqual([1, 6, 1, 5]);
    expect(s.roundScore[0]).toBe(-70);
    expect(s.bags[0]).toBe(0);
  });

  it('scores a successful nil (+100) and a failed nil (-100)', () => {
    // Successful nil: seat 0 bids nil and takes 0 tricks.
    const s = stateWithHands(
      [[card('D', 2)], [card('D', 3)], [card('D', 4)], [card('D', 5)]],
      {
        leader: 1, // seat 0 will not lead/win the last trick
        turn: 1,
        spadesBroken: true,
        trickCount: [0, 5, 4, 3], // seat0 = 0 so far
        bids: [0, 4, 4, 4],
      },
    );
    finishRound(s);
    // Last trick led by seat1, D5 (seat3) is highest -> seat3 wins. seat0 stays 0.
    expect(s.trickCount[0]).toBe(0);
    // team0: nil seat0 success +100; partner seat2 contract 4, team tricks = 0+4 = 4 -> +40.
    expect(s.roundScore[0]).toBe(140);

    // Failed nil: seat 0 bids nil but takes a trick.
    const f = stateWithHands(
      // seat0 holds Ace of diamonds (rank 1, high) so it wins the last trick.
      [[card('D', 1)], [card('D', 3)], [card('D', 4)], [card('D', 5)]],
      {
        leader: 0,
        turn: 0,
        spadesBroken: true,
        trickCount: [0, 4, 4, 4],
        bids: [0, 4, 4, 4],
      },
    );
    finishRound(f);
    expect(f.trickCount[0]).toBe(1); // nil broken
    // team0: failed nil -100; partner seat2 contract 4, team tricks = 1+4 = 5 -> +40 +1 bag.
    expect(f.roundScore[0]).toBe(-100 + 40 + 1);
    expect(f.bags[0]).toBe(1);
  });

  it('applies the 10-bags = -100 penalty', () => {
    const s = stateWithHands(
      [[card('D', 2)], [card('D', 3)], [card('D', 4)], [card('D', 5)]],
      {
        leader: 0,
        turn: 0,
        spadesBroken: true,
        bags: [9, 0], // team0 already at 9 bags
        trickCount: [5, 3, 4, 4], // before last trick
        bids: [3, 3, 3, 4], // team0 contract 6, takes lots -> many overtricks
      },
    );
    finishRound(s);
    // Last trick D5 seat3 wins -> counts [5,3,4,5].
    // team0: contract 6, tricks 9 -> +60, +3 bags. bags 9+3 = 12 -> one penalty: -100, bags->2.
    expect(s.trickCount).toEqual([5, 3, 4, 5]);
    expect(s.bags[0]).toBe(2);
    expect(s.roundScore[0]).toBe(60 + 3 - 100);
  });
});

describe('spades gameWinner', () => {
  it('returns the higher-scoring team', () => {
    const s = newGame(1);
    s.scores = [520, 300];
    expect(gameWinner(s)).toBe(0);
    s.scores = [300, 510];
    expect(gameWinner(s)).toBe(1);
  });
});

describe('spades startNextRound', () => {
  it('rotates the dealer and re-deals into a fresh bidding phase', () => {
    const s = newGame(7); // dealer 2
    s.phase = 'roundEnd';
    startNextRound(s);
    expect(s.round).toBe(1);
    expect(s.dealer).toBe(3);
    expect(s.phase).toBe('bidding');
    expect(s.turn).toBe(0); // left of dealer 3
    expect(s.leader).toBe(0);
    expect(s.bids).toEqual([-1, -1, -1, -1]);
    expect(s.trickCount).toEqual([0, 0, 0, 0]);
    expect(s.spadesBroken).toBe(false);
    expect(s.hands.flat()).toHaveLength(52);
  });
});

describe('spades aiBid', () => {
  it('returns a sane number in 0..13', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = newGame(seed);
      for (let seat = 0; seat < 4; seat++) {
        const bid = aiBid(s, seat);
        expect(bid).toBeGreaterThanOrEqual(0);
        expect(bid).toBeLessThanOrEqual(13);
        expect(Number.isInteger(bid)).toBe(true);
      }
    }
  });

  it('bids high on a strong spade-heavy hand', () => {
    const strong = [
      card('S', 1), card('S', 13), card('S', 12), card('S', 7), card('S', 4),
      card('H', 1), card('D', 1), card('C', 1),
      card('H', 2), card('D', 2), card('C', 2), card('H', 3), card('D', 3),
    ];
    const s = stateWithHands([strong, [], [], []]);
    expect(aiBid(s, 0)).toBeGreaterThanOrEqual(6);
  });
});

describe('spades aiPlay covers a nil partner', () => {
  it('overtakes when the nil partner is currently winning the trick', () => {
    // Player 0 bid nil; partner is player 2 (same team). Trick so far:
    // P3 led H5, nil P0 was forced up to H9 (currently winning), P1 dumped H2.
    // P2 holds a heart that can overtake — covering the nil is mandatory,
    // even though "the partner is winning".
    const hands: Card[][] = [
      [],
      [],
      [card('H', 10), card('H', 3), card('C', 4)],
      [],
    ];
    const s = stateWithHands(hands, {
      leader: 3,
      turn: 2,
      bids: [0, 3, 3, 3],
      trick: [
        { player: 3, card: card('H', 5) },
        { player: 0, card: card('H', 9) },
        { player: 1, card: card('H', 2) },
      ],
    });
    const chosen = aiPlay(s, 2);
    expect(chosen.id).toBe('H10');
  });

  it('still ducks when the winning teammate is not the nil player', () => {
    // Same layout but nobody bid nil: P2 should duck under its partner's H9.
    const hands: Card[][] = [
      [],
      [],
      [card('H', 10), card('H', 3), card('C', 4)],
      [],
    ];
    const s = stateWithHands(hands, {
      leader: 3,
      turn: 2,
      bids: [3, 3, 3, 3],
      trick: [
        { player: 3, card: card('H', 5) },
        { player: 0, card: card('H', 9) },
        { player: 1, card: card('H', 2) },
      ],
    });
    const chosen = aiPlay(s, 2);
    expect(chosen.id).toBe('H3');
  });

  it('rejects a NaN bid', () => {
    const s = stateWithHands([[], [], [], []], { phase: 'bidding', bids: [-1, -1, -1, -1], turn: 0 });
    expect(() => placeBid(s, 0, Number('x'))).toThrow();
  });
});

describe('spades aiPlay full game', () => {
  it('plays a whole all-AI game to gameOver with legal moves', () => {
    const s = newGame(2024);

    function bidAll(state: SpadesState): void {
      while (state.bids.some((b) => b === -1)) {
        const seat = state.turn;
        placeBid(state, seat, aiBid(state, seat));
      }
    }

    function playRound(state: SpadesState): void {
      for (let t = 0; t < 13; t++) {
        for (let i = 0; i < 4; i++) {
          const seat = state.turn;
          const choice = aiPlay(state, seat);
          expect(isLegalPlay(state, seat, choice)).toBe(true);
          playCard(state, seat, choice);
        }
        resolveTrick(state);
      }
    }

    let safety = 0;
    while (s.phase !== 'gameOver' && safety < 500) {
      safety++;
      if (s.phase === 'bidding') bidAll(s);
      if (s.phase === 'playing') {
        playRound(s);
        // 13 tricks distributed each round.
        expect(s.trickCount.reduce((a, b) => a + b, 0)).toBe(13);
      }
      if (s.phase === 'roundEnd') startNextRound(s);
    }

    expect(s.phase).toBe('gameOver');
    expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(TARGET_SCORE);
    const winner = gameWinner(s);
    expect(s.scores[winner]).toBe(Math.max(...s.scores));
  });
});
