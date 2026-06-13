import { type Card, shuffledDeck } from '../cards/deck';

export type Phase = 'passing' | 'playing' | 'roundEnd' | 'gameOver';

export interface TrickCard {
  player: number;
  card: Card;
}

export interface HeartsState {
  seed: number;
  round: number; // 0-based
  hands: Card[][]; // length 4; index 0 = the human (South), 1=West,2=North,3=East
  taken: Card[][]; // cards each player has won this round (length 4)
  trick: TrickCard[]; // 0..4 cards played to the current trick, in play order
  leader: number; // seat that led the current trick
  turn: number; // seat whose turn it is to play (0..3)
  heartsBroken: boolean;
  scores: number[]; // cumulative game scores, length 4
  roundPoints: number[]; // points taken THIS round, length 4 (filled at round end)
  passDir: number; // 0=left, 1=right, 2=across, 3=none (rotates each round)
  phase: Phase;
}

export const TARGET_SCORE = 100;

/** Ace high for trick comparison and AI. deck.ts uses rank 1 for the Ace. */
function value(rank: number): number {
  return rank === 1 ? 14 : rank;
}

function isQueenOfSpades(card: Card): boolean {
  return card.suit === 'S' && card.rank === 12;
}

function isHeart(card: Card): boolean {
  return card.suit === 'H';
}

function isPointCard(card: Card): boolean {
  return isHeart(card) || isQueenOfSpades(card);
}

function isTwoOfClubs(card: Card): boolean {
  return card.suit === 'C' && card.rank === 2;
}

function sameCard(a: Card, b: Card): boolean {
  return a.id === b.id;
}

/** Deal 13 cards to each of the 4 seats from a freshly shuffled deck. */
function deal(seed: number): Card[][] {
  const deck = shuffledDeck(seed);
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) {
    hands[i % 4]!.push(deck[i]!);
  }
  return hands;
}

function findTwoOfClubsHolder(hands: Card[][]): number {
  for (let seat = 0; seat < 4; seat++) {
    if (hands[seat]!.some(isTwoOfClubs)) return seat;
  }
  return 0;
}

export function newGame(seed: number): HeartsState {
  const hands = deal(seed);
  return {
    seed,
    round: 0,
    hands,
    taken: [[], [], [], []],
    trick: [],
    leader: 0,
    turn: 0,
    heartsBroken: false,
    scores: [0, 0, 0, 0],
    roundPoints: [0, 0, 0, 0],
    passDir: 0,
    phase: 'passing',
  };
}

/** Seat that `player` passes TO. left=+1, right=+3, across=+2, none=self. */
export function passTarget(player: number, passDir: number): number {
  const offsets = [1, 3, 2, 0];
  return (player + offsets[passDir]!) % 4;
}

export function aiPass(state: HeartsState, player: number): Card[] {
  const hand = state.hands[player]!;
  const suitLengths: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of hand) suitLengths[c.suit]!++;

  const danger = (card: Card): number => {
    let d: number;
    if (isQueenOfSpades(card)) d = 100;
    else if (card.suit === 'S' && card.rank === 1) d = 80; // Ace high
    else if (card.suit === 'S' && card.rank === 13) d = 75; // King
    else if (isHeart(card)) d = value(card.rank) * 2 + 20;
    else d = value(card.rank) * 0.5;
    if (suitLengths[card.suit]! <= 2) d += 12;
    return d;
  };

  return hand
    .slice()
    .sort((a, b) => danger(b) - danger(a))
    .slice(0, 3);
}

export function applyPass(state: HeartsState, passes: Card[][]): void {
  // Remove each seat's passed cards from its hand.
  for (let seat = 0; seat < 4; seat++) {
    const passed = passes[seat]!;
    state.hands[seat] = state.hands[seat]!.filter(
      (c) => !passed.some((p) => sameCard(p, c)),
    );
  }
  // Deliver simultaneously.
  for (let seat = 0; seat < 4; seat++) {
    const target = passTarget(seat, state.passDir);
    state.hands[target]!.push(...passes[seat]!);
  }
  state.phase = 'playing';
  const holder = findTwoOfClubsHolder(state.hands);
  state.leader = holder;
  state.turn = holder;
}

