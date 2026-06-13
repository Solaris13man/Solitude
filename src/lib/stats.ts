import { track } from './analytics';

export type GameId = string;

/** Stats are tracked separately per variant (e.g. Draw 1 vs Draw 3), so a
 *  casual 1-suit Spider game never dilutes a 4-suit win rate. */
export interface VariantStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
  totalMoves: number;
  bestTimeMs: number | null;
  bestScore: number;
}

export interface Stats {
  /** Keyed "v1", "v3", "v0", … */
  variants: Record<string, VariantStats>;
}

const keyFor = (game: GameId) => `solitude.stats.v3.${game}`;

export function emptyVariantStats(): VariantStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalMoves: 0,
    bestTimeMs: null,
    bestScore: 0,
  };
}

export function loadStats(game: GameId): Stats {
  try {
    const raw = localStorage.getItem(keyFor(game));
    if (!raw) return { variants: {} };
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return { variants: { ...(parsed.variants ?? {}) } };
  } catch {
    return { variants: {} };
  }
}

export function saveStats(game: GameId, stats: Stats): void {
  try {
    localStorage.setItem(keyFor(game), JSON.stringify(stats));
  } catch {
    // Storage may be unavailable (private mode); stats just won't persist.
  }
}

export function variantStats(stats: Stats, variant: number): VariantStats {
  return stats.variants[`v${variant}`] ?? emptyVariantStats();
}

/** Aggregate view across all variants of a game (for the overview rows). */
export function aggregate(stats: Stats): VariantStats {
  const total = emptyVariantStats();
  for (const v of Object.values(stats.variants)) {
    total.gamesPlayed += v.gamesPlayed;
    total.gamesWon += v.gamesWon;
    total.totalMoves += v.totalMoves;
    total.bestStreak = Math.max(total.bestStreak, v.bestStreak);
    total.bestScore = Math.max(total.bestScore, v.bestScore);
    if (v.bestTimeMs !== null && (total.bestTimeMs === null || v.bestTimeMs < total.bestTimeMs)) {
      total.bestTimeMs = v.bestTimeMs;
    }
  }
  return total;
}

export interface GameResult {
  game: GameId;
  variant: number;
  won: boolean;
  elapsedMs: number;
  moves: number;
  score: number;
}

/** Record a finished (won) or abandoned (lost) game; returns updated stats. */
export function recordResult(result: GameResult): Stats {
  const stats = loadStats(result.game);
  const key = `v${result.variant}`;
  const v = stats.variants[key] ?? emptyVariantStats();
  v.gamesPlayed++;
  v.totalMoves += result.moves;
  if (result.won) {
    v.gamesWon++;
    v.currentStreak++;
    v.bestStreak = Math.max(v.bestStreak, v.currentStreak);
    v.bestScore = Math.max(v.bestScore, result.score);
    if (v.bestTimeMs === null || result.elapsedMs < v.bestTimeMs) {
      v.bestTimeMs = result.elapsedMs;
    }
  } else {
    v.currentStreak = 0;
  }
  stats.variants[key] = v;
  saveStats(result.game, stats);
  // Single choke point for every game's outcome — one analytics hook covers
  // all 11 games' win/loss tracking.
  track(result.won ? 'game_won' : 'game_lost', {
    game: result.game,
    variant: result.variant,
    seconds: Math.round(result.elapsedMs / 1000),
  });
  return stats;
}

export function winRate(stats: VariantStats): number {
  return stats.gamesPlayed === 0 ? 0 : Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
}

export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
