import {
  type GameState,
  type Move,
  type PileRef,
  applyMove,
  autoMoveFor,
  canDraw,
  canMove,
  canRecycle,
  deal,
  deserialize,
  getPile,
  isTriviallyWinnable,
  isWon,
  serialize,
} from './engine/klondike';
import { cardName } from './engine/deck';
import { History } from './engine/history';
import { nextAutoCompleteMove } from './engine/autocomplete';
import { findHint } from './ui/hints';
import { Board } from './ui/board';
import { attachDragDrop } from './ui/dragdrop';
import { animateDeal, winCascade } from './ui/animations';
import { SoundPlayer } from './ui/sound';
import { randomSeed } from './engine/rng';
import {
  type Settings,
  applySettings,
  loadSettings,
  reducedMotion,
  saveSettings,
} from './themes';
import { formatTime, loadStats, recordResult, winRate } from './stats';

const SAVE_KEY = 'solitude.game.v1';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

class Game {
  private state!: GameState;
  private history = new History();
  private settings: Settings;
  private board: Board;
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private finished = false;
  private autoFinishing = false;
  private sound = new SoundPlayer();

  constructor() {
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.board = new Board($('board'));
    this.board.setOptions({ leftHand: this.settings.leftHand });
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

    if (!this.tryResume()) {
      this.newGame(false);
    }
  }

  // ----- game lifecycle -------------------------------------------------

