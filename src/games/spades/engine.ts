import { type Card, shuffledDeck } from '../cards/deck';

export type Phase = 'bidding' | 'playing' | 'roundEnd' | 'gameOver';

export interface TrickCard {
  player: number;
  card: Card;
}

export interface SpadesState {
  seed: number;
  round: number; // 0-based
  hands: Card[][]; // length 4; 0=You(South), 1=West, 2=North(partner), 3=East
  trickCount: number[]; // tricks won this round per seat (length 4)
  trick: TrickCard[]; // 0..4 cards played to the current trick, in play order
  leader: number; // seat that led the current trick
  turn: number; // seat whose turn it is (bidding or playing)
  dealer: number; // seat that dealt this round
  spadesBroken: boolean;
  bids: number[]; // length 4; -1 = not yet bid; 0 = nil; 1..13 = bid
  scores: number[]; // length 2; team scores (team = seat % 2; team 0 = seats 0&2)
  bags: number[]; // length 2
  roundScore: number[]; // length 2; this round's delta per team (display)
  phase: Phase;
}

export const TARGET_SCORE = 500;

/** Ace high for trick comparison and AI. deck.ts uses rank 1 for the Ace. */
function value(rank: number): number {
  return rank === 1 ? 14 : rank;
}

function isSpade(card: Card): boolean {
  return card.suit === 'S';
}

function sameCard(a: Card, b: Card): boolean {
  return a.id === b.id;
}

/** Team index for a seat: 0 = seats 0&2 (You+North), 1 = seats 1&3 (West+East). */
export function teamOf(seat: number): number {
  return seat % 2;
}

/** The two seats that make up a team. */
function seatsOfTeam(team: number): [number, number] {
  return team === 0 ? [0, 2] : [1, 3];
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

export function newGame(seed: number): SpadesState {
  const hands = deal(seed);
  const dealer = 2; // round 0 dealer
  const firstBidder = (dealer + 1) % 4;
  return {
    seed,
    round: 0,
    hands,
    trickCount: [0, 0, 0, 0],
    trick: [],
    leader: firstBidder,
    turn: firstBidder,
    dealer,
    spadesBroken: false,
    bids: [-1, -1, -1, -1],
    scores: [0, 0],
    bags: [0, 0],
    roundScore: [0, 0],
    phase: 'bidding',
  };
}

/** Estimate a credible bid (0=nil..13) for `player`. */
export function aiBid(state: SpadesState, player: number): number {
  const hand = state.hands[player]!;
  const suitCards: Record<string, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const c of hand) suitCards[c.suit]!.push(c);

  let estimate = 0;
  for (const suit of ['H', 'D', 'C'] as const) {
    const cards = suitCards[suit]!;
    const len = cards.length;
    for (const c of cards) {
      if (c.rank === 1) estimate += 1; // Ace
      else if (c.rank === 13 && len >= 2) estimate += 0.5; // protected King
      else if (c.rank === 12 && len >= 3) estimate += 0.25; // protected Queen
    }
  }

  // Spades: trump. Length beyond 3 is worth a trick each; high spades add value.
  const spades = suitCards.S!;
  const numSpades = spades.length;
  if (numSpades > 3) estimate += numSpades - 3;
  for (const c of spades) {
    if (c.rank === 1) estimate += 1; // A♠
    else if (c.rank === 13) estimate += 0.75; // K♠
    else if (c.rank === 12) estimate += 0.5; // Q♠
  }

  const hasAce = hand.some((c) => c.rank === 1);
  const hasHighSpade = spades.some((c) => c.rank === 1 || c.rank === 13 || c.rank === 12);
  const lowSpadesOnly = numSpades <= 2 && !hasHighSpade;

  // Nil only when the hand is genuinely weak.
  if (!hasAce && !hasHighSpade && lowSpadesOnly && Math.round(estimate) <= 0) {
    return 0;
  }

  let bid = Math.round(estimate);
  if (bid < 1) bid = 1;
  if (bid > 13) bid = 13;
  return bid;
}

export function placeBid(state: SpadesState, player: number, bid: number): void {
  if (player !== state.turn) {
    throw new Error(`Not seat ${player}'s turn to bid (it is seat ${state.turn}'s).`);
  }
  if (state.bids[player] !== -1) {
    throw new Error(`Seat ${player} has already bid.`);
  }
  if (!Number.isInteger(bid) || bid < 0 || bid > 13) {
    throw new Error(`Invalid bid ${bid}.`);
  }
  state.bids[player] = bid;
  state.turn = (player + 1) % 4;
  if (state.bids.every((b) => b !== -1)) {
    state.phase = 'playing';
    const lead = (state.dealer + 1) % 4;
    state.leader = lead;
    state.turn = lead;
  }
}

function currentLedSuit(state: SpadesState): string | null {
  return state.trick.length > 0 ? state.trick[0]!.card.suit : null;
}

