import { History } from '../../lib/history';
import { SoundPlayer } from '../../lib/sound';
import { formatTime, loadStats, recordResult, variantStats, winRate } from '../../lib/stats';
import {
  type Settings,
  applySettings,
  loadSettings,
  saveSettings,
} from '../../lib/settings';
import { randomSeed } from '../cards/rng';
import { MinesweeperBoard } from './board';
import {
  DIFFICULTIES,
  type MinesweeperState,
  chord,
  cloneState,
  deal,
  deserialize,
  difficultyOf,
  flagsRemaining,
  reveal,
  serialize,
  toggleFlag,
} from './engine';

const SAVE_KEY = 'solitude.game.v2.minesweeper';
const GAME_ID = 'minesweeper';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}

class MinesweeperController {
  private state!: MinesweeperState;
  private history = new History<MinesweeperState>(cloneState);
  private settings: Settings;
  private board: MinesweeperBoard;
  private sound = new SoundPlayer();
  private flagMode = false;
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private finished = false;
  private toastTimer = 0;

  constructor() {
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.board = new MinesweeperBoard($('board'), {
      onReveal: (i) => this.handleReveal(i),
      onFlag: (i) => this.handleFlag(i),
      onChord: (i) => this.handleChord(i),
    });
    this.bindToolbar();
    this.bindFlagToggle();
    this.bindSettingsDialog();
    this.bindKeyboard();
    window.setInterval(() => this.updateClock(), 500);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseTimer();
      else if (!this.finished && this.state.moves > 0) this.resumeTimer();
    });

    const shared = this.sharedDealFromUrl();
    if (shared !== null) {
      this.newGame(false, shared.seed, shared.variant);
      this.announce('Shared board loaded.', true);
    } else if (!this.tryResume()) {
      this.newGame(false);
    }
  }

  private difficulty(): number {
    return this.settings.variants[GAME_ID] ?? 1;
  }

  private sharedDealFromUrl(): { seed: number; variant?: number } | null {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('deal');
      if (!raw) return null;
      const seed = Number.parseInt(raw, 10);
      if (!Number.isFinite(seed) || seed < 0) return null;
      const mode = Number.parseInt(params.get('mode') ?? '', 10);
      const variant = DIFFICULTIES.some((d) => d.value === mode) ? mode : undefined;
      window.history.replaceState(null, '', window.location.pathname);
      return { seed: seed >>> 0, variant };
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

  private newGame(countAbandon: boolean, seed?: number, variantOverride?: number): void {
    if (countAbandon && this.state && this.state.moves > 0 && !this.finished) {
      recordResult({
        game: GAME_ID,
        variant: this.state.variant,
        won: false,
        elapsedMs: this.elapsedMs(),
        moves: this.state.moves,
        score: 0,
      });
    }
    this.state = deal(seed ?? randomSeed(), variantOverride ?? this.difficulty());
    this.history.clear();
    this.finished = false;
    this.accumulatedMs = 0;
    this.runningSince = null;
    this.board.mount(this.state);
    this.refresh(false);
    this.announce('New board ready. Your first square is always safe.');
  }

  private tryResume(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const saved = deserialize(raw);
      if (!saved || saved.state.status !== 'playing') return false;
      this.state = saved.state;
      this.accumulatedMs = saved.elapsedMs;
      this.board.mount(this.state);
      this.refresh(false);
      if (this.state.moves > 0) this.resumeTimer();
      this.announce('Game resumed where you left off.', true);
      return true;
    } catch {
      return false;
    }
  }

  private persist(): void {
    try {
      if (this.finished) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, serialize(this.state, this.elapsedMs()));
    } catch {
      // storage unavailable
    }
  }

  private handleReveal(i: number): void {
    if (this.finished) return;
    if (this.flagMode) {
      this.handleFlag(i);
      return;
    }
    this.history.push(this.state);
    reveal(this.state, i);
    if (this.runningSince === null) this.resumeTimer();
    this.sound.play(this.state.status === 'lost' ? 'shuffle' : 'place');
    this.refresh(true);
  }

  private handleFlag(i: number): void {
    if (this.finished) return;
    this.history.push(this.state);
    toggleFlag(this.state, i);
    if (this.runningSince === null) this.resumeTimer();
    this.sound.play('flip');
    this.refresh(true);
  }

  private handleChord(i: number): void {
    if (this.finished) return;
    const before = cloneState(this.state);
    chord(this.state, i);
    if (this.state.moves === before.moves) return; // chord didn't apply
    this.history.push(before);
    this.sound.play(this.state.status === 'lost' ? 'shuffle' : 'place');
    this.refresh(true);
  }

  private hint(): void {
    if (this.finished) return;
    if (!this.state.minesPlaced) {
      this.announce('Open any square — the first is always safe.', true);
      return;
    }
    // reveal a random safe unrevealed square (a true hint, costs nothing)
    const safe: number[] = [];
    this.state.mine.forEach((m, i) => {
      if (!m && !this.state.revealed[i] && !this.state.flagged[i]) safe.push(i);
    });
    if (safe.length === 0) return;
    this.history.push(this.state);
    reveal(this.state, safe[Math.floor(Math.random() * safe.length)]!);
    this.sound.play('foundation');
    this.announce('Hint: opened a safe square for you.', true);
    this.refresh(true);
  }

  private undo(): void {
    if (this.finished) return;
    const prev = this.history.undo(this.state);
    if (!prev) return;
    this.state = prev;
    this.sound.play('undo');
    this.refresh(true);
    this.announce('Undid move.');
  }

  private redo(): void {
    if (this.finished) return;
    const next = this.history.redo(this.state);
    if (!next) return;
    this.state = next;
    this.sound.play('undo');
    this.refresh(true);
    this.announce('Redid move.');
  }

  private refresh(persist: boolean): void {
    this.board.render(this.state);
    $('stat-moves').textContent = String(this.state.moves);
    $('stat-score').textContent = String(flagsRemaining(this.state));
    const dealEl = $opt('stat-deal');
    if (dealEl) dealEl.textContent = `#${this.state.seed}`;
    this.updateClock();
    ($('btn-undo') as HTMLButtonElement).disabled = this.finished || !this.history.canUndo;
    ($('btn-redo') as HTMLButtonElement).disabled = this.finished || !this.history.canRedo;
    if (persist) this.persist();
    if (this.state.status === 'won') this.finish(true);
    else if (this.state.status === 'lost') this.finish(false);
  }

  private finish(won: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.pauseTimer();
    this.persist();
    const elapsed = this.elapsedMs();
    const stats = recordResult({
      game: GAME_ID,
      variant: this.state.variant,
      won,
      elapsedMs: elapsed,
      moves: this.state.moves,
      score: 0,
    });
    const v = variantStats(stats, this.state.variant);
    $('win-title').textContent = won ? '🎉 Swept clean!' : '✸ Boom!';
    $('win-summary').innerHTML = [
      `<dt>Time</dt><dd>${formatTime(elapsed)}${won && v.bestTimeMs === elapsed ? ' — new best!' : ''}</dd>`,
      `<dt>Difficulty</dt><dd>${difficultyOf(this.state.variant).label.split(' (')[0]}</dd>`,
      `<dt>Streak</dt><dd>${v.currentStreak}</dd>`,
    ].join('');
    this.sound.play(won ? 'win' : 'shuffle');
    this.announce(won ? `Cleared in ${formatTime(elapsed)}!` : 'You hit a mine!');
    window.setTimeout(() => {
      ($('win-dialog') as HTMLDialogElement).showModal();
    }, won ? 600 : 900);
  }

  private bindToolbar(): void {
    $('btn-new').addEventListener('click', () => this.requestNewGame());
    $('btn-confirm-new').addEventListener('click', () => {
      ($('newgame-dialog') as HTMLDialogElement).close();
      this.newGame(true);
    });
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-redo').addEventListener('click', () => this.redo());
    $('btn-hint').addEventListener('click', () => this.hint());
    $('btn-play-again').addEventListener('click', () => {
      ($('win-dialog') as HTMLDialogElement).close();
      this.newGame(false);
    });
    $opt('btn-replay-deal')?.addEventListener('click', () => {
      ($('win-dialog') as HTMLDialogElement).close();
      this.newGame(false, this.state.seed, this.state.variant);
      this.announce('Replaying the same board.', true);
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

  private bindFlagToggle(): void {
    const btn = $opt('flag-toggle');
    btn?.addEventListener('click', () => {
      this.flagMode = !this.flagMode;
      btn.classList.toggle('active', this.flagMode);
      btn.setAttribute('aria-pressed', String(this.flagMode));
      this.announce(this.flagMode ? 'Flag mode on: taps place flags.' : 'Flag mode off.', true);
    });
  }

  private async shareDeal(): Promise<void> {
    const url = `${window.location.origin}${window.location.pathname}?deal=${this.state.seed}&mode=${this.state.variant}`;
    const text = this.finished && this.state.status === 'won'
      ? `I swept Minesweeper board #${this.state.seed} in ${formatTime(this.elapsedMs())}. Can you beat it?`
      : `Try Minesweeper board #${this.state.seed} on CardHearth!`;
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
    const current = this.difficulty();
    const tried = DIFFICULTIES.filter(
      (d) => d.value === current || variantStats(stats, d.value).gamesPlayed > 0,
    ).sort((a, b) => (a.value === current ? -1 : b.value === current ? 1 : 0));
    $('stats-body').innerHTML = tried
      .map((d) => {
        const v = variantStats(stats, d.value);
        return [
          `<dt class="stats-section">${d.label.split(' (')[0]}</dt><dd class="stats-section"></dd>`,
          `<dt>Games played</dt><dd>${v.gamesPlayed}</dd>`,
          `<dt>Games won</dt><dd>${v.gamesWon}</dd>`,
          `<dt>Win rate</dt><dd>${winRate(v)}%</dd>`,
          `<dt>Current streak</dt><dd>${v.currentStreak}</dd>`,
          `<dt>Best time</dt><dd>${v.bestTimeMs === null ? '—' : formatTime(v.bestTimeMs)}</dd>`,
        ].join('');
      })
      .join('');
  }

  private bindSettingsDialog(): void {
    const variant = $opt('set-variant') as HTMLSelectElement | null;
    const theme = $('set-theme') as HTMLSelectElement;
    const felt = $('set-felt') as HTMLSelectElement;
    const back = $('set-cardback') as HTMLSelectElement;
    const left = $opt('set-lefthand') as HTMLInputElement | null;
    const anim = $('set-animations') as HTMLInputElement;
    const snd = $('set-sounds') as HTMLInputElement;

    if (variant) variant.value = String(this.difficulty());
    theme.value = this.settings.theme;
    felt.value = this.settings.felt;
    back.value = this.settings.cardBack;
    if (left) left.checked = this.settings.leftHand;
    anim.checked = this.settings.animations;
    snd.checked = this.settings.sounds;

    const update = () => {
      const prevSounds = this.settings.sounds;
      const variants = { ...this.settings.variants };
      if (variant) variants[GAME_ID] = Number(variant.value);
      this.settings = {
        ...this.settings,
        variants,
        theme: theme.value as Settings['theme'],
        felt: felt.value as Settings['felt'],
        cardBack: back.value as Settings['cardBack'],
        leftHand: left ? left.checked : this.settings.leftHand,
        animations: anim.checked,
        sounds: snd.checked,
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      if (this.settings.sounds && !prevSounds) this.sound.play('place');
      const note = $opt('variant-note');
      if (note) note.hidden = this.difficulty() === this.state.variant;
    };
    const controls = [theme, felt, back, anim, snd, ...(left ? [left] : []), ...(variant ? [variant] : [])];
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
      switch (e.key.toLowerCase()) {
        case 'n': this.requestNewGame(); break;
        case 'u': this.undo(); break;
        case 'r': this.redo(); break;
        case 'h': this.hint(); break;
        case 'f': $opt('flag-toggle')?.click(); break;
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

export function startMinesweeper(): void {
  new MinesweeperController();
}
