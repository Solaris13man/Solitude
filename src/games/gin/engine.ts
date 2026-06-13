import { shuffledDeck, type Card } from '../cards/deck';

export type Phase = 'draw' | 'discard' | 'roundEnd' | 'gameOver';

export interface Meld {
  type: 'set' | 'run';
  cards: Card[];
}

export interface RoundResult {
  knocker: number; // seat that knocked, or -1 for a wash (stock exhausted)
  gin: boolean;
  undercut: boolean;
  knockerDeadwood: number;
  opponentDeadwood: number; // AFTER lay-offs
  delta: number; // points awarded
  winner: number; // seat that scored, or -1 for a wash
  knockerMelds: Meld[];
  opponentMelds: Meld[];
  laidOff: Card[]; // opponent deadwood cards laid onto knocker melds (empty on gin/wash)
}

export interface GinState {
  seed: number;
  round: number;
  hands: Card[][]; // length 2; 0 = You, 1 = Opponent
  stock: Card[]; // face-down draw pile (top = last element)
  discard: Card[]; // face-up pile (top = last element)
  turn: number; // 0 or 1
  dealer: number;
  phase: Phase;
  scores: number[]; // length 2 cumulative
  lastResult: RoundResult | null;
  justDrewDiscard: boolean; // true if the player drew the upcard this turn
}

export const TARGET_SCORE = 100;
export const GIN_BONUS = 25;
export const UNDERCUT_BONUS = 25;

/** A=1, 2..10 = face, J/Q/K = 10. */
export function cardValue(card: Card): number {
  return Math.min(card.rank, 10);
}

/** Deal a fresh round. */
export function newGame(seed: number): GinState {
  const dealer = 0;
  const state: GinState = {
    seed,
    round: 0,
    hands: [[], []],
    stock: [],
    discard: [],
    turn: 0,
    dealer,
    phase: 'draw',
    scores: [0, 0],
    lastResult: null,
    justDrewDiscard: false,
  };
  dealRound(state);
  return state;
}

/** Deal cards into a round given the existing seed/round/dealer fields. */
function dealRound(state: GinState): void {
  const deck = shuffledDeck(state.seed + state.round);
  const hands: Card[][] = [[], []];
  let idx = 0;
  // Deal 10 to each player.
  for (let i = 0; i < 10; i++) {
    for (let p = 0; p < 2; p++) {
      hands[p]!.push(faceUp(deck[idx++]!));
    }
  }
  // Flip ONE upcard to the discard.
  const upcard = faceUp(deck[idx++]!);
  // Remaining go to the stock (top = last element). Deck order preserved.
  const stock = deck.slice(idx).map(faceDown);
  state.hands = hands;
  state.stock = stock;
  state.discard = [upcard];
  state.turn = nonDealer(state.dealer);
  state.phase = 'draw';
  state.justDrewDiscard = false;
}

function faceUp(card: Card): Card {
  return { ...card, faceUp: true };
}

function faceDown(card: Card): Card {
  return { ...card, faceUp: false };
}

function nonDealer(dealer: number): number {
  return dealer === 0 ? 1 : 0;
}