export function legalPlays(state: SpadesState, player: number): Card[] {
  const hand = state.hands[player]!;
  const led = currentLedSuit(state);

  if (led !== null) {
    // Must follow the led suit if able.
    const inSuit = hand.filter((c) => c.suit === led);
    if (inSuit.length > 0) return inSuit;
    // Void in led suit: may play anything, including a spade.
    return hand.slice();
  }

  // Leading: may not lead a spade until broken, unless hand is all spades.
  if (!state.spadesBroken) {
    const nonSpades = hand.filter((c) => !isSpade(c));
    if (nonSpades.length > 0) return nonSpades;
  }
  return hand.slice();
}

export function isLegalPlay(state: SpadesState, player: number, card: Card): boolean {
  return legalPlays(state, player).some((c) => sameCard(c, card));
}

export function playCard(state: SpadesState, player: number, card: Card): void {
  if (player !== state.turn) {
    throw new Error(`Not seat ${player}'s turn (it is seat ${state.turn}'s).`);
  }
  if (!isLegalPlay(state, player, card)) {
    throw new Error(`Illegal play: ${card.id} by seat ${player}.`);
  }
  state.hands[player] = state.hands[player]!.filter((c) => !sameCard(c, card));
  state.trick.push({ player, card });
  if (isSpade(card)) state.spadesBroken = true;
  if (state.trick.length < 4) {
    state.turn = (player + 1) % 4;
  }
  // If 4 cards, leave turn unchanged; caller resolves.
}

export function resolveTrick(state: SpadesState): number {
  if (state.trick.length !== 4) {
    throw new Error('resolveTrick requires a complete trick of 4 cards.');
  }
  const ledSuit = state.trick[0]!.card.suit;
  const anySpade = state.trick.some((tc) => isSpade(tc.card));
  const winningSuit = anySpade ? 'S' : ledSuit;

  let winner = state.trick[0]!.player;
  let best = -1;
  for (const tc of state.trick) {
    if (tc.card.suit === winningSuit && value(tc.card.rank) > best) {
      best = value(tc.card.rank);
      winner = tc.player;
    }
  }

  state.trickCount[winner]!++;
  state.leader = winner;
  state.turn = winner;
  state.trick = [];

  if (state.hands.every((h) => h.length === 0)) {
    endRound(state);
  }
  return winner;
}

/** Private helper: score the completed round and advance phase. */
function endRound(state: SpadesState): void {
  const delta = [0, 0];

  for (let team = 0; team < 2; team++) {
    const [a, b] = seatsOfTeam(team);
    let d = 0;

    // Nil scoring per seat.
    for (const seat of [a, b]) {
      if (state.bids[seat] === 0) {
        d += state.trickCount[seat] === 0 ? 100 : -100;
      }
    }

    // Contract = sum of NON-nil bids for the team.
    let contract = 0;
    for (const seat of [a, b]) {
      if (state.bids[seat]! > 0) contract += state.bids[seat]!;
    }
    const teamTricks = state.trickCount[a]! + state.trickCount[b]!;

    if (contract > 0) {
      if (teamTricks >= contract) {
        d += 10 * contract;
        const overtricks = teamTricks - contract;
        d += overtricks; // +1 per bag
        state.bags[team]! += overtricks;
      } else {
        d += -10 * contract;
      }
    } else {
      // Both partners bid nil: every trick taken is a bag.
      d += teamTricks; // +1 each
      state.bags[team]! += teamTricks;
    }

    // Bag penalty: while >= 10 bags, -10 bags and -100 points.
    while (state.bags[team]! >= 10) {
      state.bags[team]! -= 10;
      d += -100;
    }

    delta[team] = d;
  }

  for (let team = 0; team < 2; team++) {
    state.scores[team]! += delta[team]!;
    state.roundScore[team] = delta[team]!;
  }

  state.phase = state.scores.some((s) => s >= TARGET_SCORE) ? 'gameOver' : 'roundEnd';
}

/** Does `team` still need tricks to make its (non-nil) contract? */
function teamNeedsTricks(state: SpadesState, team: number): boolean {
  const [a, b] = seatsOfTeam(team);
  let contract = 0;
  for (const seat of [a, b]) {
    if (state.bids[seat]! > 0) contract += state.bids[seat]!;
  }
  if (contract === 0) return false;
  const taken = state.trickCount[a]! + state.trickCount[b]!;
  return taken < contract;
}

/** Current winning TrickCard of the in-progress trick (or null if empty). */
function currentWinner(state: SpadesState): TrickCard | null {
  if (state.trick.length === 0) return null;
  const ledSuit = state.trick[0]!.card.suit;
  const anySpade = state.trick.some((tc) => isSpade(tc.card));
  const winningSuit = anySpade ? 'S' : ledSuit;
  let winner = state.trick[0]!;
  let best = -1;
  for (const tc of state.trick) {
    if (tc.card.suit === winningSuit && value(tc.card.rank) > best) {
      best = value(tc.card.rank);
      winner = tc;
    }
  }
  return winner;
}

