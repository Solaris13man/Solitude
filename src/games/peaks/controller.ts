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
import { DailyMode } from '../../lib/daily-mode';
import { PeaksBoard } from './board';
import {
  type PeaksRules,
  type PeaksState,
  type Target,
  cloneState,
  deserialize,
  serialize,
} from './types';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Controller for tap-driven formation games (Pyramid, TriPeaks). */
class PeaksController {
  private rules: PeaksRules;
  private saveKey: string;
  private state!: PeaksState;
  private history = new History<PeaksState>(cloneState);
  private settings: Settings;
  private board: PeaksBoard;
  private sound = new SoundPlayer();
  private selected: Target | null = null;
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private finished = false;
  private toastTimer = 0;

  private daily: DailyMode;

  constructor(rules: PeaksRules) {
    this.rules = rules;
    this.daily = new DailyMode(rules.id);
    this.saveKey = `solitude.game.v2.${rules.id}${this.daily.saveSuffix}`;
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.board = new PeaksBoard($('board'), rules, (t) => this.handleTap(t));
    this.board.bindKeys();
    this.bindToolbar();
    this.bindSettingsDialog();
    this.bindKeyboard();
    window.setInterval(() => this.updateClock(), 500);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseTimer();
      else if (!this.finished && this.state.moves > 0) this.resumeTimer();
    });
    window.addEventListener('resize', () => {
      this.board.computeMetrics();
      this.board.render(this.state, this.selected);
    });

    const shared = this.sharedDealFromUrl();
    if (shared !== null) {
      this.newGame(false, shared);
      this.announce('Shared deal loaded.', true);
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

  // ----- lifecycle ---------------------------------------------------------

  private requestNewGame(): void {
    if (this.state && this.state.moves > 0 && !this.finished) {
      ($('newgame-dialog') as HTMLDialogElement).showModal();
      return;
    }
    this.newGame(false);
  }

  private newGame(countAbandon: boolean, seed?: number): void {
    if (countAbandon && this.state && this.state.moves > 0 && !this.finished) {
      recordResult({
        game: this.rules.id,
        variant: 0,
        won: false,
        elapsedMs: this.elapsedMs(),
        moves: this.state.moves,
        score: this.state.score,
      });
    }
    this.state = this.rules.deal(seed ?? (this.daily.active ? this.daily.seed : randomSeed()));
    this.history.clear();
    this.finished = false;
    this.selected = null;
    this.accumulatedMs = 0;
    this.runningSince = null;
    this.board.reset();
    this.refresh(false);
    this.announce('New game dealt.');
  }

  private tryResume(): boolean {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return false;
      const saved = deserialize(raw, this.rules.id);
      if (!saved || this.rules.isWon(saved.state)) return false;
      if (this.daily.active && !this.daily.isToday(saved.state.seed)) return false;
      this.state = saved.state;
      this.accumulatedMs = saved.elapsedMs;
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
      if (this.finished) localStorage.removeItem(this.saveKey);
      else localStorage.setItem(this.saveKey, serialize(this.state, this.elapsedMs()));
    } catch {
      // storage unavailable
    }
  }

  // ----- play ----------------------------------------------------------------

  private handleTap(target: Target | 'stock'): void {
    if (this.finished) return;
    if (target === 'stock') {
      if (this.rules.canDraw(this.state)) {
        this.history.push(this.state);
        this.rules.draw(this.state);
        this.selected = null;
        this.sound.play('flip');
        this.afterMove();
      } else if (this.rules.canRecycle(this.state)) {
        this.history.push(this.state);
        this.rules.recycle(this.state);
        this.selected = null;
        this.sound.play('shuffle');
        this.announce('Recycled the waste pile.', true);
        this.afterMove();
      }
      return;
    }
    const before = cloneState(this.state);
    const result = this.rules.tap(this.state, target, this.selected);
    switch (result) {
      case 'applied':
        this.history.push(before);
        this.selected = null;
        this.sound.play(this.rules.pairing ? 'foundation' : 'place');
        this.afterMove();
        return;
      case 'select':
        this.selected = target;
        this.sound.play('flip');
        this.board.render(this.state, this.selected);
        return;
      case 'deselect':
        this.selected = null;
        this.board.render(this.state, this.selected);
        return;
      case 'invalid':
        this.board.shake(target);
        return;
    }
  }

  private afterMove(): void {
    if (this.state.moves > 0 && this.runningSince === null) this.resumeTimer();
    this.refresh(true);
  }

  private hint(): void {
    if (this.finished) return;
    const h = this.rules.hint(this.state);
    if (h === null) {
      this.announce('No moves left — this one is over. Deal a new game?', true);
      return;
    }
    this.board.highlight(h);
    if (h === 'draw') this.announce('Hint: draw from the stock.', true);
    else if (h === 'recycle') this.announce('Hint: recycle the waste pile.', true);
    else this.announce('Hint: a playable card is highlighted.', true);
  }

  private undo(): void {
    if (this.finished) return;
    const prev = this.history.undo(this.state);
    if (!prev) return;
    this.state = prev;
    this.selected = null;
    this.sound.play('undo');
    this.refresh(true);
    this.announce('Undid move.');
  }

  private redo(): void {
    if (this.finished) return;
    const next = this.history.redo(this.state);
    if (!next) return;
    this.state = next;
    this.selected = null;
    this.sound.play('undo');
    this.refresh(true);
    this.announce('Redid move.');
  }

  private refresh(persist: boolean): void {
    this.board.render(this.state, this.selected);
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
    if (this.rules.isWon(this.state)) this.onWin();
  }

  private onWin(): void {
    if (this.finished) return;
    this.finished = true;
    this.pauseTimer();
    this.persist();
    const elapsed = this.elapsedMs();
    const stats = recordResult({
      game: this.rules.id,
      variant: 0,
      won: true,
      elapsedMs: elapsed,
      moves: this.state.moves,
      score: this.state.score,
    });
    const v = variantStats(stats, 0);
    const rows = [
      `<dt>Time</dt><dd>${formatTime(elapsed)}${v.bestTimeMs === elapsed ? ' — new best!' : ''}</dd>`,
      `<dt>Moves</dt><dd>${this.state.moves}</dd>`,
      `<dt>Score</dt><dd>${this.state.score}</dd>`,
      `<dt>Streak</dt><dd>${v.currentStreak}</dd>`,
    ];
    if (this.daily.isToday(this.state.seed)) {
      const streak = this.daily.recordSolve(elapsed, this.state.moves, this.state.score, this.rules.name);
      rows.push(`<dt>Daily streak</dt><dd>${streak} 🔥</dd>`);
    }
    $('win-summary').innerHTML = rows.join('');
    this.sound.play('win');
    this.announce(`You won in ${formatTime(elapsed)}!`);
    window.setTimeout(() => {
      ($('win-dialog') as HTMLDialogElement).showModal();
    }, 600);
  }

  // ----- chrome ----------------------------------------------------------------

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
      this.newGame(false, this.state.seed);
      this.announce('Replaying the same deal.', true);
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
    let url: string;
    let text: string;
    if (this.daily.isToday(this.state.seed)) {
      ({ url, text } = this.daily.shareText(this.finished, this.elapsedMs()));
    } else {
      url = `${window.location.origin}${window.location.pathname}?deal=${this.state.seed}`;
      text = this.finished
        ? `I cleared ${this.rules.name} deal #${this.state.seed} in ${formatTime(this.elapsedMs())} (${this.state.score} points). Can you beat it?`
        : `Try ${this.rules.name} deal #${this.state.seed} on CardHearth!`;
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
    const stats = loadStats(this.rules.id);
    const v = variantStats(stats, 0);
    const daily = this.daily.active ? DailyMode.statsRows() : '';
    $('stats-body').innerHTML = daily + [
      `<dt>Games played</dt><dd>${v.gamesPlayed}</dd>`,
      `<dt>Games won</dt><dd>${v.gamesWon}</dd>`,
      `<dt>Win rate</dt><dd>${winRate(v)}%</dd>`,
      `<dt>Current streak</dt><dd>${v.currentStreak}</dd>`,
      `<dt>Best streak</dt><dd>${v.bestStreak}</dd>`,
      `<dt>Best time</dt><dd>${v.bestTimeMs === null ? '—' : formatTime(v.bestTimeMs)}</dd>`,
      `<dt>Best score</dt><dd>${v.bestScore}</dd>`,
    ].join('');
  }

  private bindSettingsDialog(): void {
    const theme = $('set-theme') as HTMLSelectElement;
    const felt = $('set-felt') as HTMLSelectElement;
    const surface = $('set-surface') as HTMLSelectElement;
    const back = $('set-cardback') as HTMLSelectElement;
    const cardset = $opt('set-cardset') as HTMLSelectElement | null;
    const left = $opt('set-lefthand') as HTMLInputElement | null;
    const anim = $('set-animations') as HTMLInputElement;
    const snd = $('set-sounds') as HTMLInputElement;

    theme.value = this.settings.theme;
    felt.value = this.settings.felt;
    surface.value = this.settings.tableSurface;
    back.value = this.settings.cardBack;
    if (cardset) cardset.value = this.settings.cardSet;
    if (left) left.checked = this.settings.leftHand;
    anim.checked = this.settings.animations;
    snd.checked = this.settings.sounds;

    // Card-back picker only affects the drawn 'Classic' deck.
    const syncBackPicker = () => {
      const field = back.closest('label');
      if (field) (field as HTMLElement).hidden = (cardset ? cardset.value : this.settings.cardSet) !== 'classic';
    };
    syncBackPicker();

    const update = () => {
      const prevSounds = this.settings.sounds;
      this.settings = {
        ...this.settings,
        theme: theme.value as Settings['theme'],
        felt: felt.value as Settings['felt'],
        tableSurface: surface.value as Settings['tableSurface'],
        cardBack: back.value as Settings['cardBack'],
        cardSet: (cardset ? cardset.value : this.settings.cardSet) as Settings['cardSet'],
        tileSet: this.settings.tileSet,
        leftHand: left ? left.checked : this.settings.leftHand,
        animations: anim.checked,
        sounds: snd.checked,
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      if (this.settings.sounds && !prevSounds) this.sound.play('place');
      this.board.applyCardArt();
      syncBackPicker();
    };
    const controls = [theme, felt, surface, back, anim, snd, ...(cardset ? [cardset] : []), ...(left ? [left] : [])];
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
        case 'd': this.handleTap('stock'); break;
      }
    });
  }

  // ----- timer --------------------------------------------------------------

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

export function startPeaks(rules: PeaksRules): void {
  new PeaksController(rules);
}