function currentLedSuit(state: HeartsState): string | null {
  return state.trick.length > 0 ? state.trick[0]!.card.suit : null;
}

function isFirstTrickOfRound(state: HeartsState): boolean {
  // Total cards taken so far is 0 only during the first trick.
  return state.taken.every((t) => t.length === 0);
}

export function legalPlays(state: HeartsState, player: number): Card[] {
  const hand = state.hands[player]!;
  const led = currentLedSuit(state);
  const firstTrick = isFirstTrickOfRound(state);

  // Forced 2 of clubs lead on the empty first trick of the round.
  if (led === null && firstTrick) {
    const two = hand.find(isTwoOfClubs);
    if (two) return [two];
  }

  if (led !== null) {
    // Must follow suit if possible.
    const inSuit = hand.filter((c) => c.suit === led);
    if (inSuit.length > 0) {
      if (firstTrick) {
        // Following on first trick: no points unless only points available.
        const nonPoints = inSuit.filter((c) => !isPointCard(c));
        return nonPoints.length > 0 ? nonPoints : inSuit;
      }
      return inSuit;
    }
    // Void in led suit: may sluff anything, except first-trick no-points rule.
    if (firstTrick) {
      const nonPoints = hand.filter((c) => !isPointCard(c));
      return nonPoints.length > 0 ? nonPoints : hand.slice();
    }
    return hand.slice();
  }

  // Leading (trick empty, not forced 2C).
  if (firstTrick) {
    // Edge case: not the 2C holder but somehow leading the first trick.
    const nonPoints = hand.filter((c) => !isPointCard(c));
    return nonPoints.length > 0 ? nonPoints : hand.slice();
  }

  // May not lead hearts until broken, unless hand is all hearts.
  if (!state.heartsBroken) {
    const nonHearts = hand.filter((c) => !isHeart(c));
    if (nonHearts.length > 0) return nonHearts;
  }
  return hand.slice();
}

export function isLegalPlay(state: HeartsState, player: number, card: Card): boolean {
  return legalPlays(state, player).some((c) => sameCard(c, card));
}

export function playCard(state: HeartsState, player: number, card: Card): void {
  if (player !== state.turn) {
    throw new Error(`Not seat ${player}'s turn (it is seat ${state.turn}'s).`);
  }
  if (!isLegalPlay(state, player, card)) {
    throw new Error(`Illegal play: ${card.id} by seat ${player}.`);
  }
  state.hands[player] = state.hands[player]!.filter((c) => !sameCard(c, card));
  state.trick.push({ player, card });
  if (isHeart(card)) state.heartsBroken = true;
  if (state.trick.length < 4) {
    state.turn = (player + 1) % 4;
  }
  // If 4 cards, leave turn unchanged; caller resolves.
}

export function resolveTrick(state: HeartsState): number {
  if (state.trick.length !== 4) {
    throw new Error('resolveTrick requires a complete trick of 4 cards.');
  }
  const ledSuit = state.trick[0]!.card.suit;
  let winner = state.trick[0]!.player;
  let best = value(state.trick[0]!.card.rank);
  for (const tc of state.trick) {
    if (tc.card.suit === ledSuit && value(tc.card.rank) > best) {
      best = value(tc.card.rank);
      winner = tc.player;
    }
  }
  for (const tc of state.trick) {
    state.taken[winner]!.push(tc.card);
  }
  state.trick = [];
  state.leader = winner;
  state.turn = winner;
  if (state.hands.every((h) => h.length === 0)) {
    endRound(state);
  }
  return winner;
}