  private newGame(countAbandon: boolean): void {
    if (countAbandon && this.state && this.state.moves > 0 && !this.finished) {
      recordResult({
        won: false,
        elapsedMs: this.elapsedMs(),
        moves: this.state.moves,
        score: this.state.score,
        drawMode: this.state.drawMode,
      });
    }
    this.state = deal(randomSeed(), this.settings.drawMode);
    this.history.clear();
    this.finished = false;
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
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const saved = deserialize(raw);
      if (!saved || isWon(saved.state)) return false;
      this.state = saved.state;
      this.accumulatedMs = saved.elapsedMs;
      this.board.setState(this.state);
      this.board.render();
      this.afterStateChange(false);
      if (this.state.moves > 0) this.resumeTimer();
      this.announce('Game resumed.');
      return true;
    } catch {
      return false;
    }
  }

  private persist(): void {
    try {
      if (this.finished) {
        localStorage.removeItem(SAVE_KEY);
      } else {
        localStorage.setItem(SAVE_KEY, serialize(this.state, this.elapsedMs()));
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
    applyMove(this.state, move);
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
    if (isWon(this.state)) {
      this.onWin();
    }
  }

  private updateHud(): void {
    $('stat-moves').textContent = String(this.state.moves);
    $('stat-score').textContent = String(this.state.score);
    this.updateClock();
    ($('btn-undo') as HTMLButtonElement).disabled = !this.history.canUndo;
    ($('btn-redo') as HTMLButtonElement).disabled = !this.history.canRedo;
    $('btn-autofinish').hidden = !isTriviallyWinnable(this.state);
  }

  private undo(): void {
    if (this.autoFinishing) return;
    const prev = this.history.undo(this.state);
    if (!prev) return;
    this.state = prev;
    this.finished = false;
    this.sound.play('undo');
    this.afterStateChange(true);
    this.announce('Undid move.');
  }

  private redo(): void {
    if (this.autoFinishing) return;
    const next = this.history.redo(this.state);
    if (!next) return;
    this.state = next;
    this.sound.play('undo');
    this.afterStateChange(true);
    this.announce('Redid move.');
  }

  private hint(): void {
    const move = findHint(this.state);
    if (!move) {
      this.announce('No moves available. Try undoing or start a new game.');
      return;
    }
    this.board.highlightMove(move, this.state);
    if (move.type === 'draw') this.announce('Hint: draw from the stock.');
    else if (move.type === 'recycle') this.announce('Hint: recycle the waste pile.');
    else {
      const pile = getPile(this.state, move.from);
      const card = pile[pile.length - move.count];
      this.announce(card ? `Hint: move the ${cardName(card)}.` : 'Hint shown.');
    }
  }

  private autoFinish(): void {
    if (this.autoFinishing || !isTriviallyWinnable(this.state)) return;
    this.autoFinishing = true;
    const stepDelay = reducedMotion(this.settings) ? 0 : 130;
    const step = () => {
      const move = nextAutoCompleteMove(this.state);
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
      won: true,
      elapsedMs: elapsed,
      moves: this.state.moves,
      score: this.state.score,
      drawMode: this.state.drawMode,
    });
    const key = this.state.drawMode === 1 ? 'd1' : 'd3';
    const best = stats.bestTimeMs[key];
    $('win-summary').innerHTML = [
      `<dt>Time</dt><dd>${formatTime(elapsed)}${best === elapsed ? ' — new best!' : ''}</dd>`,
      `<dt>Moves</dt><dd>${this.state.moves}</dd>`,
      `<dt>Score</dt><dd>${this.state.score}</dd>`,
      `<dt>Streak</dt><dd>${stats.currentStreak}</dd>`,
    ].join('');
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
        if (!canMove(this.state, from, to, count)) return false;
        this.doMove({ type: 'move', from, to, count });
        return true;
      },
      onDragOver: (from, count, target) => {
        const legal = !!target && canMove(this.state, from, target, count);
        this.board.setDropHint(legal ? target : null);
      },
      onSnapBack: () => this.board.render(),
      runElements: (ref, count) => this.board.runElements(this.state, ref, count),
    });
  }

  private canPick(ref: PileRef, depth: number): boolean {
    if (this.finished || this.autoFinishing) return false;
    if (ref.kind === 'stock') return false;
    const pile = getPile(this.state, ref);
    if (pile.length === 0) return false;
    if (ref.kind !== 'tableau') return depth === 0;
    const card = pile[pile.length - 1 - depth];
    return !!card && card.faceUp;
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
    const move = autoMoveFor(this.state, ref, depth);
    if (!move) {
      if (card) this.board.shakeCard(card.id);
      return;
    }
    const dest = move.type === 'move' && move.to.kind === 'foundation' ? 'foundation' : 'tableau';
    this.doMove(move, card ? `Moved ${cardName(card)} to ${dest}.` : undefined);
  }

  private handleStock(): void {
    if (this.finished || this.autoFinishing) return;
    if (canDraw(this.state)) {
      this.doMove({ type: 'draw' });
    } else if (canRecycle(this.state)) {
      this.doMove({ type: 'recycle' }, 'Recycled the waste pile.');
    }
  }

  // ----- chrome ----------------------------------------------------------

  private bindToolbar(): void {
    $('btn-new').addEventListener('click', () => this.newGame(true));
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-redo').addEventListener('click', () => this.redo());
    $('btn-hint').addEventListener('click', () => this.hint());
    $('btn-autofinish').addEventListener('click', () => this.autoFinish());
    $('btn-play-again').addEventListener('click', () => {
      ($('win-dialog') as HTMLDialogElement).close();
      this.newGame(false);
    });
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

  private renderStats(): void {
    const s = loadStats();
    $('stats-body').innerHTML = [
      `<dt>Games played</dt><dd>${s.gamesPlayed}</dd>`,
      `<dt>Games won</dt><dd>${s.gamesWon}</dd>`,
      `<dt>Win rate</dt><dd>${winRate(s)}%</dd>`,
      `<dt>Current streak</dt><dd>${s.currentStreak}</dd>`,
      `<dt>Best streak</dt><dd>${s.bestStreak}</dd>`,
      `<dt>Best time (Draw 1)</dt><dd>${s.bestTimeMs.d1 === null ? '—' : formatTime(s.bestTimeMs.d1)}</dd>`,
      `<dt>Best time (Draw 3)</dt><dd>${s.bestTimeMs.d3 === null ? '—' : formatTime(s.bestTimeMs.d3)}</dd>`,
      `<dt>Best score</dt><dd>${s.bestScore}</dd>`,
      `<dt>Total moves</dt><dd>${s.totalMoves}</dd>`,
    ].join('');
  }

  private bindSettingsDialog(): void {
    const draw = $('set-draw') as HTMLSelectElement;
    const theme = $('set-theme') as HTMLSelectElement;
    const felt = $('set-felt') as HTMLSelectElement;
    const back = $('set-cardback') as HTMLSelectElement;
    const left = $('set-lefthand') as HTMLInputElement;
    const anim = $('set-animations') as HTMLInputElement;
    const snd = $('set-sounds') as HTMLInputElement;

    draw.value = String(this.settings.drawMode);
    theme.value = this.settings.theme;
    felt.value = this.settings.felt;
    back.value = this.settings.cardBack;
    left.checked = this.settings.leftHand;
    anim.checked = this.settings.animations;
    snd.checked = this.settings.sounds;

    const update = () => {
      const prevSounds = this.settings.sounds;
      this.settings = {
        drawMode: draw.value === '3' ? 3 : 1,
        theme: theme.value as Settings['theme'],
        felt: felt.value as Settings['felt'],
        cardBack: back.value as Settings['cardBack'],
        leftHand: left.checked,
        animations: anim.checked,
        sounds: snd.checked,
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      if (this.settings.sounds && !prevSounds) this.sound.play('place');
      this.board.setOptions({ leftHand: this.settings.leftHand });
      this.board.resize();
      $('draw-mode-note').hidden = this.settings.drawMode === this.state.drawMode;
    };
    for (const el of [draw, theme, felt, back, left, anim]) {
      el.addEventListener('change', update);
    }
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
        case 'n': this.newGame(true); break;
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
  }

  private announce(text: string): void {
    $('announcer').textContent = text;
  }
}

export function startGame(): void {
  new Game();
}
