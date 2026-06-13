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
import {
  DIFFICULTIES,
  type SudokuState,
  cloneState,
  deal,
  deserialize,
  hintTarget,
  isGiven,
  isWon,
  revealCell,
  serialize,
  setCell,
  toggleNote,
} from './engine';
import { SudokuBoard } from './board';

const SAVE_KEY = 'solitude.game.v2.sudoku';
const GAME_ID = 'sudoku';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}

class SudokuController {
  private state!: SudokuState;
  private history = new History<SudokuState>(cloneState);
  private settings: Settings;
  private board: SudokuBoard;
  private sound = new SoundPlayer();
  private selected: number | null = null;
  private notesMode = false;
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private finished = false;
  private toastTimer = 0;
  private daily = new DailyMode(GAME_ID);
  private saveKey = `${SAVE_KEY}${this.daily.saveSuffix}`;
  private forceVariant?: number;

  constructor(forceVariant?: number) {
    this.forceVariant = forceVariant;
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.board = new SudokuBoard($('board'), (i) => this.select(i));
    this.bindToolbar();
    this.bindNumpad();
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
      this.announce('Shared puzzle loaded.', true);
    } else if (!this.tryResume()) {
      this.newGame(false);
    }
    if (this.daily.active) {
      this.daily.mountBanner();
      const again = $opt('btn-play-again');
      if (again) again.textContent = 'Play again';
    }
  }

  private difficulty(): number {
    return this.forceVariant ?? this.settings.variants[GAME_ID] ?? 1;
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

  // ----- lifecycle --------------------------------------------------------

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
    const dealSeed = seed ?? (this.daily.active ? this.daily.seed : randomSeed());
    const dealVariant = variantOverride ?? (this.daily.active ? this.daily.variant : this.difficulty());
    this.state = deal(dealSeed, dealVariant);
    track('game_started', { game: GAME_ID, variant: dealVariant });
    this.history.clear();
    this.finished = false;
    this.selected = null;
    this.accumulatedMs = 0;
    this.runningSince = null;
    this.refresh(false);
    this.announce('New puzzle dealt.');
  }

  private tryResume(): boolean {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return false;
      const saved = deserialize(raw);
      if (!saved || isWon(saved.state)) return false;
      if (this.daily.active && !this.daily.isToday(saved.state.seed)) return false;
      if (this.forceVariant !== undefined && saved.state.variant !== this.forceVariant) return false;
      this.state = saved.state;
      this.accumulatedMs = saved.elapsedMs;
      this.refresh(false);
      if (this.state.moves > 0) this.resumeTimer();
      this.announce('Puzzle resumed where you left off.', true);
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

  // ----- input ------------------------------------------------------------

  private select(i: number): void {
    this.selected = this.selected === i ? null : i;
    this.board.render(this.state, this.selected);
  }

  private moveSelection(dRow: number, dCol: number): void {
    const from = this.selected ?? 0;
    const row = Math.min(8, Math.max(0, Math.floor(from / 9) + dRow));
    const col = Math.min(8, Math.max(0, (from % 9) + dCol));
    this.selected = row * 9 + col;
    this.board.render(this.state, this.selected);
    this.board.focusCell(this.selected);
  }

  private enterDigit(v: number): void {
    if (this.finished || this.selected === null) return;
    if (isGiven(this.state, this.selected)) {
      this.announce('That square is part of the puzzle.');
      return;
    }
    this.history.push(this.state);
    if (this.notesMode && v !== 0) {
      toggleNote(this.state, this.selected, v);
      this.sound.play('flip');
    } else {
      const before = this.state.mistakes;
      setCell(this.state, this.selected, v);
      this.sound.play(v === 0 ? 'undo' : 'place');
      if (this.state.mistakes > before) {
        this.announce(`${v} is not correct there.`, true);
      }
    }
    if (this.state.moves === 0) this.resumeTimer();
    if (this.runningSince === null) this.resumeTimer();
    this.refresh(true);
  }

  private hint(): void {
    if (this.finished) return;
    const target = hintTarget(this.state, this.selected);
    if (target === null) {
      this.announce('Nothing left to fill in!', true);
      return;
    }
    this.history.push(this.state);
    revealCell(this.state, target);
    this.selected = target;
    if (this.runningSince === null) this.resumeTimer();
    this.sound.play('foundation');
    this.announce('Hint: revealed a square.', true);
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

  // ----- rendering / win ----------------------------------------------------

  private refresh(persist: boolean): void {
    this.board.render(this.state, this.selected);
    $('stat-moves').textContent = String(this.state.moves);
    $('stat-score').textContent = String(this.state.mistakes);
    const dealEl = $opt('stat-deal');
    if (dealEl) {
      dealEl.textContent =
        this.daily.isToday(this.state.seed) ? this.daily.dealLabel() : `#${this.state.seed}`;
    }
    this.updateClock();
    ($('btn-undo') as HTMLButtonElement).disabled = this.finished || !this.history.canUndo;
    ($('btn-redo') as HTMLButtonElement).disabled = this.finished || !this.history.canRedo;
    if (persist) this.persist();
    if (isWon(this.state)) this.onWin();
  }

  private onWin(): void {
    if (this.finished) return;
    this.finished = true;
    this.pauseTimer();
    this.persist();
    const elapsed = this.elapsedMs();
    const stats = recordResult({
      game: GAME_ID,
      variant: this.state.variant,
      won: true,
      elapsedMs: elapsed,
      moves: this.state.moves,
      score: 0,
    });
    const v = variantStats(stats, this.state.variant);
    const rows = [
      `<dt>Time</dt><dd>${formatTime(elapsed)}${v.bestTimeMs === elapsed ? ' — new best!' : ''}</dd>`,
      `<dt>Mistakes</dt><dd>${this.state.mistakes}</dd>`,
      `<dt>Difficulty</dt><dd>${DIFFICULTIES.find((d) => d.value === this.state.variant)?.label ?? ''}</dd>`,
      `<dt>Streak</dt><dd>${v.currentStreak}</dd>`,
    ];
    if (this.daily.isToday(this.state.seed)) {
      const streak = this.daily.recordSolve(elapsed, this.state.moves, 0, 'Sudoku');
      rows.push(`<dt>Daily streak</dt><dd>${streak} 🔥</dd>`);
    }
    $('win-summary').innerHTML = rows.join('');
    this.sound.play('win');
    this.announce(`Solved in ${formatTime(elapsed)}!`);
    this.board.flashSolved();
    window.setTimeout(() => {
      ($('win-dialog') as HTMLDialogElement).showModal();
    }, 1200);
  }

  // ----- chrome -------------------------------------------------------------

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
      this.announce('Replaying the same puzzle.', true);
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

  private bindNumpad(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-num]').forEach((btn) => {
      btn.addEventListener('click', () => this.enterDigit(Number(btn.dataset.num)));
    });
    const notes = $opt('numpad-notes');
    notes?.addEventListener('click', () => {
      this.notesMode = !this.notesMode;
      notes.classList.toggle('active', this.notesMode);
      notes.setAttribute('aria-pressed', String(this.notesMode));
      this.announce(this.notesMode ? 'Notes mode on.' : 'Notes mode off.', true);
    });
    $opt('numpad-erase')?.addEventListener('click', () => this.enterDigit(0));
  }

  private async shareDeal(): Promise<void> {
    track('share_clicked', { game: GAME_ID });
    let url: string;
    let text: string;
    if (this.daily.isToday(this.state.seed)) {
      ({ url, text } = this.daily.shareText(this.finished, this.elapsedMs()));
    } else {
      url = `${window.location.origin}${window.location.pathname}?deal=${this.state.seed}&mode=${this.state.variant}`;
      const label = DIFFICULTIES.find((d) => d.value === this.state.variant)?.label ?? '';
      text = this.finished
        ? `I solved ${label} Sudoku #${this.state.seed} in ${formatTime(this.elapsedMs())} with ${this.state.mistakes} mistakes. Can you beat it?`
        : `Try ${label} Sudoku #${this.state.seed} on CardHearth!`;
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
    const current = this.difficulty();
    const tried = DIFFICULTIES.filter(
      (d) => d.value === current || variantStats(stats, d.value).gamesPlayed > 0,
    ).sort((a, b) => (a.value === current ? -1 : b.value === current ? 1 : 0));
    const daily = this.daily.active ? DailyMode.statsRows() : '';
    $('stats-body').innerHTML = daily + tried
      .map((d) => {
        const v = variantStats(stats, d.value);
        return [
          `<dt class="stats-section">${d.label}</dt><dd class="stats-section"></dd>`,
          `<dt>Solved</dt><dd>${v.gamesWon} / ${v.gamesPlayed}</dd>`,
          `<dt>Win rate</dt><dd>${winRate(v)}%</dd>`,
          `<dt>Current streak</dt><dd>${v.currentStreak}</dd>`,
          `<dt>Best streak</dt><dd>${v.bestStreak}</dd>`,
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
        theme: theme.value as Settings['theme'],
        felt: felt.value as Settings['felt'],
        cardBack: back.value as Settings['cardBack'],
        tileSet: this.settings.tileSet,
        leftHand: left ? left.checked : this.settings.leftHand,
        animations: anim.checked,
        sounds: snd.checked,
        variants,
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      if (this.settings.sounds && !prevSounds) this.sound.play('place');
      const note = $opt('variant-note');
      if (note) note.hidden = this.difficulty() === this.state.variant;
    };
    const controls = [theme, felt, back, anim, snd, ...(variant ? [variant] : []), ...(left ? [left] : [])];
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
      if (e.key >= '1' && e.key <= '9') {
        this.enterDigit(Number(e.key));
        return;
      }
      switch (e.key) {
        case 'Backspace':
        case 'Delete':
        case '0':
          this.enterDigit(0);
          return;
        case 'ArrowUp': e.preventDefault(); this.moveSelection(-1, 0); return;
        case 'ArrowDown': e.preventDefault(); this.moveSelection(1, 0); return;
        case 'ArrowLeft': e.preventDefault(); this.moveSelection(0, -1); return;
        case 'ArrowRight': e.preventDefault(); this.moveSelection(0, 1); return;
      }
      switch (e.key.toLowerCase()) {
        case 'n': this.requestNewGame(); break;
        case 'u': this.undo(); break;
        case 'r': this.redo(); break;
        case 'h': this.hint(); break;
        case 'p': $opt('numpad-notes')?.click(); break;
      }
    });
  }

  // ----- timer ----------------------------------------------------------------

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

export function startSudoku(options: { forceVariant?: number } = {}): void {
  new SudokuController(options.forceVariant);
}