function other(player: number): number {
  return player === 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Meld detection / best decomposition
// ---------------------------------------------------------------------------

/** Generate every candidate meld (set or run) present in the cards. */
function candidateMelds(cards: Card[]): Meld[] {
  const melds: Meld[] = [];

  // SETS: group by rank, emit every size-3 and size-4 subset.
  const byRank = new Map<number, Card[]>();
  for (const c of cards) {
    const arr = byRank.get(c.rank) ?? [];
    arr.push(c);
    byRank.set(c.rank, arr);
  }
  for (const group of byRank.values()) {
    if (group.length >= 3) {
      // size-3 subsets
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          for (let k = j + 1; k < group.length; k++) {
            melds.push({ type: 'set', cards: [group[i]!, group[j]!, group[k]!] });
          }
        }
      }
      // the full size-4 set
      if (group.length === 4) {
        melds.push({ type: 'set', cards: group.slice() });
      }
    }
  }

  // RUNS: within each suit, sort by rank, find contiguous sub-runs of len >= 3.
  const bySuit = new Map<string, Card[]>();
  for (const c of cards) {
    const arr = bySuit.get(c.suit) ?? [];
    arr.push(c);
    bySuit.set(c.suit, arr);
  }
  for (const group of bySuit.values()) {
    // Dedup by rank (no duplicate ranks in a single deck, but be safe).
    const sorted = group.slice().sort((a, b) => a.rank - b.rank);
    // Walk through and find maximal consecutive sequences.
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1]!.rank === sorted[j]!.rank + 1) {
        j++;
      }
      // sorted[i..j] is a maximal run. Emit every contiguous sub-run len >= 3.
      const runLen = j - i + 1;
      for (let start = i; start <= j; start++) {
        for (let end = start + 2; end <= j; end++) {
          melds.push({ type: 'run', cards: sorted.slice(start, end + 1) });
        }
      }
      void runLen;
      i = j + 1;
    }
  }

  return melds;
}

/**
 * Find the disjoint set of candidate melds that minimises deadwood value.
 * Backtracking DFS over candidates, indexed by card id.
 */