/** Would playing `card` (by `player`) currently win the trick in progress? */
function wouldWin(state: SpadesState, card: Card): boolean {
  const cur = currentWinner(state);
  if (cur === null) return true; // leading
  const ledSuit = state.trick[0]!.card.suit;
  const curIsSpade = isSpade(cur.card);
  if (isSpade(card)) {
    if (curIsSpade) return value(card.rank) > value(cur.card.rank);
    return true; // a spade beats any non-spade
  }
  // card is non-spade
  if (curIsSpade) return false;
  if (card.suit !== ledSuit) return false; // off-suit non-spade can't win
  return value(card.rank) > value(cur.card.rank);
}

function lowest(cards: Card[]): Card {
  return cards.reduce((lo, c) => (value(c.rank) < value(lo.rank) ? c : lo));
}

function highest(cards: Card[]): Card {
  return cards.reduce((hi, c) => (value(c.rank) > value(hi.rank) ? c : hi));
}

export function aiPlay(state: SpadesState, player: number): Card {
  const legal = legalPlays(state, player);
  if (legal.length === 1) return legal[0]!;

  const led = currentLedSuit(state);
  const myTeam = teamOf(player);
  const partner = (player + 2) % 4;
  const iAmNil = state.bids[player] === 0;
  const partnerNil = state.bids[partner] === 0;
  const needTricks = teamNeedsTricks(state, myTeam);

  // ---- I am playing nil: always try to LOSE. ----
  if (iAmNil) {
    if (led !== null) {
      const inSuit = legal.filter((c) => c.suit === led);
      if (inSuit.length > 0) {
        // Play the highest card that still loses; if none, play the lowest.
        const losers = inSuit.filter((c) => !wouldWin(state, c));
        if (losers.length > 0) return highest(losers);
        return lowest(inSuit);
      }
      // Void: sluff a high non-spade (dump danger safely), else high spade.
      const nonSpades = legal.filter((c) => !isSpade(c));
      if (nonSpades.length > 0) return highest(nonSpades);
      return highest(legal);
    }
    // Leading while nil: lead the lowest card to avoid winning.
    return lowest(legal);
  }

  // ---- Leading ----
  if (led === null) {
    const nonSpades = legal.filter((c) => !isSpade(c));
    if (needTricks) {
      // Lead a high card; prefer non-spades to preserve trump.
      const pool = nonSpades.length > 0 ? nonSpades : legal;
      return highest(pool);
    }
    // Safe / made: lead low to avoid bags, prefer non-spades.
    const pool = nonSpades.length > 0 ? nonSpades : legal;
    return lowest(pool);
  }

  // ---- Following ----
  const inSuit = legal.filter((c) => c.suit === led);
  const winners = legal.filter((c) => wouldWin(state, c));
  const cur = currentWinner(state);
  // A nil partner "winning" the trick is a disaster, not a win — cover them
  // by overtaking cheaply whenever possible.
  const partnerCoveringNil = partnerNil && cur !== null && cur.player === partner;
  if (partnerCoveringNil && winners.length > 0) {
    const inSuitWinners = winners.filter((c) => c.suit === led);
    return lowest(inSuitWinners.length > 0 ? inSuitWinners : winners);
  }
  const partnerWinning =
    cur !== null && teamOf(cur.player) === myTeam && !partnerCoveringNil;

  if (inSuit.length > 0) {
    // Must follow suit.
    if (needTricks && !partnerWinning) {
      const suitWinners = inSuit.filter((c) => wouldWin(state, c));
      if (suitWinners.length > 0) return lowest(suitWinners); // cheapest win
    }
    // Can't or shouldn't win: duck with the lowest in-suit card.
    return lowest(inSuit);
  }

  // Void in led suit: may trump or sluff.
  if (needTricks && !partnerWinning && winners.length > 0) {
    // Win cheaply (lowest winning spade).
    return lowest(winners);
  }
  // Don't waste a trump: sluff the lowest non-spade if possible.
  const nonSpades = legal.filter((c) => !isSpade(c));
  if (nonSpades.length > 0) return lowest(nonSpades);
  return lowest(legal);
}

export function startNextRound(state: SpadesState): void {
  state.round += 1;
  state.dealer = (state.dealer + 1) % 4;
  state.hands = deal(state.seed + state.round);
  state.trickCount = [0, 0, 0, 0];
  state.trick = [];
  state.roundScore = [0, 0];
  state.bids = [-1, -1, -1, -1];
  state.spadesBroken = false;
  state.phase = 'bidding';
  const firstBidder = (state.dealer + 1) % 4;
  state.leader = firstBidder;
  state.turn = firstBidder;
}

export function gameWinner(state: SpadesState): number {
  return state.scores[0]! >= state.scores[1]! ? 0 : 1;
}
