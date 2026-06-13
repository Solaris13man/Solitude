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
import { MahjongBoard } from './board';
import {
  LAYOUTS,
  type MahjongState,
  cloneState,
  deal,
  deserialize,
  hint,
  isWon,
  layoutOf,
  serialize,
  tap,
  tilesLeft,
} from './engine';

const SAVE_KEY = 'solitude.game.v2.mahjong';
const GAME_ID = 'mahjong';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}

class MahjongController {
  private state!: MahjongState;
  private history = new History<MahjongState>(cloneState);
  private settings: Settings;
  private board: MahjongBoard;
  private sound = new SoundPlayer();
  private selected: number | null = null;
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private finished = false;
  private toastTimer = 0;
  private daily = new DailyMode(GAME_ID);
  private saveKey = `${SAVE_KEY}${this.daily.saveSuffix}`;

  constructor() {
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.board = new MahjongBoard($('board'), (i) => this.handleTap(i));
    this.bindToolbar();
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

  private layoutVariant(): number {
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
      const variant = LAYOUTS.some((l) => l.value === mode) ? mode : undefined;
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
        score: this.state.score,
      });
    }
    const dealSeed = seed ?? (this.daily.active ? this.daily.seed : randomSeed());
    const dealVariant = variantOverride ?? (this.daily.active ? this.daily.variant : this.layoutVariant());
    this.state = deal(dealSeed, dealVariant);
    this.history.clear();
    this.finished = false;
    this.selected = null;
    this.accumulatedMs = 0;
    this.runningSince = null;
    this.board.mount(this.state);
    this.refresh(false);
    this.announce('New deal built — every deal is winnable.');
  }

  private tryResume(): boolean {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return false;
      const saved = deserialize(raw);
      if (!saved || isWon(saved.state)) return false;
      if (this.daily.active && !this.daily.isToday(saved.state.seed)) return false;
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
      if (this.finished) localStorage.removeItem(this.saveKey);
      else localStorage.setItem(this.saveKey, serialize(this.state, this.elapsedMs()));
    } catch {
      // storage unavailable
    }
  }

  private handleTap(index: number): void {
    if (this.finished) return;
    const before = cloneState(this.state);
    const result = tap(this.state, index, this.selected);
    switch (result) {
      case 'applied': {
        this.history.push(before);
        this.selected = null;
        this.sound.play('foundation');
        if (this.runningSince === null) this.resumeTimer();
        this.refresh(true);
        if (!this.finished && hint(this.state) === null) {
          this.announce('No matching pairs left — undo a few moves to find another path.', true);
        }
        return;
      }
      case 'select':
        this.selected = index;
        this.sound.play('flip');
        this.board.render(this.state, this.selected);
        return;
      case 'deselect':
        this.selected = null;
        this.board.render(this.state, this.selected);
        return;
      case 'invalid':
        this.board.shake(index);
        this.announce('That tile is blocked.');
        return;
    }
  }

  private hintMove(): void {
    if (this.finished) return;
    const pair = hint(this.state);
    if (!pair) {
      this.announce('No matching pairs left — undo a few moves to find another path.', true);
      return;
    }
    this.board.highlight(pair);
    this.announce('Hint: a matching pair is highlighted.', true);
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
    $('stat-score').textContent = String(tilesLeft(this.state) / 2);
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
      score: this.state.score,
    });
    const v = variantStats(stats, this.state.variant);
    const rows = [
      `<dt>Time</dt><dd>${formatTime(elapsed)}${v.bestTimeMs === elapsed ? ' — new best!' : ''}</dd>`,
      `<dt>Layout</dt><dd>${layoutOf(this.state.variant).label.replace(/ \(.*\)/, '')}</dd>`,
      `<dt>Pairs matched</dt><dd>${this.state.moves}</dd>`,
      `<dt>Streak</dt><dd>${v.currentStreak}</dd>`,
    ];
    if (this.daily.isToday(this.state.seed)) {
      const streak = this.daily.recordSolve(elapsed, this.state.moves, this.state.score, 'Mahjong');
      rows.push(`<dt>Daily streak</dt><dd>${streak} 🔥</dd>`);
    }
    $('win-summary').innerHTML = rows.join('');
    this.sound.play('win');
    this.announce(`Cleared the board in ${formatTime(elapsed)}!`);
    window.setTimeout(() => {
      ($('win-dialog') as HTMLDialogElement).showModal();
    }, 600);
  }

  private bindToolbar(): void {
    $('btn-new').addEventListener('click', () => this.requestNewGame());
    $('btn-confirm-new').addEventListener('click', () => {
      ($('newgame-dialog') as HTMLDialogElement).close();
      this.newGame(true);
    });
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-redo').addEventListener('click', () => this.redo());
    $('btn-hint').addEventListener('click', () => this.hintMove());
    $('btn-play-again').addEventListener('click', () => {
      ($('win-dialog') as HTMLDialogElement).close();
      this.newGame(false);
    });
    $opt('btn-replay-deal')?.addEventListener('click', () => {
      ($('win-dialog') as HTMLDialogElement).close();
      this.newGame(false, this.state.seed, this.state.variant);
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
      url = `${window.location.origin}${window.location.pathname}?deal=${this.state.seed}&mode=${this.state.variant}`;
      text = this.finished
        ? `I cleared Mahjong deal #${this.state.seed} in ${formatTime(this.elapsedMs())}. Can you beat it?`
        : `Try Mahjong deal #${this.state.seed} on CardHearth!`;
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
    const current = this.layoutVariant();
    const tried = LAYOUTS.filter(
      (l) => l.value === current || variantStats(stats, l.value).gamesPlayed > 0,
    ).sort((a, b) => (a.value === current ? -1 : b.value === current ? 1 : 0));
    const daily = this.daily.active ? DailyMode.statsRows() : '';
    $('stats-body').innerHTML = daily + tried
      .map((l) => {
        const v = variantStats(stats, l.value);
        return [
          `<dt class="stats-section">${l.label.replace(/ \(.*\)/, '')}</dt><dd class="stats-section"></dd>`,
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

    if (variant) variant.value = String(this.layoutVariant());
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
      if (note) note.hidden = this.layoutVariant() === this.state.variant;
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
        case 'h': this.hintMove(); break;
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

export function startMahjong(): void {
  new MahjongController();
}