export function bestMelds(cards: Card[]): {
  melds: Meld[];
  deadwood: Card[];
  deadwoodValue: number;
} {
  const candidates = candidateMelds(cards);
  const totalValue = cards.reduce((s, c) => s + cardValue(c), 0);

  // Precompute each candidate's melded value and the id set it occupies.
  const cand = candidates.map((m) => ({
    meld: m,
    value: m.cards.reduce((s, c) => s + cardValue(c), 0),
    ids: m.cards.map((c) => c.id),
    cardCount: m.cards.length,
  }));

  let bestMelded = 0;
  let bestMeldCount = Infinity; // fewer melded cards => more deadwood cards; prefer FEWER deadwood cards => MORE melded cards on tie
  let bestChosen: Meld[] = [];

  const used = new Set<string>();

  function dfs(startIdx: number, meldedValue: number, meldedCards: number, chosen: Meld[]): void {
    // Update best: maximise melded value; tie-break: prefer more melded cards
    // (=> fewer deadwood cards).
    if (
      meldedValue > bestMelded ||
      (meldedValue === bestMelded && meldedCards > (bestMeldCount === Infinity ? -1 : bestMeldCount))
    ) {
      bestMelded = meldedValue;
      bestMeldCount = meldedCards;
      bestChosen = chosen.slice();
    }

    // Pruning: even if all remaining melded value were added we can't beat best.
    for (let i = startIdx; i < cand.length; i++) {
      const c = cand[i]!;
      // Check disjoint.
      let ok = true;
      for (const id of c.ids) {
        if (used.has(id)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (const id of c.ids) used.add(id);
      chosen.push(c.meld);
      dfs(i + 1, meldedValue + c.value, meldedCards + c.cardCount, chosen);
      chosen.pop();
      for (const id of c.ids) used.delete(id);
    }
  }

  dfs(0, 0, 0, []);

  const meldedIds = new Set<string>();
  for (const m of bestChosen) for (const c of m.cards) meldedIds.add(c.id);
  const deadwood = cards.filter((c) => !meldedIds.has(c.id));
  const deadwoodVal = totalValue - bestMelded;

  return { melds: bestChosen, deadwood, deadwoodValue: deadwoodVal };
}

export function deadwoodValue(cards: Card[]): number {
  return bestMelds(cards).deadwoodValue;
}

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

export function canDrawDiscard(state: GinState, player: number): boolean {
  return state.phase === 'draw' && state.turn === player && state.discard.length > 0;
}

export function drawStock(state: GinState, player: number): void {
  if (state.phase !== 'draw' || state.turn !== player) {
    throw new Error('Cannot draw from stock now');
  }
  if (state.stock.length === 0) {
    throw new Error('Stock is empty');
  }
  const card = faceUp(state.stock.pop()!);
  state.hands[player]!.push(card);
  state.justDrewDiscard = false;
  state.phase = 'discard';
}

export function drawDiscard(state: GinState, player: number): void {
  if (!canDrawDiscard(state, player)) {
    throw new Error('Cannot draw from discard now');
  }
  const card = faceUp(state.discard.pop()!);
  state.hands[player]!.push(card);
  state.justDrewDiscard = true;
  state.phase = 'discard';
}

/** After removing discardCard from the 11-card hand, is the 10-card deadwood <= 10? */
export function canKnock(state: GinState, player: number, discardCard: Card): boolean {
  if (state.phase !== 'discard' || state.turn !== player) return false;
  const hand = state.hands[player]!;
  if (!hand.some((c) => c.id === discardCard.id)) return false;
  const remaining = hand.filter((c) => c.id !== discardCard.id);
  return deadwoodValue(remaining) <= 10;
}

export function discard(state: GinState, player: number, card: Card): void {
  if (state.phase !== 'discard' || state.turn !== player) {
    throw new Error('Cannot discard now');
  }
  const hand = state.hands[player]!;
  const idx = hand.findIndex((c) => c.id === card.id);
  if (idx === -1) throw new Error('Card not in hand');
  const [removed] = hand.splice(idx, 1);
  state.discard.push(faceUp(removed!));
  state.justDrewDiscard = false;

  // If the stock now has <= 2 cards, the round ends as a WASH.
  if (state.stock.length <= 2) {
    const result: RoundResult = {
      knocker: -1,
      gin: false,
      undercut: false,
      knockerDeadwood: 0,
      opponentDeadwood: 0,
      delta: 0,
      winner: -1,
      knockerMelds: [],
      opponentMelds: [],
      laidOff: [],
    };
    state.lastResult = result;
    state.phase = 'roundEnd';
    return;
  }

  // Pass the turn.
  state.turn = other(player);
  state.phase = 'draw';
}

/** Determine layoffs: opponent deadwood cards that extend the knocker's melds. */
function applyLayoffs(
  knockerMelds: Meld[],
  opponentDeadwood: Card[],
): { laidOff: Card[]; remaining: Card[] } {
  const laidOff: Card[] = [];
  // Work on mutable copies of melds so runs can grow.
  const melds = knockerMelds.map((m) => ({ type: m.type, cards: m.cards.slice() }));
  let remaining = opponentDeadwood.slice();

  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < remaining.length; r++) {
      const card = remaining[r]!;
      let placed = false;
      for (const meld of melds) {
        if (meld.type === 'set') {
          if (meld.cards[0]!.rank === card.rank) {
            meld.cards.push(card);
            placed = true;
            break;
          }
        } else {
          // run: same suit, extend at either end.
          const suit = meld.cards[0]!.suit;
          if (card.suit !== suit) continue;
          const ranks = meld.cards.map((c) => c.rank);
          const low = Math.min(...ranks);
          const high = Math.max(...ranks);
          if (card.rank === low - 1 || card.rank === high + 1) {
            meld.cards.push(card);
            placed = true;
            break;
          }
        }
      }
      if (placed) {
        laidOff.push(card);
        remaining = remaining.filter((c) => c.id !== card.id);
        changed = true;
        break;
      }
    }
  }

  return { laidOff, remaining };
}