/** Private helper: score the completed round and advance phase. */
function endRound(state: HeartsState): void {
  const points = state.taken.map((cards) => pointsOf(cards));
  const shooter = points.findIndex((p) => p === 26);

  if (shooter >= 0) {
    // Shooting the moon: shooter scores 0, everyone else +26.
    for (let seat = 0; seat < 4; seat++) {
      state.roundPoints[seat] = seat === shooter ? 0 : 26;
    }
  } else {
    for (let seat = 0; seat < 4; seat++) {
      state.roundPoints[seat] = points[seat]!;
    }
  }

  for (let seat = 0; seat < 4; seat++) {
    state.scores[seat]! += state.roundPoints[seat]!;
  }

  state.phase = state.scores.some((s) => s >= TARGET_SCORE) ? 'gameOver' : 'roundEnd';
}

export function aiPlay(state: HeartsState, player: number): Card {
  const legal = legalPlays(state, player);
  const led = currentLedSuit(state);

  if (led === null) {
    // Leading: lead the lowest card, preferring non-heart, non-Q♠.
    const safe = legal.filter((c) => !isHeart(c) && !isQueenOfSpades(c));
    const pool = safe.length > 0 ? safe : legal;
    return pool.reduce((lo, c) => (value(c.rank) < value(lo.rank) ? c : lo));
  }

  const inSuit = legal.filter((c) => c.suit === led);
  if (inSuit.length > 0) {
    // Following: try to duck below the current high of the led suit.
    let highInTrick = 0;
    for (const tc of state.trick) {
      if (tc.card.suit === led) highInTrick = Math.max(highInTrick, value(tc.card.rank));
    }
    const ducks = inSuit.filter((c) => value(c.rank) < highInTrick);
    if (ducks.length > 0) {
      // Highest card that still ducks.
      return ducks.reduce((hi, c) => (value(c.rank) > value(hi.rank) ? c : hi));
    }
    // Cannot duck: play lowest led-suit card.
    return inSuit.reduce((lo, c) => (value(c.rank) < value(lo.rank) ? c : lo));
  }

  // Void in led suit (sluffing): shed danger.
  const queen = legal.find(isQueenOfSpades);
  if (queen) return queen;
  const hearts = legal.filter(isHeart);
  if (hearts.length > 0) {
    return hearts.reduce((hi, c) => (value(c.rank) > value(hi.rank) ? c : hi));
  }
  // Highest card of the longest suit.
  const counts: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of legal) counts[c.suit]!++;
  let longest = legal[0]!.suit;
  for (const s of ['S', 'H', 'D', 'C']) {
    if (counts[s]! > counts[longest]!) longest = s as Card['suit'];
  }
  const inLongest = legal.filter((c) => c.suit === longest);
  return inLongest.reduce((hi, c) => (value(c.rank) > value(hi.rank) ? c : hi));
}

export function startNextRound(state: HeartsState): void {
  state.round += 1;
  state.passDir = state.round % 4;
  state.hands = deal(state.seed + state.round);
  state.taken = [[], [], [], []];
  state.trick = [];
  state.roundPoints = [0, 0, 0, 0];
  state.heartsBroken = false;

  if (state.passDir === 3) {
    // No passing this round: go straight to play.
    state.phase = 'playing';
    const holder = findTwoOfClubsHolder(state.hands);
    state.leader = holder;
    state.turn = holder;
  } else {
    state.phase = 'passing';
  }
}

export function pointsOf(cards: Card[]): number {
  let total = 0;
  for (const c of cards) {
    if (isHeart(c)) total += 1;
    else if (isQueenOfSpades(c)) total += 13;
  }
  return total;
}

export function gameWinner(state: HeartsState): number {
  let winner = 0;
  for (let seat = 1; seat < 4; seat++) {
    if (state.scores[seat]! < state.scores[winner]!) winner = seat;
  }
  return winner;
}
