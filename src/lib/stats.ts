

export type GameId = string;

export interface Stats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
  totalMoves: number;
  /** Best win time in ms, keyed by variant ("v1", "v3", "v0", …). */
  bestTimeMs: Record<string, number | null>;
  bestScore: number;
}

const keyFor = (game: GameId) => `solitude.stats.v2.${game}`;

const DEFAULT_STATS: Stats = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalMoves: 0,
  bestTimeMs: {},
  bestScore: 0,
};

export function loadStats(game: GameId): Stats {
  try {
    const raw = localStorage.getItem(keyFor(game));
    if (!raw) return { ...DEFAULT_STATS, bestTimeMs: {} };
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return { ...DEFAULT_STATS, ...parsed, bestTimeMs: { ...(parsed.bestTimeMs ?? {}) } };
  } catch {
    return { ...DEFAULT_STATS, bestTimeMs: {} };
  }
}

export function saveStats(game: GameId, stats: Stats): void {
  try {
    localStorage.setItem(keyFor(game), JSON.stringify(stats));
  } catch {
    // Storage may be unavailable (private mode); stats just won't persist.
  }
}

export interface GameResult {
  game: GameId;
  variant: number;
  won: boolean;
  elapsedMs: number;
  moves: number;
  score: number;
}

/** Record a finished (won) or abandoned (lost) game and return updated stats. */
export function recordResult(result: GameResult): Stats {
  const stats = loadStats(result.game);
  stats.gamesPlayed++;
  stats.totalMoves += result.moves;
  if (result.won) {
    stats.gamesWon++;
    stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    stats.bestScore = Math.max(stats.bestScore, result.score);
    const key = `v${result.variant}`;
    const prev = stats.bestTimeMs[key];
    if (prev === null || prev === undefined || result.elapsedMs < prev) {
      stats.bestTimeMs[key] = result.elapsedMs;
    }
  } else {
    stats.currentStreak = 0;
  }
  saveStats(result.game, stats);
  return stats;
}

export function winRate(stats: Stats): number {
  return stats.gamesPlayed === 0 ? 0 : Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
}

export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