export function knock(state: GinState, player: number, discardCard: Card): void {
  if (!canKnock(state, player, discardCard)) {
    throw new Error('Cannot knock');
  }
  // Discard the card first.
  const hand = state.hands[player]!;
  const idx = hand.findIndex((c) => c.id === discardCard.id);
  const [removed] = hand.splice(idx, 1);
  state.discard.push(faceUp(removed!));

  const knockerCards = hand.slice(); // 10 cards
  const opp = other(player);
  const opponentCards = state.hands[opp]!.slice();

  const knockerBest = bestMelds(knockerCards);
  const knockerDeadwood = knockerBest.deadwoodValue;
  const gin = knockerDeadwood === 0;

  const opponentBest = bestMelds(opponentCards);
  let opponentDeadwoodCards = opponentBest.deadwood;
  let laidOff: Card[] = [];

  if (!gin) {
    const res = applyLayoffs(knockerBest.melds, opponentDeadwoodCards);
    laidOff = res.laidOff;
    opponentDeadwoodCards = res.remaining;
  }
  const opponentDeadwood = opponentDeadwoodCards.reduce((s, c) => s + cardValue(c), 0);

  let winner: number;
  let delta: number;
  let undercut = false;

  if (gin) {
    winner = player;
    delta = opponentDeadwood + GIN_BONUS;
  } else if (knockerDeadwood < opponentDeadwood) {
    winner = player;
    delta = opponentDeadwood - knockerDeadwood;
  } else {
    // opponentDeadwood <= knockerDeadwood => undercut.
    undercut = true;
    winner = opp;
    delta = knockerDeadwood - opponentDeadwood + UNDERCUT_BONUS;
  }

  state.scores[winner]! += delta;

  const result: RoundResult = {
    knocker: player,
    gin,
    undercut,
    knockerDeadwood,
    opponentDeadwood,
    delta,
    winner,
    knockerMelds: knockerBest.melds,
    opponentMelds: opponentBest.melds,
    laidOff,
  };
  state.lastResult = result;

  state.phase = state.scores.some((s) => s >= TARGET_SCORE) ? 'gameOver' : 'roundEnd';
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export function aiChooseDraw(state: GinState, player: number): 'stock' | 'discard' {
  if (state.discard.length === 0) return 'stock';
  const hand = state.hands[player]!;
  const currentDeadwood = deadwoodValue(hand);

  const upcard = state.discard[state.discard.length - 1]!;
  const withUpcard = [...hand, faceUp(upcard)];
  // Best post-discard deadwood after taking the upcard.
  let bestAfter = Infinity;
  for (const c of withUpcard) {
    // Cannot immediately re-discard the card just drawn from discard.
    if (c.id === upcard.id) continue;
    const remaining = withUpcard.filter((x) => x.id !== c.id);
    const dw = deadwoodValue(remaining);
    if (dw < bestAfter) bestAfter = dw;
  }

  // Take the upcard only if it strictly reduces post-discard deadwood.
  return bestAfter < currentDeadwood ? 'discard' : 'stock';
}

export function aiChooseDiscard(
  state: GinState,
  player: number,
): { card: Card; knock: boolean } {
  const hand = state.hands[player]!;
  // Candidate discards: every card, except the card just drawn from the
  // discard pile (cannot re-discard it the same turn). drawDiscard pushes the
  // upcard to the end of the hand, so the blocked card is the last one.
  const blockedId = state.justDrewDiscard ? hand[hand.length - 1]?.id : undefined;

  let bestCard: Card | null = null;
  let bestDeadwood = Infinity;
  let bestValue = -Infinity;

  for (const c of hand) {
    if (state.justDrewDiscard && c.id === blockedId) continue;
    const remaining = hand.filter((x) => x.id !== c.id);
    const dw = deadwoodValue(remaining);
    const v = cardValue(c);
    if (
      dw < bestDeadwood ||
      (dw === bestDeadwood && v > bestValue)
    ) {
      bestDeadwood = dw;
      bestValue = v;
      bestCard = c;
    }
  }

  // Fallback (should not happen): if everything blocked, allow any card.
  if (!bestCard) {
    bestCard = hand[hand.length - 1]!;
    bestDeadwood = deadwoodValue(hand.filter((x) => x.id !== bestCard!.id));
  }

  const knockFlag = bestDeadwood === 0 || bestDeadwood <= 8;
  return { card: bestCard, knock: knockFlag && bestDeadwood <= 10 };
}

// ---------------------------------------------------------------------------
// Round / game lifecycle
// ---------------------------------------------------------------------------

export function startNextRound(state: GinState): void {
  state.round += 1;
  state.dealer = nonDealer(state.dealer);
  dealRound(state);
  // lastResult is intentionally kept until overwritten by the next knock/wash.
}

export function gameWinner(state: GinState): number {
  return state.scores[0]! >= state.scores[1]! ? 0 : 1;
}
