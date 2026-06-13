import { History } from '../../lib/history';
import { SoundPlayer } from '../../lib/sound';
import {
  aggregate,
  formatTime,
  loadStats,
  recordResult,
  variantStats,
  winRate,
} from '../../lib/stats';
import {
  type Settings,
  applySettings,
  loadSettings,
  reducedMotion,
  saveSettings,
} from '../../lib/settings';
import { DailyMode } from '../../lib/daily-mode';
import { track } from '../../lib/analytics';
import {
  type GameState,
  type Move,
  type PileRef,
  type Ruleset,
  cloneState,
  deserialize,
  getPile,
  serialize,
} from './types';
import { cardName } from './deck';
import { randomSeed } from './rng';
import { Board } from './board';
import { attachDragDrop } from './dragdrop';
import { animateDeal, winCascade } from './animations';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export interface StartOptions {
  /**
   * Pin the game to one variant (used by landing pages like
   * /spider-4-suits/). The settings variant select is absent on those pages.
   */
  forceVariant?: number;
}

/** Generic controller for any card Ruleset (Klondike, Spider, FreeCell, …). */
class CardGameController {
  private ruleset: Ruleset;
  private options: StartOptions;
  private daily: DailyMode;
  private saveKey: string;
  private state!: GameState;
  private history = new History<GameState>(cloneState);
  private settings: Settings;
  private board: Board;
  private sound = new SoundPlayer();
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private finished = false;
  private autoFinishing = false;

