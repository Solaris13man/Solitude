import { type Card, type Suit, shuffledDeck } from '../cards/deck';

export type Phase = 'bid1' | 'bid2' | 'discard' | 'playing' | 'roundEnd' | 'gameOver';
export const TARGET_SCORE = 10;

export interface TrickCard {
  player: number;
  card: Card;
}

export interface RoundResult {
  makerTeam: number; // team that called trump
  makerTricks: number; // tricks the maker team won (0..5)
  euchred: boolean; // makers failed (won < 3)
  march: boolean; // makers won all 5
  alone: boolean; // maker went alone
  awardedTeam: number; // team that received the points
  points: number; // points awarded this round (1, 2, or 4)
}

export interface EuchreState {
  hands: Card[][]; // hands[seat] -> that seat's cards
  kitty: Card[]; // the 4 undealt cards; kitty[0] is the up-card
  upCard: Card; // the turned-up card (kitty[0] at deal time)
  upCardVisible: boolean; // true during bid1; false once turned down or picked up
  trump: Suit | null; // null until named
  maker: number | null; // seat that called trump
  alone: boolean; // maker is going alone
  sittingOut: number | null; // partner seat sitting out (null unless alone)
  dealer: number; // current dealer seat
  turn: number; // whose action it is (bidder or player)
  phase: Phase;
  trick: TrickCard[]; // cards played in the current trick
  leader: number; // seat that leads the current trick
  trickCount: number[]; // length-4, tricks won per seat this round
  scores: number[]; // length-2, cumulative team scores [team0, team1]
  round: number; // 0-based round counter
  roundResult: RoundResult | null;
  /** Internal seed used to (re)deal; not part of the public contract but stored on state. */
  seed: number;
}

/** Ranks that make up a euchre deck: 9, 10, J, Q, K, A. */
const EUCHRE_RANKS = new Set<number>([9, 10, 11, 12, 13, 1]);

/** Team index for a seat: 0 = seats 0&2 (You+North), 1 = seats 1&3 (West+East). */
export function teamOf(seat: number): number {
  return seat % 2;
}

function partnerOf(seat: number): number {
  return (seat + 2) % 4;
}

function sameCard(a: Card, b: Card): boolean {
  return a.id === b.id;
}

/** The other suit of the same color (used for the left bower). */
function sameColorSuit(suit: Suit): Suit {
  switch (suit) {
    case 'S':
      return 'C';
    case 'C':
      return 'S';
    case 'H':
      return 'D';
    case 'D':
      return 'H';
  }
}

/** True when `card` plays as trump, including the left bower (J of same color). */
export function isTrump(card: Card, trump: Suit): boolean {
  if (card.suit === trump) return true;
  // Left bower: Jack of the same-color suit counts as trump.
  if (card.rank === 11 && card.suit === sameColorSuit(trump)) return true;
  return false;
}

/** The suit a card behaves as for following: left bower -> trump; else its printed suit. */
export function effectiveSuit(card: Card, trump: Suit | null): Suit {
  if (trump !== null && card.rank === 11 && card.suit === sameColorSuit(trump)) {
    return trump;
  }
  return card.suit;
}

/**
 * Strength of a card given a trump suit, higher = stronger. Trump cards rank
 * above all non-trump cards. Right bower > left bower > A,K,Q,10,9 of trump;
 * non-trump suits rank A,K,Q,J,10,9.
 */
function cardStrength(card: Card, trump: Suit): number {
  if (isTrump(card, trump)) {
    if (card.rank === 11 && card.suit === trump) return 100; // right bower
    if (card.rank === 11 && card.suit === sameColorSuit(trump)) return 99; // left bower
    // Non-bower trump (A,K,Q,10,9): above all plain cards (max 14) but strictly
    // below the left bower (99). nonTrumpValue is 9..14, so 80 + it is 89..94.
    return 80 + nonTrumpValue(card.rank);
  }
  return nonTrumpValue(card.rank);
}

/** Ace-high ordering value within a suit (A=14 ... 9=9). */
function nonTrumpValue(rank: number): number {
  return rank === 1 ? 14 : rank;
}

/** Build the 24-card euchre deck by filtering a seeded 52-card shuffle. */
function euchreDeck(seed: number): Card[] {
  return shuffledDeck(seed).filter((c) => EUCHRE_RANKS.has(c.rank));
}

interface Deal {
  hands: Card[][];
  kitty: Card[];
}

