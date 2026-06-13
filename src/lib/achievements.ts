import { GAMES } from '../games/registry';
import { type Stats, loadStats, variantStats } from './stats';
import {
  bestDailyStreak,
  currentDailyStreak,
  hasCompletedDailyYear,
  loadDaily,
  totalDailySolves,
} from './daily';

/**
 * Achievements / badges. Pure logic over the per-game stats and the daily
 * record already in localStorage — works for guests today, and will sync to
 * an account when one is connected. Earned badge ids persist locally so we
 * can detect the moment a new one unlocks and celebrate it.
 */

export interface Badge {
  id: string;
  name: string;
  description: string;
  /** An emoji/text glyph for the badge face. */
  icon: string;
  /** True when the player has earned it, given the snapshot. */
  earned: (s: PlayerSnapshot) => boolean;
}

/** Real games (excludes the 'daily' rotation entry, which has no stats). */
const GAME_IDS = GAMES.map((g) => g.id).filter((id) => id !== 'daily');
const CARD_IDS = GAMES.filter((g) => g.category === 'cards' && g.id !== 'daily').map((g) => g.id);
const PUZZLE_IDS = GAMES.filter((g) => g.category === 'puzzle').map((g) => g.id);

export interface PlayerSnapshot {
  totalPlayed: number;
  totalWon: number;
  /** Game ids with at least one win. */
  wonGames: Set<string>;
  /** Game ids played at least once. */
  playedGames: Set<string>;
  /** Best single-game win streak across everything. */
  bestStreak: number;
  dailyCurrentStreak: number;
  dailyBestStreak: number;
  dailySolved: number;
  /** Solved every daily of a fully-elapsed calendar year. */
  completedFullYear: boolean;
  /** Did this (game, variant) get at least one win? key `${game}:${variant}`. */
  variantWins: Set<string>;
}

function statsFor(game: string): Stats {
  return loadStats(game);
}

/** Build a snapshot from everything in local storage. */
export function snapshot(): PlayerSnapshot {
  const snap: PlayerSnapshot = {
    totalPlayed: 0,
    totalWon: 0,
    wonGames: new Set(),
    playedGames: new Set(),
    bestStreak: 0,
    dailyCurrentStreak: 0,
    dailyBestStreak: 0,
    dailySolved: 0,
    completedFullYear: false,
    variantWins: new Set(),
  };
  for (const game of GAME_IDS) {
    const stats = statsFor(game);
    let gamePlayed = 0;
    let gameWon = 0;
    for (const [key, v] of Object.entries(stats.variants)) {
      gamePlayed += v.gamesPlayed;
      gameWon += v.gamesWon;
      snap.bestStreak = Math.max(snap.bestStreak, v.bestStreak);
      if (v.gamesWon > 0) snap.variantWins.add(`${game}:${key.replace(/^v/, '')}`);
    }
    snap.totalPlayed += gamePlayed;
    snap.totalWon += gameWon;
    if (gamePlayed > 0) snap.playedGames.add(game);
    if (gameWon > 0) snap.wonGames.add(game);
  }
  const daily = loadDaily();
  snap.dailyCurrentStreak = currentDailyStreak(daily);
  snap.dailyBestStreak = bestDailyStreak(daily);
  snap.dailySolved = totalDailySolves(daily);
  snap.completedFullYear = hasCompletedDailyYear(daily);
  return snap;
}

const wonVariant = (s: PlayerSnapshot, game: string, variant: number) =>
  s.variantWins.has(`${game}:${variant}`);