  constructor(ruleset: Ruleset, options: StartOptions = {}) {
    this.ruleset = ruleset;
    this.options = options;
    // Daily Challenge mode self-activates from the ?daily=1 URL when this
    // game is today's rotation pick; it saves separately so it never
    // clobbers a regular game in progress.
    this.daily = new DailyMode(ruleset.id);
    this.saveKey = `solitude.game.v2.${ruleset.id}${this.daily.saveSuffix}`;
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.board = new Board($('board'), {
      tableauCount: ruleset.tableauCount,
      foundationCount: ruleset.foundationCount,
      cellCount: ruleset.cellCount,
      hasStock: ruleset.hasStock,
      hasWaste: ruleset.hasWaste,
      wasteDrop: ruleset.wasteDrop ?? false,
    });
    this.board.setOptions({
      leftHand: this.settings.leftHand,
      canPick: (ref, depth) => this.canPick(ref, depth),
    });
    this.bindInteractions();
    this.bindToolbar();
    this.bindSettingsDialog();
    this.bindKeyboard();
    this.bindResize();
    window.setInterval(() => this.updateClock(), 500);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseTimer();
      else if (!this.finished && this.state.moves > 0) this.resumeTimer();
    });

    // A shared deal link (?deal=SEED&mode=VARIANT) starts that exact deal —
    // including the variant, so recipients truly get the same cards. The
    // params are consumed once and stripped so a later reload resumes
    // whatever is actually in progress instead of silently re-dealing.
    const shared = this.sharedDealFromUrl();
    if (shared !== null) {
      this.newGame(false, shared.seed, shared.variant);
      this.announce('Shared deal loaded.', true);
    } else if (!this.tryResume()) {
      this.newGame(false);
    }
    if (this.daily.active) {
      this.daily.mountBanner();
      // On the daily the "new deal" button replays the same daily.
      const again = $opt('btn-play-again');
      if (again) again.textContent = 'Play again';
    }
  }

  private sharedDealFromUrl(): { seed: number; variant?: number } | null {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('deal');
      if (!raw) return null;
      const seed = Number.parseInt(raw, 10);
      if (!Number.isFinite(seed) || seed < 0) return null;
      const modeRaw = params.get('mode');
      const mode = modeRaw === null ? undefined : Number.parseInt(modeRaw, 10);
      const variant =
        mode !== undefined && this.ruleset.variants.some((v) => v.value === mode)
          ? mode
          : undefined;
      window.history.replaceState(null, '', window.location.pathname);
      return { seed: seed >>> 0, variant };
    } catch {
      return null;
    }
  }

  private variant(): number {
    return (
      this.options.forceVariant ??
      this.settings.variants[this.ruleset.id] ??
      this.ruleset.defaultVariant
    );
  }

  // ----- game lifecycle -------------------------------------------------

  /** Asks for confirmation first when a started game would be abandoned. */
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
        game: this.ruleset.id,
        variant: this.state.variant,
        won: false,
        elapsedMs: this.elapsedMs(),
        moves: this.state.moves,
        score: this.state.score,
      });
    }
    const dealSeed = seed ?? (this.daily.active ? this.daily.seed : randomSeed());
    const dealVariant = variantOverride ?? (this.daily.active ? this.daily.variant : this.variant());
    this.state = this.ruleset.deal(dealSeed, dealVariant);
    track('game_started', { game: this.ruleset.id, variant: dealVariant });
    this.history.clear();
    this.finished = false;
    this.autoFinishing = false;
    this.accumulatedMs = 0;
    this.runningSince = null;
    this.board.reset();
    this.board.setState(this.state);
    animateDeal(this.board, this.state, !reducedMotion(this.settings));
    this.afterStateChange(false);
    if (countAbandon) this.sound.play('shuffle');
    this.announce('New game dealt.');
  }

  private tryResume(): boolean {
    try {
      const raw = localStorage.getItem(this.saveKey);
      if (!raw) return false;
      const saved = deserialize(raw);
      if (!saved || saved.state.game !== this.ruleset.id || this.ruleset.isWon(saved.state)) {
        return false;
      }
      // Variant landing pages only resume a save of their own variant.
      if (
        this.options.forceVariant !== undefined &&
        saved.state.variant !== this.options.forceVariant
      ) {
        return false;
      }
      // Yesterday's unfinished daily is gone; the day moved on.
      if (this.daily.active && !this.daily.isToday(saved.state.seed)) return false;
      this.state = saved.state;
      this.accumulatedMs = saved.elapsedMs;
      this.board.setState(this.state);
      this.board.render();
      this.afterStateChange(false);
      if (this.state.moves > 0) this.resumeTimer();
      this.announce('Game resumed where you left off.', true);
      return true;
    } catch {
      return false;
    }
  }

  private persist(): void {
    try {
      if (this.finished) {
        localStorage.removeItem(this.saveKey);
      } else {
        localStorage.setItem(this.saveKey, serialize(this.state, this.elapsedMs()));
      }
    } catch {
      // storage unavailable; the game just won't survive a reload
    }
  }

  // ----- moves ----------------------------------------------------------

  private doMove(move: Move, announceText?: string): void {
    if (this.finished) return;
    if (this.state.moves === 0) this.resumeTimer();
    this.history.push(this.state);
    this.ruleset.applyMove(this.state, move);
    if (this.runningSince === null) this.resumeTimer();
    if (move.type === 'draw') this.sound.play('flip');
    else if (move.type === 'recycle') this.sound.play('shuffle');
    else if (move.to.kind === 'foundation') this.sound.play('foundation');
    else this.sound.play('place');
    this.afterStateChange(true);
    if (announceText) this.announce(announceText);
  }

  private afterStateChange(persist: boolean): void {
    this.board.setState(this.state);
    this.board.render();
    this.updateHud();
    if (persist) this.persist();
    if (this.ruleset.isWon(this.state)) {
      this.onWin();
    }
  }

  private updateHud(): void {
    $('stat-moves').textContent = String(this.state.moves);
    $('stat-score').textContent = String(this.state.score);
    const dealEl = $opt('stat-deal');
    if (dealEl) {
      dealEl.textContent =
        this.daily.isToday(this.state.seed) ? this.daily.dealLabel() : `#${this.state.seed}`;
    }
    this.updateClock();
    // Once a game is won it stays won: undo/redo lock so the result can't be
    // replayed for extra wins.
    ($('btn-undo') as HTMLButtonElement).disabled = this.finished || !this.history.canUndo;
    ($('btn-redo') as HTMLButtonElement).disabled = this.finished || !this.history.canRedo;
    $('btn-autofinish').hidden = !this.ruleset.isTriviallyWinnable(this.state);
  }

  private undo(): void {
    if (this.autoFinishing || this.finished) return;
    const prev = this.history.undo(this.state);
    if (!prev) return;
    this.state = prev;
    this.sound.play('undo');
    this.afterStateChange(true);
    this.announce('Undid move.');
  }

  private redo(): void {
    if (this.autoFinishing || this.finished) return;
    const next = this.history.redo(this.state);
    if (!next) return;
    this.state = next;
    this.sound.play('undo');
    this.afterStateChange(true);
    this.announce('Redid move.');
  }

  private hint(): void {
    const move = this.ruleset.findHint(this.state);
    if (!move) {
      this.announce('No useful moves found. Try undoing, or start a new game.', true);
      return;
    }
    this.board.highlightMove(move, this.state);
    if (move.type === 'draw') this.announce('Hint: draw from the stock.', true);
    else if (move.type === 'recycle') this.announce('Hint: recycle the waste pile.', true);
    else {
      const pile = getPile(this.state, move.from);
      const card = pile[pile.length - move.count];
      this.announce(card ? `Hint: move the ${cardName(card)}.` : 'Hint shown.', true);
    }
  }

  private autoFinish(): void {
    if (this.autoFinishing || !this.ruleset.isTriviallyWinnable(this.state)) return;
    this.autoFinishing = true;
    const stepDelay = reducedMotion(this.settings) ? 0 : 130;
    const step = () => {
      const move = this.ruleset.nextAutoCompleteMove(this.state);
      if (!move) {
        this.autoFinishing = false;
        return;
      }
      this.doMove(move);
      if (!this.finished) window.setTimeout(step, stepDelay);
      else this.autoFinishing = false;
    };
    step();
  }

  private onWin(): void {
    if (this.finished) return;
    this.finished = true;
    this.pauseTimer();
    this.persist();
    const elapsed = this.elapsedMs();
    const stats = recordResult({
      game: this.ruleset.id,
      variant: this.state.variant,
      won: true,
      elapsedMs: elapsed,
      moves: this.state.moves,
      score: this.state.score,
    });
    const v = variantStats(stats, this.state.variant);
    const rows = [
      `<dt>Time</dt><dd>${formatTime(elapsed)}${v.bestTimeMs === elapsed ? ' — new best!' : ''}</dd>`,
      `<dt>Moves</dt><dd>${this.state.moves}</dd>`,
      `<dt>Score</dt><dd>${this.state.score}</dd>`,
      `<dt>Streak</dt><dd>${v.currentStreak}</dd>`,
    ];
    if (this.daily.isToday(this.state.seed)) {
      const streak = this.daily.recordSolve(elapsed, this.state.moves, this.state.score, this.ruleset.name);
      rows.push(`<dt>Daily streak</dt><dd>${streak} 🔥</dd>`);
    }
    $('win-summary').innerHTML = rows.join('');
    this.sound.play('win');
    this.announce(`You won in ${formatTime(elapsed)} with ${this.state.moves} moves!`);
    winCascade(this.board, this.state, !reducedMotion(this.settings), () => {
      ($('win-dialog') as HTMLDialogElement).showModal();
    });
  }

  // ----- interactions ----------------------------------------------------

  private bindInteractions(): void {
    attachDragDrop(this.board, {
      onTap: (ref, depth) => this.handleTap(ref, depth),
      onStock: () => this.handleStock(),
      canPick: (ref, depth) => this.canPick(ref, depth),
      onDrop: (from, count, to) => {
        if (!this.ruleset.canMove(this.state, from, to, count)) return false;
        this.doMove({ type: 'move', from, to, count });
        return true;
      },
      onDragOver: (from, count, target) => {
        const legal = !!target && this.ruleset.canMove(this.state, from, target, count);
        this.board.setDropHint(legal ? target : null);
      },
      onSnapBack: () => this.board.render(),
      runElements: (ref, count) => this.board.runElements(this.state, ref, count),
    });
  }

  private canPick(ref: PileRef, depth: number): boolean {
    if (this.finished || this.autoFinishing) return false;
    return this.ruleset.canPickRun(this.state, ref, depth);
  }

  private handleTap(ref: PileRef, depth: number): void {
    if (this.finished || this.autoFinishing) return;
    if (ref.kind === 'stock') {
      this.handleStock();
      return;
    }
    if (!this.canPick(ref, depth)) return;
    const pile = getPile(this.state, ref);
    const card = pile[pile.length - 1 - depth];
    const move = this.ruleset.autoMoveFor(this.state, ref, depth);
    if (!move) {
      if (card) this.board.shakeCard(card.id);
      return;
    }
    const dest = move.type === 'move' ? move.to.kind : 'tableau';
    this.doMove(move, card ? `Moved ${cardName(card)} to ${dest}.` : undefined);
  }

  private handleStock(): void {
    if (this.finished || this.autoFinishing) return;
    if (this.ruleset.canDraw(this.state)) {
      this.doMove({ type: 'draw' });
    } else if (this.ruleset.canRecycle(this.state)) {
      this.doMove({ type: 'recycle' }, 'Recycled the waste pile.');
    } else if (this.state.stock.length > 0) {
      // Spider: dealing requires every column to be occupied.
      this.announce('Fill every empty column before dealing new cards.', true);
    }
  }

  // ----- chrome ----------------------------------------------------------

  private bindToolbar(): void {
    $('btn-new').addEventListener('click', () => this.requestNewGame());
    $('btn-confirm-new').addEventListener('click', () => {
      ($('newgame-dialog') as HTMLDialogElement).close();
      this.newGame(true);
    });
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-redo').addEventListener('click', () => this.redo());
    $('btn-hint').addEventListener('click', () => this.hint());
    $('btn-autofinish').addEventListener('click', () => this.autoFinish());
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
    // Re-show the final board if the win dialog is dismissed (the cascade
    // hides cards as they fly off).
    $opt('win-dialog')?.addEventListener('close', () => this.board.render());
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

  /** Share the current deal (same seed + variant → same cards for everyone). */
  private async shareDeal(): Promise<void> {
    let url: string;
    let text: string;
    if (this.daily.isToday(this.state.seed)) {
      ({ url, text } = this.daily.shareText(this.finished, this.elapsedMs()));
      track('share_clicked', { game: this.ruleset.id, type: 'daily' });
    } else {
      track('share_clicked', { game: this.ruleset.id, type: 'deal' });
      const mode = this.ruleset.variants.length > 0 ? `&mode=${this.state.variant}` : '';
      url = `${window.location.origin}${window.location.pathname}?deal=${this.state.seed}${mode}`;
      text = this.finished
        ? `I won ${this.ruleset.name} deal #${this.state.seed} in ${formatTime(this.elapsedMs())} with ${this.state.moves} moves. Can you beat it?`
        : `Try ${this.ruleset.name} deal #${this.state.seed} on CardHearth!`;
    }
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      this.announce('Challenge link copied to clipboard!', true);
    } catch {
      // user cancelled the share sheet, or clipboard unavailable
    }
  }

  private renderStats(): void {
    const stats = loadStats(this.ruleset.id);
    const rows = (label: string, v: ReturnType<typeof aggregate>): string =>
      [
        label ? `<dt class="stats-section">${label}</dt><dd class="stats-section"></dd>` : '',
        `<dt>Games played</dt><dd>${v.gamesPlayed}</dd>`,
        `<dt>Games won</dt><dd>${v.gamesWon}</dd>`,
        `<dt>Win rate</dt><dd>${winRate(v)}%</dd>`,
        `<dt>Current streak</dt><dd>${v.currentStreak}</dd>`,
        `<dt>Best streak</dt><dd>${v.bestStreak}</dd>`,
        `<dt>Best time</dt><dd>${v.bestTimeMs === null ? '—' : formatTime(v.bestTimeMs)}</dd>`,
        `<dt>Best score</dt><dd>${v.bestScore}</dd>`,
      ].join('');
    const daily = this.daily.active ? DailyMode.statsRows() : '';
    if (this.ruleset.variants.length === 0) {
      $('stats-body').innerHTML = daily + rows('', variantStats(stats, this.ruleset.defaultVariant));
      return;
    }
    // One section per variant the player has actually tried, current first.
    const current = this.variant();
    const tried = this.ruleset.variants.filter(
      (v) => v.value === current || variantStats(stats, v.value).gamesPlayed > 0,
    );
    $('stats-body').innerHTML =
      daily +
      tried
        .sort((a, b) => (a.value === current ? -1 : b.value === current ? 1 : 0))
        .map((v) => rows(v.label, variantStats(stats, v.value)))
        .join('');
  }

  private bindSettingsDialog(): void {
    const variant = $opt('set-variant') as HTMLSelectElement | null;
    const theme = $('set-theme') as HTMLSelectElement;
    const felt = $('set-felt') as HTMLSelectElement;
    const back = $('set-cardback') as HTMLSelectElement;
    const cardset = $opt('set-cardset') as HTMLSelectElement | null;
    const left = $('set-lefthand') as HTMLInputElement;
    const anim = $('set-animations') as HTMLInputElement;
    const snd = $('set-sounds') as HTMLInputElement;

    if (variant) variant.value = String(this.variant());
    theme.value = this.settings.theme;
    felt.value = this.settings.felt;
    back.value = this.settings.cardBack;
    if (cardset) cardset.value = this.settings.cardSet;
    left.checked = this.settings.leftHand;
    anim.checked = this.settings.animations;
    snd.checked = this.settings.sounds;

    const update = () => {
      const prevSounds = this.settings.sounds;
      const variants = { ...this.settings.variants };
      if (variant) variants[this.ruleset.id] = Number(variant.value);
      this.settings = {
        theme: theme.value as Settings['theme'],
        felt: felt.value as Settings['felt'],
        cardBack: back.value as Settings['cardBack'],
        cardSet: (cardset ? cardset.value : this.settings.cardSet) as Settings['cardSet'],
        tileSet: this.settings.tileSet,
        leftHand: left.checked,
        animations: anim.checked,
        sounds: snd.checked,
        variants,
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      if (this.settings.sounds && !prevSounds) this.sound.play('place');
      this.board.applyCardArt();
      this.board.setOptions({
        leftHand: this.settings.leftHand,
        canPick: (ref, depth) => this.canPick(ref, depth),
      });
      this.board.resize();
      const note = $opt('variant-note');
      if (note) note.hidden = this.variant() === this.state.variant;
    };
    const controls = [theme, felt, back, left, anim, snd, ...(cardset ? [cardset] : []), ...(variant ? [variant] : [])];
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
        case 'd': this.handleStock(); break;
        case 'a': this.autoFinish(); break;
      }
    });
  }

  private bindResize(): void {
    let pending = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => this.board.resize(), 100);
    });
  }

  // ----- timer ------------------------------------------------------------

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

  private toastTimer = 0;

  /**
   * Announce to assistive tech, and — for messages sighted players need too
   * (hints, blocked actions, resumes) — show a brief visible toast.
   */
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

export function startGame(ruleset: Ruleset, options: StartOptions = {}): void {
  new CardGameController(ruleset, options);
}