/** Deal 5 cards to each seat in order (slices), the remaining 4 form the kitty. */
function deal(seed: number): Deal {
  const deck = euchreDeck(seed);
  const hands: Card[][] = [
    deck.slice(0, 5),
    deck.slice(5, 10),
    deck.slice(10, 15),
    deck.slice(15, 20),
  ];
  const kitty = deck.slice(20, 24);
  return { hands, kitty };
}

export function newGame(seed: number): EuchreState {
  const { hands, kitty } = deal(seed);
  const dealer = 3; // round 0 dealer = East
  const upCard = kitty[0]!;
  return {
    hands,
    kitty,
    upCard,
    upCardVisible: true,
    trump: null,
    maker: null,
    alone: false,
    sittingOut: null,
    dealer,
    turn: 0, // (dealer+1)%4 -> seat 0 (You)
    phase: 'bid1',
    trick: [],
    leader: 0,
    trickCount: [0, 0, 0, 0],
    scores: [0, 0],
    round: 0,
    roundResult: null,
    seed,
  };
}

/** First active seat clockwise from the dealer (skips a sitting-out partner). */
function firstActiveLeader(s: EuchreState): number {
  let seat = (s.dealer + 1) % 4;
  if (s.sittingOut !== null && seat === s.sittingOut) {
    seat = (seat + 1) % 4;
  }
  return seat;
}