export const BADGES: Badge[] = [
  { id: 'first-win', name: 'First Win', description: 'Win your very first game.', icon: '🎉', earned: (s) => s.totalWon >= 1 },
  { id: 'win-10', name: 'Getting Good', description: 'Win 10 games.', icon: '🌟', earned: (s) => s.totalWon >= 10 },
  { id: 'win-50', name: 'Seasoned', description: 'Win 50 games.', icon: '🏅', earned: (s) => s.totalWon >= 50 },
  { id: 'win-100', name: 'Centurion', description: 'Win 100 games.', icon: '🏆', earned: (s) => s.totalWon >= 100 },
  { id: 'sampler', name: 'Sampler', description: 'Play 5 different games.', icon: '🎲', earned: (s) => s.playedGames.size >= 5 },
  { id: 'card-shark', name: 'Card Shark', description: 'Win every card game at least once.', icon: '🦈', earned: (s) => CARD_IDS.every((g) => s.wonGames.has(g)) },
  { id: 'puzzler', name: 'Puzzler', description: 'Win every puzzle at least once.', icon: '🧩', earned: (s) => PUZZLE_IDS.every((g) => s.wonGames.has(g)) },
  { id: 'completionist', name: 'Completionist', description: 'Win every game at least once.', icon: '👑', earned: (s) => GAME_IDS.every((g) => s.wonGames.has(g)) },
  { id: 'streak-5', name: 'On a Roll', description: 'Win 5 in a row in one game.', icon: '🔥', earned: (s) => s.bestStreak >= 5 },
  { id: 'streak-10', name: 'Unstoppable', description: 'Win 10 in a row in one game.', icon: '⚡', earned: (s) => s.bestStreak >= 10 },
  { id: 'daily-3', name: 'Regular', description: 'A 3-day daily streak.', icon: '📅', earned: (s) => s.dailyBestStreak >= 3 },
  { id: 'daily-7', name: 'Dedicated', description: 'A 7-day daily streak.', icon: '🗓️', earned: (s) => s.dailyBestStreak >= 7 },
  { id: 'daily-30', name: 'Devoted', description: 'A 30-day daily streak.', icon: '💎', earned: (s) => s.dailyBestStreak >= 30 },
  { id: 'daily-50', name: 'Daily Habit', description: 'Solve 50 daily challenges.', icon: '☀️', earned: (s) => s.dailySolved >= 50 },
  { id: 'perfect-year', name: 'Perfect Year', description: 'Solve every Daily Challenge in a calendar year.', icon: '🏵️', earned: (s) => s.completedFullYear },
  { id: 'spider-slayer', name: 'Spider Slayer', description: 'Win 4-suit Spider.', icon: '🕷️', earned: (s) => wonVariant(s, 'spider', 4) },
  { id: 'logician', name: 'Logician', description: 'Win a Hard or Expert Sudoku.', icon: '🔢', earned: (s) => wonVariant(s, 'sudoku', 3) || wonVariant(s, 'sudoku', 4) },
  { id: 'bomb-squad', name: 'Bomb Squad', description: 'Win Expert Minesweeper.', icon: '💣', earned: (s) => wonVariant(s, 'minesweeper', 3) },
  { id: 'tile-master', name: 'Tile Master', description: 'Clear a Mahjong board.', icon: '🀄', earned: (s) => s.wonGames.has('mahjong') },
  { id: 'reach-2048', name: '2048!', description: 'Reach the 2048 tile.', icon: '🔟', earned: (s) => s.wonGames.has('2048') },
  { id: 'cell-block', name: 'Cell Block', description: 'Win a game of FreeCell.', icon: '🔓', earned: (s) => s.wonGames.has('freecell') },
];

const UNLOCKED_KEY = 'solitude.badges.v1';

export function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveUnlocked(ids: Set<string>): void {
  try {
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify([...ids]));
  } catch {
    // storage unavailable
  }
}

/** Badge ids currently earned, per the live snapshot. */
export function earnedBadgeIds(snap = snapshot()): Set<string> {
  return new Set(BADGES.filter((b) => b.earned(snap)).map((b) => b.id));
}

/**
 * Reconcile earned badges with what we've already celebrated, persist the
 * new set, and return any badges newly unlocked since last check.
 */
export function checkForNewBadges(): Badge[] {
  const earned = earnedBadgeIds();
  const known = loadUnlocked();
  const fresh = BADGES.filter((b) => earned.has(b.id) && !known.has(b.id));
  if (fresh.length) saveUnlocked(earned);
  else if (earned.size !== known.size) saveUnlocked(earned);
  return fresh;
}
