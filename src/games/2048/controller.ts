import { History } from '../../lib/history';
import { track } from '../../lib/analytics';
import { SoundPlayer } from '../../lib/sound';
import { formatTime, loadStats, recordResult, variantStats, winRate } from '../../lib/stats';
import {
  type Settings,
  applySettings,
  loadSettings,
  saveSettings,
} from '../../lib/settings';
import { randomSeed } from '../cards/rng';
import { DailyMode } from '../../lib/daily-mode';
import { G2048Board } from './board';
import {
  type Direction,
  type G2048State,
  bestTile,
  cloneState,
  deal,
  deserialize,
  isOver,
  move,
  serialize,
} from './engine';

const SAVE_KEY = 'solitude.game.v2.2048';
const GAME_ID = '2048';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}

class G2048Controller {
  private state!: G2048State;
  private history = new History<G2048State>(cloneState);
  private settings: Settings;
  private board: G2048Board;
  private sound = new SoundPlayer();
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private finished = false;
  /** A win (2048) or loss has been recorded for this game. */
  private resultRecorded = false;
  private toastTimer = 0;
  private daily = new DailyMode(GAME_ID);
  private saveKey = `${SAVE_KEY}${this.daily.saveSuffix}`;
  private dailyRecorded = false;

  constructor() {
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.board = new G2048Board($('board'), (dir) => this.handleMove(dir));
    this.bindToolbar();
    this.bindSettingsDialog();
    this.bindKeyboard();
    // 2048 has no useful hint; repurpose nothing — just hide the button.
    ($('btn-hint') as HTMLButtonElement).hidden = true;
    window.setInterval(() => this.updateClock(), 500);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseTimer();
      else if (!this.finished && this.state.moves > 0) this.resumeTimer();
    });

    const shared = this.sharedDealFromUrl();
    if (shared !== null) {
      this.newGame(false, shared);
      this.announce('Shared game loaded — same tile sequence for everyone.', true);
    } else if (!this.tryResume()) {
      this.newGame(false);
    }
    if (this.daily.active) {
      this.daily.mountBanner();
      const again = $opt('btn-play-again');
      if (again) again.textContent = 'Play again';
    }
  }

  private sharedDealFromUrl(): number | null {
    try {
      const raw = new URLSearchParams(window.location.search).get('deal');
      if (!raw) return null;
      const seed = Number.parseInt(raw, 10);
      if (!Number.isFinite(seed) || seed < 0) return null;
      window.history.replaceState(null, '', window.location.pathname);
      return seed >>> 0;
    } catch {
      return null;
    }
  }

  private requestNewGame(): void {
    if (this.state && this.state.moves > 0 && !this.finished) {
      ($('newgame-dialog') as HTMLDialogElement).showModal();
      return;
    }
    this.newGame(false);
  }

  private newGame(countAbandon: boolean, seed?: number): void {
    if (
      countAbandon &&
      this.state &&
      this.state.moves > 0 &&
      !this.finished &&
      !this.resultRecorded
    ) {
      recordResult({
        game: GAME_ID,
        variant: 0,
        won: false,
        elapsedMs: this.elapsedMs(),
        moves: this.state.moves,
        score: this.state.score,
      });
    }
    this.state = deal(seed ?? (this.daily.active ? this.daily.seed : randomSeed()));
    track('game_started', { game: GAME_ID, variant: 0 });
    this.dailyRecorded = false;
    this.history.clear();
    this.finished = false;
    this.resultRecorded = false;
    this.accumulatedMs = 0;
    this.runningSince = null;
    this.board.render(this.state);
    this.refreshHud(false);
    this.announce('New game. Combine tiles to reach 2048!');
  }

  private tryResume(): boolean {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return false;
      const saved = deserialize(raw);
      if (!saved || isOver(saved.state)) return false;
      if (this.daily.active && !this.daily.isToday(saved.state.seed)) return false;
      this.state = saved.state;
      this.accumulatedMs = saved.elapsedMs;
      this.resultRecorded = this.state.reached2048;
      this.board.render(this.state);
      this.refreshHud(false);
      if (this.state.moves > 0) this.resumeTimer();
      this.announce('Game resumed where you left off.', true);
      return true;
    } catch {
      return false;
    }
  }

  private persist(): void {
    try {
      if (this.finished) localStorage.removeItem(this.saveKey);
      else localStorage.setItem(this.saveKey, serialize(this.state, this.elapsedMs()));
    } catch {
      // storage unavailable
    }
  }

  private handleMove(dir: Direction): void {
    if (this.finished) return;
    const before = cloneState(this.state);
    const events = move(this.state, dir);
    if (!events.moved) return;
    this.history.push(before);
    if (this.runningSince === null) this.resumeTimer();
    this.sound.play(events.merges.length > 0 ? 'foundation' : 'flip');
    this.board.applyMove(this.state, events);
    this.refreshHud(true);
    this.checkDailyTarget();
    if (this.state.reached2048 && !this.resultRecorded) {
      this.recordOutcome(true);
      this.showOutcome('🎉 2048!', true);
    } else if (isOver(this.state)) {
      this.finished = true;
      if (!this.resultRecorded) this.recordOutcome(false);
      this.persist();
      this.showOutcome('No more moves', false);
    }
  }

  private recordOutcome(won: boolean): void {
    this.resultRecorded = true;
    recordResult({
      game: GAME_ID,
      variant: 0,
      won,
      elapsedMs: this.elapsedMs(),
      moves: this.state.moves,
      score: this.state.score,
    });
  }

  private showOutcome(title: string, canContinue: boolean): void {
    const stats = loadStats(GAME_ID);
    const v = variantStats(stats, 0);
    $('win-title').textContent = title;
    $('win-summary').innerHTML = [
      `<dt>Score</dt><dd>${this.state.score}${this.state.score >= v.bestScore ? ' — best!' : ''}</dd>`,
      `<dt>Best tile</dt><dd>${bestTile(this.state)}</dd>`,
      `<dt>Moves</dt><dd>${this.state.moves}</dd>`,
      `<dt>Time</dt><dd>${formatTime(this.elapsedMs())}</dd>`,
    ].join('');
    this.sound.play(canContinue ? 'win' : 'shuffle');
    this.announce(
      canContinue
        ? 'You reached 2048! Close the dialog to keep going.'
        : `Game over with ${this.state.score} points.`,
    );
    window.setTimeout(() => {
      ($('win-dialog') as HTMLDialogElement).showModal();
    }, 350);
  }

  private undo(): void {
    if (this.finished) return;
    const prev = this.history.undo(this.state);
    if (!prev) return;
    this.state = prev;
    this.sound.play('undo');
    this.board.render(this.state);
    this.refreshHud(true);
    this.announce('Undid move.');
  }

  private redo(): void {
    if (this.finished) return;
    const next = this.history.redo(this.state);
    if (!next) return;
    this.state = next;
    this.sound.play('undo');
    this.board.render(this.state);
    this.refreshHud(true);
    this.announce('Redid move.');
  }

  private refreshHud(persist: boolean): void {
    $('stat-moves').textContent = String(this.state.moves);
    $('stat-score').textContent = String(this.state.score);
    const dealEl = $opt('stat-deal');
    if (dealEl) {
      dealEl.textContent =
        this.daily.isToday(this.state.seed) ? this.daily.dealLabel() : `#${this.state.seed}`;
    }
    this.updateClock();
    ($('btn-undo') as HTMLButtonElement).disabled = this.finished || !this.history.canUndo;
    ($('btn-redo') as HTMLButtonElement).disabled = this.finished || !this.history.canRedo;
    if (persist) this.persist();
  }

  /** 2048's daily is "solved" by reaching the rotation's target tile. */
  private checkDailyTarget(): void {
    if (!this.daily.isToday(this.state.seed) || this.dailyRecorded) return;
    const target = this.daily.entry.target ?? 2048;
    if (bestTile(this.state) < target) return;
    this.dailyRecorded = true;
    const streak = this.daily.recordSolve(this.elapsedMs(), this.state.moves, this.state.score, '2048');
    this.announce(`Daily target ${target} reached! Streak ${streak} 🔥`, true);
  }

  private bindToolbar(): void {
    $('btn-new').addEventListener('click', () => this.requestNewGame());
    $('btn-confirm-new').addEventListener('click', () => {
      ($('newgame-dialog') as HTMLDialogElement).close();
      this.newGame(true);
    });
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-redo').addEventListener('click', () => this.redo());
    $('btn-play-again').addEventListener('click', () => {
      ($('win-dialog') as HTMLDialogElement).close();
      if (!isOver(this.state) && this.state.reached2048) {
        // "play again" after the 2048 celebration continues the same game
        this.announce('Keep going — chase 4096!', true);
        return;
      }
      this.newGame(false);
    });
    $opt('btn-replay-deal')?.addEventListener('click', () => {
      ($('win-dialog') as HTMLDialogElement).close();
      this.newGame(false, this.state.seed);
      this.announce('Replaying the same tile sequence.', true);
    });
    $opt('btn-share')?.addEventListener('click', () => void this.shareDeal());
    $('btn-stats').addEventListener('click', () => {
      this.renderStats();
      ($('stats-dialog') as HTMLDialogElement).showModal();
    });
    $('btn-settings').addEventListener('click', () => {
      ($('settings-dialog') as HTMLDialogElement).showModal();
    });
    document.querySelectorAll<HTMLButtonElement>('[data-close-dialog]').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('dialog')?.close());
    });
  }

  private async shareDeal(): Promise<void> {
    track('share_clicked', { game: GAME_ID });
    let url: string;
    let text: string;
    if (this.daily.isToday(this.state.seed)) {
      ({ url, text } = this.daily.shareText(this.dailyRecorded, this.elapsedMs()));
    } else {
      url = `${window.location.origin}${window.location.pathname}?deal=${this.state.seed}`;
      text = `I scored ${this.state.score} in 2048 game #${this.state.seed} (best tile ${bestTile(this.state)}). Same tiles, your moves: can you beat it?`;
    }
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      this.announce('Challenge link copied to clipboard!', true);
    } catch {
      // user cancelled or clipboard unavailable
    }
  }

  private renderStats(): void {
    const stats = loadStats(GAME_ID);
    const v = variantStats(stats, 0);
    const daily = this.daily.active ? DailyMode.statsRows() : '';
    $('stats-body').innerHTML = daily + [
      `<dt>Games played</dt><dd>${v.gamesPlayed}</dd>`,
      `<dt>Reached 2048</dt><dd>${v.gamesWon}</dd>`,
      `<dt>Win rate</dt><dd>${winRate(v)}%</dd>`,
      `<dt>Current streak</dt><dd>${v.currentStreak}</dd>`,
      `<dt>Best streak</dt><dd>${v.bestStreak}</dd>`,
      `<dt>Best score</dt><dd>${v.bestScore}</dd>`,
      `<dt>Fastest 2048</dt><dd>${v.bestTimeMs === null ? '—' : formatTime(v.bestTimeMs)}</dd>`,
    ].join('');
  }

  private bindSettingsDialog(): void {
    const theme = $('set-theme') as HTMLSelectElement;
    const felt = $('set-felt') as HTMLSelectElement;
    const back = $('set-cardback') as HTMLSelectElement;
    const left = $opt('set-lefthand') as HTMLInputElement | null;
    const anim = $('set-animations') as HTMLInputElement;
    const snd = $('set-sounds') as HTMLInputElement;

    theme.value = this.settings.theme;
    felt.value = this.settings.felt;
    back.value = this.settings.cardBack;
    if (left) left.checked = this.settings.leftHand;
    anim.checked = this.settings.animations;
    snd.checked = this.settings.sounds;

    const update = () => {
      const prevSounds = this.settings.sounds;
      this.settings = {
        ...this.settings,
        theme: theme.value as Settings['theme'],
        felt: felt.value as Settings['felt'],
        cardBack: back.value as Settings['cardBack'],
        tileSet: this.settings.tileSet,
        leftHand: left ? left.checked : this.settings.leftHand,
        animations: anim.checked,
        sounds: snd.checked,
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      if (this.settings.sounds && !prevSounds) this.sound.play('place');
    };
    const controls = [theme, felt, back, anim, snd, ...(left ? [left] : [])];
    for (const el of controls) el.addEventListener('change', update);
  }

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (target.closest('dialog, input, select, textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dirs: Record<string, Direction> = {
        arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
      };
      const dir = dirs[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        this.handleMove(dir);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'n': this.requestNewGame(); break;
        case 'u': this.undo(); break;
        case 'r': this.redo(); break;
      }
    });
  }

  private elapsedMs(): number {
    return this.accumulatedMs + (this.runningSince !== null ? Date.now() - this.runningSince : 0);
  }

  private resumeTimer(): void {
    if (this.runningSince === null) this.runningSince = Date.now();
  }

  private pauseTimer(): void {
    if (this.runningSince !== null) {
      this.accumulatedMs += Date.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  private updateClock(): void {
    $('stat-time').textContent = formatTime(this.elapsedMs());
    if (this.daily.active) this.daily.refreshBanner();
  }

  private announce(text: string, visible = false): void {
    $('announcer').textContent = text;
    if (!visible) return;
    const toast = $opt('toast');
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    toast.classList.remove('toast-in');
    void toast.offsetWidth;
    toast.classList.add('toast-in');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }
}

export function start2048(): void {
  new G2048Controller();
}