/** Next active seat clockwise from `seat` during play (skips sitting-out). */
function nextActive(s: EuchreState, seat: number): number {
  let next = (seat + 1) % 4;
  if (s.sittingOut !== null && next === s.sittingOut) {
    next = (next + 1) % 4;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

export function passBid(s: EuchreState, seat: number): void {
  if (s.phase !== 'bid1' && s.phase !== 'bid2') {
    throw new Error(`Cannot pass outside of bidding (phase ${s.phase}).`);
  }
  if (seat !== s.turn) {
    throw new Error(`Not seat ${seat}'s turn to bid (it is seat ${s.turn}'s).`);
  }

  if (s.phase === 'bid1') {
    if (seat === s.dealer) {
      // Last bidder of round 1 passed: turn down the up-card, enter round 2.
      s.upCardVisible = false;
      s.phase = 'bid2';
      s.turn = (s.dealer + 1) % 4;
    } else {
      s.turn = (seat + 1) % 4;
    }
    return;
  }

  // bid2: stick the dealer — the dealer may not pass.
  if (seat === s.dealer) {
    throw new Error('Stick the dealer: the dealer cannot pass in round 2.');
  }
  s.turn = (seat + 1) % 4;
}

export function orderUp(s: EuchreState, seat: number, alone: boolean): void {
  if (s.phase !== 'bid1') {
    throw new Error(`orderUp is only valid in bid1 (phase ${s.phase}).`);
  }
  if (seat !== s.turn) {
    throw new Error(`Not seat ${seat}'s turn to bid (it is seat ${s.turn}'s).`);
  }
  s.trump = s.upCard.suit;
  s.maker = seat;
  s.alone = alone;
  s.sittingOut = alone ? partnerOf(seat) : null;
  s.upCardVisible = false;
  s.phase = 'discard';
  s.turn = s.dealer; // dealer picks up the up-card and must discard
}

export function nameTrump(s: EuchreState, seat: number, suit: Suit, alone: boolean): void {
  if (s.phase !== 'bid2') {
    throw new Error(`nameTrump is only valid in bid2 (phase ${s.phase}).`);
  }
  if (seat !== s.turn) {
    throw new Error(`Not seat ${seat}'s turn to bid (it is seat ${s.turn}'s).`);
  }
  if (suit === s.upCard.suit) {
    throw new Error('Cannot name the turned-down up-card suit in round 2.');
  }
  s.trump = suit;
  s.maker = seat;
  s.alone = alone;
  s.sittingOut = alone ? partnerOf(seat) : null;
  s.phase = 'playing';
  const lead = firstActiveLeader(s);
  s.leader = lead;
  s.turn = lead;
  s.trick = [];
}

export function dealerDiscard(s: EuchreState, card: Card): void {
  if (s.phase !== 'discard') {
    throw new Error(`dealerDiscard is only valid in discard phase (phase ${s.phase}).`);
  }
  const hand = s.hands[s.dealer]!;
  // Add the up-card into the dealer's hand.
  hand.push(s.upCard);
  const idx = hand.findIndex((c) => sameCard(c, card));
  if (idx === -1) {
    throw new Error(`Discard ${card.id} is not in the dealer's hand.`);
  }
  hand.splice(idx, 1);
  s.phase = 'playing';
  const lead = firstActiveLeader(s);
  s.leader = lead;
  s.turn = lead;
  s.trick = [];
}

// ---------------------------------------------------------------------------
// AI bidding
// ---------------------------------------------------------------------------

/** Count of cards that would be trump if `trump` were named, for `hand`. */
function trumpCards(hand: Card[], trump: Suit): Card[] {
  return hand.filter((c) => isTrump(c, trump));
}

function hasRightBower(hand: Card[], trump: Suit): boolean {
  return hand.some((c) => c.rank === 11 && c.suit === trump);
}

function hasLeftBower(hand: Card[], trump: Suit): boolean {
  return hand.some((c) => c.rank === 11 && c.suit === sameColorSuit(trump));
}

/** Number of off-suit aces (non-trump aces). */
function offAces(hand: Card[], trump: Suit): number {
  return hand.filter((c) => c.rank === 1 && !isTrump(c, trump)).length;
}

/** Heuristic hand strength for a candidate trump suit. */
function handStrength(hand: Card[], trump: Suit): number {
  let score = 0;
  for (const c of hand) {
    if (isTrump(c, trump)) {
      score += cardStrength(c, trump) - 80; // trump weighted heavily
    } else if (c.rank === 1) {
      score += 3; // off-ace
    } else if (c.rank === 13) {
      score += 1; // off-king
    }
  }
  return score;
}

/** Should `seat` order up in round 1, and should it go alone? */
export function aiBidRound1(s: EuchreState, seat: number): { order: boolean; alone: boolean } {
  const trump = s.upCard.suit;
  // The dealer's team gets the up-card if the dealer is on this seat's team.
  const hand = s.hands[seat]!.slice();
  const dealerIsPartner = teamOf(seat) === teamOf(s.dealer);

  // Simulate the up-card being added to the team's strength if relevant.
  const effectiveHand = hand.slice();
  if (s.dealer === seat) {
    // The dealer would pick up the up-card; assume it's kept.
    effectiveHand.push(s.upCard);
  }

  const tCount = trumpCards(effectiveHand, trump).length;
  const right = hasRightBower(effectiveHand, trump);
  const left = hasLeftBower(effectiveHand, trump);
  const aces = offAces(effectiveHand, trump);

  // Very strong: go alone.
  const trumps = trumpCards(effectiveHand, trump);
  const aceTrump = trumps.some((c) => c.rank === 1);
  if (right && tCount >= 4) {
    return { order: true, alone: true };
  }
  if (right && left && aceTrump) {
    return { order: true, alone: true };
  }

  // Order up conditions.
  let order = false;
  if (right) order = true;
  else if (tCount >= 3) order = true;
  else if (tCount >= 2 && aces >= 1) order = true;

  // Giving an opponent dealer the up-card strengthens them; be slightly more
  // conservative when the dealer is on the opposing team and we'd be marginal.
  if (order && !dealerIsPartner && !right && tCount < 3 && aces === 0) {
    order = false;
  }

  return { order, alone: false };
}

/** Pick a round-2 trump suit (or pass), sticking the dealer when seat === dealer. */
export function aiBidRound2(s: EuchreState, seat: number): { suit: Suit; alone: boolean } | null {
  const hand = s.hands[seat]!;
  const turnedDown = s.upCard.suit;
  const candidates: Suit[] = (['S', 'H', 'D', 'C'] as Suit[]).filter((su) => su !== turnedDown);

  let best: Suit | null = null;
  let bestScore = -Infinity;
  for (const su of candidates) {
    const score = handStrength(hand, su);
    if (score > bestScore) {
      bestScore = score;
      best = su;
    }
  }
  if (best === null) return null; // unreachable (3 candidates), but keeps types happy

  const tCount = trumpCards(hand, best).length;
  const right = hasRightBower(hand, best);
  const strongEnough = tCount >= 3 || (right && tCount >= 2);

  // Going alone only on a dominant hand.
  const left = hasLeftBower(hand, best);
  const trumps = trumpCards(hand, best);
  const aceTrump = trumps.some((c) => c.rank === 1);
  const alone = right && ((tCount >= 4) || (left && aceTrump));

  if (seat === s.dealer) {
    // Stick the dealer: must name something.
    return { suit: best, alone: alone && strongEnough };
  }
  if (strongEnough) {
    return { suit: best, alone };
  }
  return null;
}

/** The dealer's weakest discard in the discard phase (after picking up the up-card). */
export function aiDiscard(s: EuchreState): Card {
  const trump = s.trump!;
  // Hand currently has 5 cards; the up-card will be added then one discarded.
  // We evaluate the would-be 6-card hand to choose the discard.
  const hand = s.hands[s.dealer]!.concat([s.upCard]);

  const nonTrump = hand.filter((c) => !isTrump(c, trump));
  const pool = nonTrump.length > 0 ? nonTrump : hand;

  // Group non-trump by suit to detect singletons (prefer voiding a singleton).
  const bySuit = new Map<Suit, Card[]>();
  for (const c of pool) {
    const arr = bySuit.get(c.suit) ?? [];
    arr.push(c);
    bySuit.set(c.suit, arr);
  }

  // Candidate: the lowest card overall in the pool.
  let weakest = pool[0]!;
  for (const c of pool) {
    if (cardStrength(c, trump) < cardStrength(weakest, trump)) weakest = c;
  }

  // Prefer discarding a low singleton off-suit card to create a void.
  let singletonChoice: Card | null = null;
  for (const [, cards] of bySuit) {
    if (cards.length === 1) {
      const c = cards[0]!;
      // Don't void away an off-ace if avoidable.
      if (c.rank === 1) continue;
      if (singletonChoice === null || cardStrength(c, trump) < cardStrength(singletonChoice, trump)) {
        singletonChoice = c;
      }
    }
  }

  return singletonChoice ?? weakest;
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

function ledSuit(s: EuchreState): Suit | null {
  if (s.trick.length === 0) return null;
  return effectiveSuit(s.trick[0]!.card, s.trump);
}

export function legalPlays(s: EuchreState, seat: number): Card[] {
  const hand = s.hands[seat]!;
  const led = ledSuit(s);
  if (led === null) return hand.slice();
  const following = hand.filter((c) => effectiveSuit(c, s.trump) === led);
  if (following.length > 0) return following;
  return hand.slice();
}

export function isLegalPlay(s: EuchreState, seat: number, card: Card): boolean {
  return legalPlays(s, seat).some((c) => sameCard(c, card));
}

export function playCard(s: EuchreState, seat: number, card: Card): void {
  if (s.phase !== 'playing') {
    throw new Error(`Cannot play outside of the playing phase (phase ${s.phase}).`);
  }
  if (seat !== s.turn) {
    throw new Error(`Not seat ${seat}'s turn (it is seat ${s.turn}'s).`);
  }
  if (!isLegalPlay(s, seat, card)) {
    throw new Error(`Illegal play: ${card.id} by seat ${seat}.`);
  }
  s.hands[seat] = s.hands[seat]!.filter((c) => !sameCard(c, card));
  s.trick.push({ player: seat, card });
  const trickSize = s.alone ? 3 : 4;
  if (s.trick.length < trickSize) {
    s.turn = nextActive(s, seat);
  }
  // When the trick is full, leave turn as-is; caller invokes resolveTrick.
}

/** Index of the winning card in a complete (or partial) trick, given trump. */
function trickWinner(trick: TrickCard[], trump: Suit): number {
  const led = effectiveSuit(trick[0]!.card, trump);
  let winner = trick[0]!.player;
  let best = -Infinity;
  for (const tc of trick) {
    const isT = isTrump(tc.card, trump);
    const eff = effectiveSuit(tc.card, trump);
    if (!isT && eff !== led) continue; // off-suit, non-trump: cannot win
    const strength = cardStrength(tc.card, trump);
    if (strength > best) {
      best = strength;
      winner = tc.player;
    }
  }
  return winner;
}

export function resolveTrick(s: EuchreState): void {
  const trickSize = s.alone ? 3 : 4;
  if (s.trick.length !== trickSize) {
    throw new Error(`resolveTrick requires a complete trick of ${trickSize} cards.`);
  }
  const trump = s.trump!;
  const winner = trickWinner(s.trick, trump);
  s.trickCount[winner]!++;
  s.trick = [];
  s.leader = winner;
  s.turn = winner;

  const tricksPlayed = s.trickCount.reduce((a, b) => a + b, 0);
  if (tricksPlayed >= 5) {
    scoreRound(s);
  }
}

function scoreRound(s: EuchreState): void {
  const makerTeam = teamOf(s.maker!);
  const defenderTeam = makerTeam === 0 ? 1 : 0;
  const makerTricks =
    s.trickCount[makerTeam]! + s.trickCount[partnerSeatOfTeam(makerTeam)]!;

  const march = makerTricks === 5;
  const euchred = makerTricks <= 2;

  let points: number;
  let awardedTeam: number;
  if (euchred) {
    points = 2;
    awardedTeam = defenderTeam;
  } else if (march) {
    points = s.alone ? 4 : 2;
    awardedTeam = makerTeam;
  } else {
    // 3 or 4 tricks
    points = 1;
    awardedTeam = makerTeam;
  }

  s.scores[awardedTeam]! += points;
  s.roundResult = {
    makerTeam,
    makerTricks,
    euchred,
    march,
    alone: s.alone,
    awardedTeam,
    points,
  };
  s.phase = s.scores.some((sc) => sc >= TARGET_SCORE) ? 'gameOver' : 'roundEnd';
}

/** The two seats of a team are `team` and `team+2`; this returns `team+2`. */
function partnerSeatOfTeam(team: number): number {
  return team + 2;
}

// ---------------------------------------------------------------------------
// AI play
// ---------------------------------------------------------------------------

/** Current winning TrickCard of the in-progress trick (or null if empty). */
function currentWinner(s: EuchreState): TrickCard | null {
  if (s.trick.length === 0) return null;
  const trump = s.trump!;
  const winnerSeat = trickWinner(s.trick, trump);
  return s.trick.find((tc) => tc.player === winnerSeat) ?? null;
}

function wouldWin(s: EuchreState, card: Card): boolean {
  const cur = currentWinner(s);
  if (cur === null) return true; // leading
  const trump = s.trump!;
  const hypothetical: TrickCard[] = s.trick.concat([{ player: -1, card }]);
  return trickWinner(hypothetical, trump) === -1;
}

function lowestByStrength(cards: Card[], trump: Suit): Card {
  return cards.reduce((lo, c) => (cardStrength(c, trump) < cardStrength(lo, trump) ? c : lo));
}

function highestByStrength(cards: Card[], trump: Suit): Card {
  return cards.reduce((hi, c) => (cardStrength(c, trump) > cardStrength(hi, trump) ? c : hi));
}

export function aiPlay(s: EuchreState, seat: number): Card {
  const trump = s.trump!;
  const legal = legalPlays(s, seat);
  if (legal.length === 1) return legal[0]!;

  const led = ledSuit(s);
  const cur = currentWinner(s);
  const partnerWinning = cur !== null && teamOf(cur.player) === teamOf(seat);

  if (led === null) {
    // Leading: lead a high non-trump (cash an off-ace) or a strong trump.
    const offCards = legal.filter((c) => !isTrump(c, trump));
    const offAcesHere = offCards.filter((c) => c.rank === 1);
    if (offAcesHere.length > 0) return highestByStrength(offAcesHere, trump);
    // Otherwise lead the strongest card available.
    return highestByStrength(legal, trump);
  }

  // Following.
  const following = legal.filter((c) => effectiveSuit(c, trump) === led);
  if (following.length > 0) {
    // Must follow suit. Win cheaply if partner isn't already winning.
    if (!partnerWinning) {
      const winners = following.filter((c) => wouldWin(s, c));
      if (winners.length > 0) return lowestByStrength(winners, trump);
    }
    return lowestByStrength(following, trump);
  }

  // Void in led suit: trump in to win if it helps, else throw the lowest off card.
  if (!partnerWinning) {
    const trumpsHere = legal.filter((c) => isTrump(c, trump));
    const winners = trumpsHere.filter((c) => wouldWin(s, c));
    if (winners.length > 0) return lowestByStrength(winners, trump);
  }
  const nonTrump = legal.filter((c) => !isTrump(c, trump));
  if (nonTrump.length > 0) return lowestByStrength(nonTrump, trump);
  return lowestByStrength(legal, trump);
}

// ---------------------------------------------------------------------------
// Round / game lifecycle
// ---------------------------------------------------------------------------

export function startNextRound(s: EuchreState): void {
  s.round += 1;
  s.dealer = (s.dealer + 1) % 4;
  s.seed = (s.seed + 0x9e3779b1) >>> 0; // fresh internal seed
  const { hands, kitty } = deal(s.seed);
  s.hands = hands;
  s.kitty = kitty;
  s.upCard = kitty[0]!;
  s.upCardVisible = true;
  s.trump = null;
  s.maker = null;
  s.alone = false;
  s.sittingOut = null;
  s.trick = [];
  s.trickCount = [0, 0, 0, 0];
  s.roundResult = null;
  s.phase = 'bid1';
  const firstBidder = (s.dealer + 1) % 4;
  s.turn = firstBidder;
  s.leader = firstBidder;
}

export function gameWinner(s: EuchreState): number | null {
  if (s.scores[0]! >= TARGET_SCORE) return 0;
  if (s.scores[1]! >= TARGET_SCORE) return 1;
  return null;
}
