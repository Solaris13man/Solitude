import type { DrawMode } from './engine/klondike';

export interface Stats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
  totalMoves: number;
  /** Best win time in ms, per draw mode. */
  bestTimeMs: { d1: number | null; d3: number | null };
  bestScore: number;
}

const KEY = 'solitude.stats.v1';

const DEFAULT_STATS: Stats = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalMoves: 0,
  bestTimeMs: { d1: null, d3: null },
  bestScore: 0,
};

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATS, bestTimeMs: { ...DEFAULT_STATS.bestTimeMs } };
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return {
      ...DEFAULT_STATS,
      ...parsed,
      bestTimeMs: { ...DEFAULT_STATS.bestTimeMs, ...(parsed.bestTimeMs ?? {}) },
    };
  } catch {
    return { ...DEFAULT_STATS, bestTimeMs: { ...DEFAULT_STATS.bestTimeMs } };
  }
}

export function saveStats(stats: Stats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // Storage may be unavailable (private mode); stats just won't persist.
  }
}

export interface GameResult {
  won: boolean;
  elapsedMs: number;
  moves: number;
  score: number;
  drawMode: DrawMode;
}

/** Record a finished (won) or abandoned (lost) game and return updated stats. */
export function recordResult(result: GameResult): Stats {
  const stats = loadStats();
  stats.gamesPlayed++;
  stats.totalMoves += result.moves;
  if (result.won) {
    stats.gamesWon++;
    stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    stats.bestScore = Math.max(stats.bestScore, result.score);
    const key = result.drawMode === 1 ? 'd1' : 'd3';
    const prev = stats.bestTimeMs[key];
    if (prev === null || result.elapsedMs < prev) {
      stats.bestTimeMs[key] = result.elapsedMs;
    }
  } else {
    stats.currentStreak = 0;
  }
  saveStats(stats);
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
