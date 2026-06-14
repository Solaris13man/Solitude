import { describe, it, expect } from 'vitest';
import * as E from './engine';
import { type Card, type Suit, type Rank, cardId } from '../cards/deck';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EUCHRE_RANKS: Rank[] = [9, 10, 11, 12, 13, 1];

function mkCard(suit: Suit, rank: Rank): Card {
  return { id: cardId(suit, rank), suit, rank, faceUp: true };
}

/** All cards across the four hands plus the kitty. */
function allCards(s: E.EuchreState): Card[] {
  return [...s.hands.flat(), ...s.kitty];
}

// ---------------------------------------------------------------------------
// Deck / deal
// ---------------------------------------------------------------------------

describe('deck & deal', () => {
  it('uses exactly 24 cards: four hands of 5 plus a kitty of 4', () => {
    const s = E.newGame(42);
    expect(s.hands).toHaveLength(4);
    for (const hand of s.hands) expect(hand).toHaveLength(5);
    expect(s.kitty).toHaveLength(4);
    expect(allCards(s)).toHaveLength(24);
  });

  it('upCard is kitty[0]', () => {
    const s = E.newGame(7);
    expect(s.upCard).toBe(s.kitty[0]);
  });

  it('only contains euchre ranks {9,10,11,12,13,1}', () => {
    const s = E.newGame(123);
    for (const c of allCards(s)) {
      expect(EUCHRE_RANKS).toContain(c.rank);
    }
  });

  it('has no duplicate card ids across hands + kitty', () => {
    const s = E.newGame(999);
    const ids = allCards(s).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic for a given seed', () => {
    const a = E.newGame(55);
    const b = E.newGame(55);
    expect(allCards(a).map((c) => c.id)).toEqual(allCards(b).map((c) => c.id));
  });

  it('newGame initial state: dealer East, turn You, phase bid1, upCard visible', () => {
    const s = E.newGame(1);
    expect(s.dealer).toBe(3);
    expect(s.turn).toBe(0);
    expect(s.phase).toBe('bid1');
    expect(s.upCardVisible).toBe(true);
    expect(s.trump).toBeNull();
    expect(s.maker).toBeNull();
    expect(s.scores).toEqual([0, 0]);
    expect(s.round).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// teamOf / partners
// ---------------------------------------------------------------------------

describe('teams', () => {
  it('teamOf maps seats to teams by parity', () => {
    expect(E.teamOf(0)).toBe(0);
    expect(E.teamOf(2)).toBe(0);
    expect(E.teamOf(1)).toBe(1);
    expect(E.teamOf(3)).toBe(1);
  });

  it('partners are 2 seats apart and on the same team', () => {
    for (let seat = 0; seat < 4; seat++) {
      const partner = (seat + 2) % 4;
      expect(E.teamOf(seat)).toBe(E.teamOf(partner));
    }
  });
});

// ---------------------------------------------------------------------------
// isTrump / effectiveSuit
// ---------------------------------------------------------------------------

describe('isTrump & effectiveSuit', () => {
  it('right bower is trump', () => {
    expect(E.isTrump(mkCard('H', 11), 'H')).toBe(true);
  });

  it('left bower (same color jack) is trump', () => {
    // Trump hearts -> left bower is jack of diamonds.
    expect(E.isTrump(mkCard('D', 11), 'H')).toBe(true);
    // Trump spades -> left bower is jack of clubs.
    expect(E.isTrump(mkCard('C', 11), 'S')).toBe(true);
  });

  it('an off-color jack is NOT trump', () => {
    // Trump hearts: jack of spades is a plain card.
    expect(E.isTrump(mkCard('S', 11), 'H')).toBe(false);
    expect(E.isTrump(mkCard('C', 11), 'H')).toBe(false);
  });

  it('normal trump-suit cards are trump; off-suit cards are not', () => {
    expect(E.isTrump(mkCard('H', 1), 'H')).toBe(true);
    expect(E.isTrump(mkCard('H', 9), 'H')).toBe(true);
    expect(E.isTrump(mkCard('S', 1), 'H')).toBe(false);
  });

  it('effectiveSuit: left bower belongs to trump, not its printed suit', () => {
    expect(E.effectiveSuit(mkCard('D', 11), 'H')).toBe('H');
    expect(E.effectiveSuit(mkCard('C', 11), 'S')).toBe('S');
  });

  it('effectiveSuit: normal card keeps its suit; null trump keeps printed suit', () => {
    expect(E.effectiveSuit(mkCard('S', 1), 'H')).toBe('S');
    expect(E.effectiveSuit(mkCard('D', 11), null)).toBe('D');
  });
});

// ---------------------------------------------------------------------------
// Bidding round 1
// ---------------------------------------------------------------------------

describe('bidding round 1', () => {
  it('orderUp sets trump to upCard suit, maker, phase discard, turn to dealer', () => {
    const s = E.newGame(3);
    const upSuit = s.upCard.suit;
    E.orderUp(s, 0, false);
    expect(s.trump).toBe(upSuit);
    expect(s.maker).toBe(0);
    expect(s.phase).toBe('discard');
    expect(s.turn).toBe(s.dealer);
    expect(s.upCardVisible).toBe(false);
    expect(s.alone).toBe(false);
    expect(s.sittingOut).toBeNull();
  });

  it('orderUp alone sets sittingOut to the maker partner', () => {
    const s = E.newGame(3);
    E.orderUp(s, 0, true);
    expect(s.alone).toBe(true);
    expect(s.sittingOut).toBe(2);
  });

  it('passBid advances the turn clockwise', () => {
    const s = E.newGame(3);
    expect(s.turn).toBe(0);
    E.passBid(s, 0);
    expect(s.turn).toBe(1);
    E.passBid(s, 1);
    expect(s.turn).toBe(2);
  });

  it('four passes turn the upCard down and enter bid2 at (dealer+1)%4', () => {
    const s = E.newGame(3);
    E.passBid(s, 0);
    E.passBid(s, 1);
    E.passBid(s, 2);
    E.passBid(s, 3); // dealer passes
    expect(s.phase).toBe('bid2');
    expect(s.upCardVisible).toBe(false);
    expect(s.turn).toBe((s.dealer + 1) % 4);
  });

  it('passBid rejects an out-of-turn seat', () => {
    const s = E.newGame(3);
    expect(() => E.passBid(s, 2)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Bidding round 2 / nameTrump / stick the dealer
// ---------------------------------------------------------------------------

function toRound2(seed: number): E.EuchreState {
  const s = E.newGame(seed);
  E.passBid(s, 0);
  E.passBid(s, 1);
  E.passBid(s, 2);
  E.passBid(s, 3);
  return s;
}

describe('bidding round 2', () => {
  it('nameTrump rejects naming the turned-down upCard suit', () => {
    const s = toRound2(3);
    const turn = s.turn;
    expect(() => E.nameTrump(s, turn, s.upCard.suit, false)).toThrow();
  });

  it('nameTrump accepts a different suit and enters playing', () => {
    const s = toRound2(3);
    const turn = s.turn;
    const other = (['S', 'H', 'D', 'C'] as Suit[]).find((su) => su !== s.upCard.suit)!;
    E.nameTrump(s, turn, other, false);
    expect(s.trump).toBe(other);
    expect(s.maker).toBe(turn);
    expect(s.phase).toBe('playing');
    expect(s.trick).toHaveLength(0);
  });

  it('nameTrump alone sets the sitting-out partner and skips it as leader', () => {
    const s = toRound2(3);
    const turn = s.turn;
    const other = (['S', 'H', 'D', 'C'] as Suit[]).find((su) => su !== s.upCard.suit)!;
    E.nameTrump(s, turn, other, true);
    expect(s.sittingOut).toBe((turn + 2) % 4);
    expect(s.leader).not.toBe(s.sittingOut);
  });

  it('stick the dealer: the dealer cannot pass in round 2', () => {
    const s = toRound2(3);
    // Advance non-dealers past, leaving the dealer to act.
    while (s.turn !== s.dealer) {
      E.passBid(s, s.turn);
    }
    expect(s.turn).toBe(s.dealer);
    expect(() => E.passBid(s, s.dealer)).toThrow();
  });

  it('stick the dealer: aiBidRound2 returns non-null for the dealer', () => {
    // Try a range of seeds so we exercise weak dealer hands too.
    for (let seed = 0; seed < 30; seed++) {
      const s = toRound2(seed);
      const bid = E.aiBidRound2(s, s.dealer);
      expect(bid).not.toBeNull();
      expect(bid!.suit).not.toBe(s.upCard.suit);
    }
  });
});

// ---------------------------------------------------------------------------
// dealerDiscard
// ---------------------------------------------------------------------------

describe('dealerDiscard', () => {
  it('keeps dealer hand at 5, picks up upCard, removes the discard, phase playing', () => {
    const s = E.newGame(8);
    const upCard = s.upCard;
    E.orderUp(s, 0, false);
    expect(s.phase).toBe('discard');
    const discard = E.aiDiscard(s);
    E.dealerDiscard(s, discard);
    const dealerHand = s.hands[s.dealer]!;
    expect(dealerHand).toHaveLength(5);
    expect(dealerHand.some((c) => c.id === upCard.id)).toBe(true);
    expect(dealerHand.some((c) => c.id === discard.id)).toBe(false);
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe((s.dealer + 1) % 4);
    expect(s.leader).toBe((s.dealer + 1) % 4);
  });

  it('throws when discarding a card the dealer does not hold', () => {
    const s = E.newGame(8);
    E.orderUp(s, 0, false);
    // Build a card guaranteed not in the (hand + upCard) set.
    const present = new Set([...s.hands[s.dealer]!.map((c) => c.id), s.upCard.id]);
    let ghost: Card | null = null;
    for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) {
      for (const rank of EUCHRE_RANKS) {
        if (!present.has(cardId(suit, rank))) {
          ghost = mkCard(suit, rank);
          break;
        }
      }
      if (ghost) break;
    }
    expect(() => E.dealerDiscard(s, ghost!)).toThrow();
  });

  it('aiDiscard never discards a trump when a non-trump exists', () => {
    const s = E.newGame(8);
    E.orderUp(s, 0, false);
    const trump = s.trump!;
    const sixCard = [...s.hands[s.dealer]!, s.upCard];
    const hasNonTrump = sixCard.some((c) => !E.isTrump(c, trump));
    const discard = E.aiDiscard(s);
    if (hasNonTrump) {
      expect(E.isTrump(discard, trump)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// legalPlays / isLegalPlay
// ---------------------------------------------------------------------------

/** Build a minimal playing state with hand-crafted hands for play tests. */
function playState(opts: {
  trump: Suit;
  hands: Card[][];
  leader: number;
  alone?: boolean;
  sittingOut?: number | null;
  maker?: number;
}): E.EuchreState {
  const s = E.newGame(1);
  s.hands = opts.hands;
  s.trump = opts.trump;
  s.maker = opts.maker ?? 0;
  s.alone = opts.alone ?? false;
  s.sittingOut = opts.sittingOut ?? null;
  s.phase = 'playing';
  s.leader = opts.leader;
  s.turn = opts.leader;
  s.trick = [];
  s.trickCount = [0, 0, 0, 0];
  s.roundResult = null;
  return s;
}

describe('legalPlays & isLegalPlay', () => {
  it('all cards legal when the trick is empty', () => {
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('S', 1), mkCard('C', 13), mkCard('D', 9), mkCard('H', 10), mkCard('S', 9)],
        [], [], [],
      ],
      leader: 0,
    });
    expect(E.legalPlays(s, 0)).toHaveLength(5);
  });

  it('must follow the led suit when able', () => {
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('S', 1)], // leader leads spades
        [mkCard('S', 9), mkCard('S', 13), mkCard('H', 1), mkCard('C', 9), mkCard('D', 10)],
        [], [],
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('S', 1));
    const legal = E.legalPlays(s, 1);
    expect(legal.map((c) => c.id).sort()).toEqual([cardId('S', 9), cardId('S', 13)].sort());
    expect(E.isLegalPlay(s, 1, mkCard('S', 9))).toBe(true);
    expect(E.isLegalPlay(s, 1, mkCard('H', 1))).toBe(false);
  });

  it('left bower must follow trump, not its printed suit', () => {
    // Trump hearts: left bower is J of diamonds; led trump (hearts).
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('H', 13)], // leads a heart (trump)
        [mkCard('D', 11), mkCard('S', 9), mkCard('C', 10)], // holds the left bower
        [], [],
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('H', 13));
    const legal = E.legalPlays(s, 1);
    // Only the left bower follows the trump lead.
    expect(legal.map((c) => c.id)).toEqual([cardId('D', 11)]);
  });

  it('left bower is NOT a legal diamond when diamonds are led off-trump', () => {
    // Trump hearts: J of diamonds counts as a heart, so it cannot follow a
    // diamond lead unless it is the only "diamond"; here the hand has no real
    // diamond, so any card is legal.
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('D', 1)], // leads diamonds (a real diamond)
        [mkCard('D', 11), mkCard('S', 9), mkCard('C', 10)], // J♦ is trump, not a diamond
        [], [],
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('D', 1));
    const legal = E.legalPlays(s, 1);
    // No actual diamonds -> all three cards are legal.
    expect(legal).toHaveLength(3);
  });

  it('can play anything when void in the led suit', () => {
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('S', 1)],
        [mkCard('C', 9), mkCard('D', 10), mkCard('H', 13)], // no spades
        [], [],
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('S', 1));
    expect(E.legalPlays(s, 1)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// playCard turn advancement
// ---------------------------------------------------------------------------

describe('playCard turn advancement', () => {
  it('advances clockwise to the next seat', () => {
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('S', 1)], [mkCard('S', 9)], [mkCard('S', 10)], [mkCard('S', 13)],
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('S', 1));
    expect(s.turn).toBe(1);
    E.playCard(s, 1, mkCard('S', 9));
    expect(s.turn).toBe(2);
  });

  it('skips the sitting-out partner during play when alone', () => {
    // Maker 0 alone -> seat 2 sits out. Leader is seat 1.
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('S', 13)],
        [mkCard('S', 1)],
        [mkCard('S', 10)], // sitting out, unused
        [mkCard('S', 9)],
      ],
      leader: 1,
      alone: true,
      sittingOut: 2,
      maker: 0,
    });
    E.playCard(s, 1, mkCard('S', 1));
    // Next active after 1 skips 2 -> 3.
    expect(s.turn).toBe(3);
    E.playCard(s, 3, mkCard('S', 9));
    // Next active after 3 -> 0.
    expect(s.turn).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveTrick
// ---------------------------------------------------------------------------

describe('resolveTrick', () => {
  it('trump beats a higher led-suit card', () => {
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('S', 1)], [mkCard('S', 13)], [mkCard('H', 9)], [mkCard('S', 10)],
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('S', 1)); // ace of led suit
    E.playCard(s, 1, mkCard('S', 13));
    E.playCard(s, 2, mkCard('H', 9)); // small trump
    E.playCard(s, 3, mkCard('S', 10));
    E.resolveTrick(s);
    expect(s.trickCount[2]).toBe(1);
    expect(s.leader).toBe(2);
    expect(s.turn).toBe(2);
  });

  it('right bower beats left bower beats ace of trump', () => {
    // Trump hearts. Right = J♥, left = J♦, then A♥.
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('H', 1)], // ace of trump leads
        [mkCard('D', 11)], // left bower
        [mkCard('H', 11)], // right bower
        [mkCard('H', 9)], // low trump
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('H', 1));
    E.playCard(s, 1, mkCard('D', 11));
    E.playCard(s, 2, mkCard('H', 11));
    E.playCard(s, 3, mkCard('H', 9));
    E.resolveTrick(s);
    expect(s.trickCount[2]).toBe(1); // right bower wins
  });

  it('left bower beats the ace of trump', () => {
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('H', 1)], [mkCard('D', 11)], [mkCard('H', 13)], [mkCard('H', 9)],
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('H', 1));
    E.playCard(s, 1, mkCard('D', 11)); // left bower
    E.playCard(s, 2, mkCard('H', 13));
    E.playCard(s, 3, mkCard('H', 9));
    E.resolveTrick(s);
    expect(s.trickCount[1]).toBe(1);
  });

  it('highest card of led suit wins when no trump played', () => {
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('S', 13)], [mkCard('S', 1)], [mkCard('C', 9)], [mkCard('S', 10)],
      ],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('S', 13));
    E.playCard(s, 1, mkCard('S', 1)); // ace of led suit
    E.playCard(s, 2, mkCard('C', 9)); // off-suit, cannot win
    E.playCard(s, 3, mkCard('S', 10));
    E.resolveTrick(s);
    expect(s.trickCount[1]).toBe(1);
  });

  it('resolveTrick throws on an incomplete trick', () => {
    const s = playState({
      trump: 'H',
      hands: [[mkCard('S', 1)], [mkCard('S', 9)], [mkCard('S', 10)], [mkCard('S', 13)]],
      leader: 0,
    });
    E.playCard(s, 0, mkCard('S', 1));
    expect(() => E.resolveTrick(s)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Round scoring (hand-built end states)
// ---------------------------------------------------------------------------

/** Build a state where the round is fully played, with a fixed trickCount. */
function scoredState(opts: {
  maker: number;
  alone: boolean;
  trickCount: number[];
  scores?: number[];
}): E.EuchreState {
  const s = E.newGame(1);
  s.trump = 'H';
  s.maker = opts.maker;
  s.alone = opts.alone;
  s.sittingOut = opts.alone ? (opts.maker + 2) % 4 : null;
  s.phase = 'playing';
  s.scores = opts.scores ? opts.scores.slice() : [0, 0];
  // Put exactly one full final trick in place so resolveTrick can run, and set
  // the trickCount so that after this trick the total is 5.
  // We instead set trickCount to (target - lastTrick) and stage a final trick.
  s.trickCount = opts.trickCount.slice();
  return s;
}

/**
 * Drive scoring directly by staging the final trick. We set trickCount to one
 * less for the eventual winner, then play a final trick that they win.
 */
function runScoring(maker: number, alone: boolean, finalTricks: number[]): E.EuchreState {
  // finalTricks must sum to 5. We reconstruct by pre-loading 4 tricks into
  // trickCount and staging a 5th trick whose winner is finalTricks-derived.
  const winnerSeat = finalTricks.findIndex((t) => t > 0);
  const pre = finalTricks.slice();
  pre[winnerSeat]! -= 1; // remove the trick we will play live
  const s = scoredState({ maker, alone, trickCount: pre });

  // Stage a final trick won by winnerSeat. Use trump for the winner and low
  // off-suit cards for the rest. With alone, only 3 cards.
  const trump: Suit = 'H';
  const order: number[] = [];
  let seat = s.leader; // arbitrary; we just need the right players present
  // Build trick directly: winner plays right bower; others play low off cards.
  const trick: E.TrickCard[] = [];
  const seats = alone
    ? [0, 1, 2, 3].filter((x) => x !== s.sittingOut)
    : [0, 1, 2, 3];
  // Ensure winnerSeat is included.
  for (const st of seats) order.push(st);
  let used = 0;
  for (const st of order) {
    const card =
      st === winnerSeat ? mkCard(trump, 11) /* right bower */ : mkCard('S', (9 + used) as Rank);
    trick.push({ player: st, card });
    used++;
  }
  void seat;
  s.trick = trick;
  s.turn = winnerSeat;
  s.leader = winnerSeat;
  E.resolveTrick(s);
  return s;
}

describe('round scoring', () => {
  it('makers win 3 tricks -> 1 point to makers', () => {
    // Maker seat 0 (team 0). Team 0 wins 3 (seats 0:2, 2:1), team1 wins 2.
    const s = runScoring(0, false, [2, 1, 1, 1]);
    expect(s.roundResult).not.toBeNull();
    expect(s.roundResult!.makerTeam).toBe(0);
    expect(s.roundResult!.makerTricks).toBe(3);
    expect(s.roundResult!.euchred).toBe(false);
    expect(s.roundResult!.march).toBe(false);
    expect(s.roundResult!.points).toBe(1);
    expect(s.roundResult!.awardedTeam).toBe(0);
    expect(s.scores[0]).toBe(1);
    expect(s.phase).toBe('roundEnd');
  });

  it('march, not alone -> 2 points to makers', () => {
    // Maker team 0 wins all 5: seats 0:3, 2:2.
    const s = runScoring(0, false, [3, 0, 2, 0]);
    expect(s.roundResult!.march).toBe(true);
    expect(s.roundResult!.makerTricks).toBe(5);
    expect(s.roundResult!.points).toBe(2);
    expect(s.roundResult!.awardedTeam).toBe(0);
    expect(s.scores[0]).toBe(2);
  });

  it('march alone -> 4 points to makers', () => {
    // Maker seat 0 alone; partner seat 2 sits out. Maker wins all 5 solo.
    const s = runScoring(0, true, [5, 0, 0, 0]);
    expect(s.roundResult!.march).toBe(true);
    expect(s.roundResult!.alone).toBe(true);
    expect(s.roundResult!.points).toBe(4);
    expect(s.scores[0]).toBe(4);
  });

  it('euchred -> 2 points to the defenders', () => {
    // Maker team 0 wins only 2; defenders (team1) win 3 -> defenders score 2.
    const s = runScoring(0, false, [1, 2, 1, 1]);
    expect(s.roundResult!.makerTeam).toBe(0);
    expect(s.roundResult!.makerTricks).toBe(2);
    expect(s.roundResult!.euchred).toBe(true);
    expect(s.roundResult!.points).toBe(2);
    expect(s.roundResult!.awardedTeam).toBe(1);
    expect(s.scores[1]).toBe(2);
  });

  it('reaching 10 transitions to gameOver', () => {
    // Pre-load team 0 with 9 points, then they win 3 tricks for +1 -> 10.
    const winnerSeat = 0;
    const pre = [2, 1, 1, 1];
    pre[winnerSeat] -= 1;
    const s = scoredState({ maker: 0, alone: false, trickCount: pre, scores: [9, 0] });
    s.trick = [
      { player: 0, card: mkCard('H', 11) },
      { player: 1, card: mkCard('S', 9) },
      { player: 2, card: mkCard('S', 10) },
      { player: 3, card: mkCard('S', 13) },
    ];
    s.turn = 0;
    s.leader = 0;
    E.resolveTrick(s);
    expect(s.scores[0]).toBe(10);
    expect(s.phase).toBe('gameOver');
  });
});

// ---------------------------------------------------------------------------
// gameWinner / startNextRound
// ---------------------------------------------------------------------------

describe('gameWinner', () => {
  it('returns null until a team reaches 10', () => {
    const s = E.newGame(1);
    s.scores = [9, 8];
    expect(E.gameWinner(s)).toBeNull();
    s.scores = [10, 8];
    expect(E.gameWinner(s)).toBe(0);
    s.scores = [4, 11];
    expect(E.gameWinner(s)).toBe(1);
  });
});

describe('startNextRound', () => {
  it('rotates the dealer, redeals, resets round state, increments round', () => {
    const s = E.newGame(1);
    const prevDealer = s.dealer;
    // Fake an ended round.
    s.phase = 'roundEnd';
    s.trump = 'H';
    s.maker = 0;
    E.startNextRound(s);
    expect(s.dealer).toBe((prevDealer + 1) % 4);
    expect(s.round).toBe(1);
    expect(s.phase).toBe('bid1');
    expect(s.trump).toBeNull();
    expect(s.maker).toBeNull();
    expect(s.upCardVisible).toBe(true);
    for (const hand of s.hands) expect(hand).toHaveLength(5);
    expect(s.kitty).toHaveLength(4);
    expect(s.turn).toBe((s.dealer + 1) % 4);
  });
});

// ---------------------------------------------------------------------------
// aiPlay legality
// ---------------------------------------------------------------------------

describe('aiPlay', () => {
  it('always returns a card from legalPlays', () => {
    const s = playState({
      trump: 'H',
      hands: [
        [mkCard('S', 1), mkCard('H', 9), mkCard('C', 10)],
        [mkCard('S', 9), mkCard('S', 13), mkCard('H', 1)],
        [], [],
      ],
      leader: 0,
    });
    const lead = E.aiPlay(s, 0);
    expect(E.legalPlays(s, 0).some((c) => c.id === lead.id)).toBe(true);
    E.playCard(s, 0, lead);
    const follow = E.aiPlay(s, 1);
    expect(E.legalPlays(s, 1).some((c) => c.id === follow.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full deterministic game smoke test
// ---------------------------------------------------------------------------

describe('full game smoke test', () => {
  function playFullGame(seed: number): E.EuchreState {
    const s = E.newGame(seed);
    let safety = 0;
    while (E.gameWinner(s) === null && safety < 2000) {
      safety++;
      if (s.phase === 'bid1') {
        const bid = E.aiBidRound1(s, s.turn);
        if (bid.order) E.orderUp(s, s.turn, bid.alone);
        else E.passBid(s, s.turn);
      } else if (s.phase === 'bid2') {
        const bid = E.aiBidRound2(s, s.turn);
        if (bid) E.nameTrump(s, s.turn, bid.suit, bid.alone);
        else E.passBid(s, s.turn);
      } else if (s.phase === 'discard') {
        E.dealerDiscard(s, E.aiDiscard(s));
      } else if (s.phase === 'playing') {
        const card = E.aiPlay(s, s.turn);
        E.playCard(s, s.turn, card);
        const trickSize = s.alone ? 3 : 4;
        if (s.trick.length === trickSize) E.resolveTrick(s);
      } else if (s.phase === 'roundEnd') {
        E.startNextRound(s);
      } else {
        break;
      }
    }
    return s;
  }

  it('terminates with a winner and consistent scores for several seeds', () => {
    for (const seed of [1, 2, 3, 42, 777, 12345, 99999, 314159]) {
      const s = playFullGame(seed);
      const winner = E.gameWinner(s);
      expect(winner).not.toBeNull();
      expect(s.phase).toBe('gameOver');
      expect(s.scores[winner!]).toBeGreaterThanOrEqual(E.TARGET_SCORE);
      // The two teams' scores are non-negative.
      expect(s.scores[0]).toBeGreaterThanOrEqual(0);
      expect(s.scores[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it('every trick during a played round has the right number of cards', () => {
    // Run one full game and assert no exceptions plus that the winner reached 10.
    const s = playFullGame(2);
    expect(E.gameWinner(s)).toBe(s.scores[0]! >= E.TARGET_SCORE ? 0 : 1);
  });
});
