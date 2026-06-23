import { type Settings, applySettings, loadSettings, saveSettings } from '../../lib/settings';
import { SoundPlayer } from '../../lib/sound';
import { recordResult } from '../../lib/stats';
import { cardArt, cardArtById } from '../cards/board';
import { activateOnKey, markHandCard } from '../cards/a11y';
import { RANK_LABELS, SUIT_SYMBOLS, type Card, isRed } from '../cards/deck';
import * as H from './engine';

const SEAT_NAMES = ['You', 'West', 'North', 'East'];
const PASS_LABEL = ['left', 'right', 'across', '(no pass)'];
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Build a card element, face-up (premium art or a drawn fallback) or a back. */
function cardEl(card: Card | null, faceUp: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hcard';
  if (faceUp && card) {
    el.dataset.id = card.id;
    const art = cardArt(card);
    if (art) {
      el.innerHTML = `<img class="hcard-img" alt="" draggable="false" src="${art.face}">`;
    } else {
      el.classList.add(isRed(card.suit) ? 'hcard-red' : 'hcard-black');
      el.innerHTML =
        `<span class="hcard-corner">${RANK_LABELS[card.rank]}<i>${SUIT_SYMBOLS[card.suit]}</i></span>` +
        `<span class="hcard-mid">${SUIT_SYMBOLS[card.suit]}</span>`;
    }
  } else {
    el.classList.add('hcard-back');
    const back = cardArtById('S1')?.back;
    if (back) el.innerHTML = `<img class="hcard-img" alt="" draggable="false" src="${back}">`;
  }
  return el;
}

function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    const s = SUIT_ORDER[a.suit]! - SUIT_ORDER[b.suit]!;
    if (s !== 0) return s;
    const av = a.rank === 1 ? 14 : a.rank;
    const bv = b.rank === 1 ? 14 : b.rank;
    return av - bv;
  });
}

class HeartsController {
  private state!: H.HeartsState;
  private settings: Settings;
  private sound = new SoundPlayer();
  private selectedPass = new Set<string>();
  private busy = false;

  constructor() {
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.bindToolbar();
    this.bindSettings();
    $('hearts-hand').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.hcard');
      if (card?.dataset.id) this.onCardClick(card.dataset.id);
    });
    activateOnKey($('hearts-hand'), '.hcard', (el) => {
      if (el.dataset.id) this.onCardClick(el.dataset.id);
    });
    this.newGame();
  }

  private newGame(): void {
    this.state = H.newGame((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, this.queenBreaksHearts());
    this.selectedPass.clear();
    this.render();
    this.enterPhase();
  }

  /** House rule from settings: does the Queen of Spades break hearts? Defaults on. */
  private queenBreaksHearts(): boolean {
    return this.settings.variants['hearts'] !== 0;
  }

  // ----- phase flow -------------------------------------------------------

  private enterPhase(): void {
    if (this.state.phase === 'passing') {
      this.setStatus(`Pass 3 cards ${PASS_LABEL[this.state.passDir]} — pick three from your hand.`);
      this.showPassBar(true);
    } else if (this.state.phase === 'playing') {
      this.showPassBar(false);
      void this.advance();
    }
  }

  private confirmPass(): void {
    if (this.selectedPass.size !== 3 || this.state.phase !== 'passing') return;
    const mine = this.state.hands[0]!.filter((c) => this.selectedPass.has(c.id));
    const passes: Card[][] = [mine, H.aiPass(this.state, 1), H.aiPass(this.state, 2), H.aiPass(this.state, 3)];
    H.applyPass(this.state, passes);
    this.selectedPass.clear();
    this.sound.play('shuffle');
    this.showPassBar(false);
    this.render();
    void this.advance();
  }

  /** Drive AI turns and trick resolution until it's the human's turn or the
   *  round/game ends. */
  private async advance(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    while (true) {
      const s = this.state;
      if (s.phase !== 'playing') {
        this.busy = false;
        this.onRoundOrGameEnd();
        return;
      }
      if (s.trick.length === 4) {
        this.render(); // show the full trick
        await delay(850);
        H.resolveTrick(s);
        this.sound.play('place');
        this.render();
        continue;
      }
      if (s.turn === 0) {
        this.busy = false;
        this.render();
        this.setStatus(s.trick.length === 0 ? 'Your lead.' : 'Your turn.');
        return;
      }
      this.setStatus(`${SEAT_NAMES[s.turn]} is thinking…`);
      await delay(520);
      const card = H.aiPlay(s, s.turn);
      H.playCard(s, s.turn, card);
      this.sound.play('flip');
      this.render();
    }
  }

  private onCardClick(id: string): void {
    const s = this.state;
    if (s.phase === 'passing') {
      if (this.selectedPass.has(id)) this.selectedPass.delete(id);
      else if (this.selectedPass.size < 3) this.selectedPass.add(id);
      this.render();
      const btn = $opt('btn-pass') as HTMLButtonElement | null;
      if (btn) btn.disabled = this.selectedPass.size !== 3;
      return;
    }
    if (this.busy || s.phase !== 'playing' || s.turn !== 0) return;
    const card = s.hands[0]!.find((c) => c.id === id);
    if (!card || !H.isLegalPlay(s, 0, card)) {
      this.setStatus("You can't play that card.");
      return;
    }
    H.playCard(s, 0, card);
    this.sound.play('place');
    this.render();
    void this.advance();
  }

  private onRoundOrGameEnd(): void {
    if (this.state.phase === 'gameOver') {
      const winner = H.gameWinner(this.state);
      if (winner === 0) this.sound.play('win');
      recordResult({
        game: 'hearts',
        variant: 0,
        won: winner === 0,
        elapsedMs: 0,
        moves: this.state.round + 1,
        score: this.state.scores[0]!,
      });
      this.showGameOver(winner);
    } else if (this.state.phase === 'roundEnd') {
      this.showRoundEnd();
    }
  }

  // ----- rendering --------------------------------------------------------

  private render(): void {
    const s = this.state;
    // opponents: face-down fans + scores
    for (const seat of [1, 2, 3]) {
      const host = $(`hand-${SEAT_NAMES[seat]!.toLowerCase()}`);
      host.replaceChildren();
      const n = s.hands[seat]!.length;
      for (let i = 0; i < n; i++) host.appendChild(cardEl(null, false));
      const sc = $opt(`score-${SEAT_NAMES[seat]!.toLowerCase()}`);
      if (sc) sc.textContent = `${SEAT_NAMES[seat]} · ${s.scores[seat]}`;
    }
    const myScore = $opt('score-you');
    if (myScore) myScore.textContent = `You · ${s.scores[0]}`;

    // trick
    const trick = $('hearts-trick');
    trick.replaceChildren();
    for (const tc of s.trick) {
      const el = cardEl(tc.card, true);
      el.classList.add(`trick-${SEAT_NAMES[tc.player]!.toLowerCase()}`);
      trick.appendChild(el);
    }

    // my hand
    const hand = $('hearts-hand');
    hand.replaceChildren();
    const legal = s.phase === 'playing' && s.turn === 0 ? H.legalPlays(s, 0) : null;
    const legalIds = legal ? new Set(legal.map((c) => c.id)) : null;
    for (const card of sortHand(s.hands[0]!)) {
      const el = cardEl(card, true);
      if (s.phase === 'passing') {
        el.classList.add('selectable');
        if (this.selectedPass.has(card.id)) el.classList.add('selected');
      } else if (legalIds) {
        el.classList.toggle('playable', legalIds.has(card.id));
        el.classList.toggle('dim', !legalIds.has(card.id));
      }
      markHandCard(el, card, {
        playable: legalIds ? legalIds.has(card.id) : undefined,
        selected: s.phase === 'passing' && this.selectedPass.has(card.id),
      });
      hand.appendChild(el);
    }
  }

  private setStatus(text: string): void {
    const el = $opt('hearts-status');
    if (el) el.textContent = text;
  }

  private showPassBar(show: boolean): void {
    const bar = $opt('pass-bar');
    if (bar) bar.hidden = !show;
    const btn = $opt('btn-pass') as HTMLButtonElement | null;
    if (btn) btn.disabled = this.selectedPass.size !== 3;
  }

  private showRoundEnd(): void {
    const s = this.state;
    const body = $('round-body');
    body.innerHTML = SEAT_NAMES.map(
      (n, i) =>
        `<dt>${n}</dt><dd>+${s.roundPoints[i]} → ${s.scores[i]}</dd>`,
    ).join('');
    $('round-title').textContent = s.roundPoints.some((p) => p === 0 && s.roundPoints.includes(26))
      ? '🌙 Someone shot the moon!'
      : `Round ${s.round + 1} scored`;
    ($('round-dialog') as HTMLDialogElement).showModal();
  }

  private showGameOver(winner: number): void {
    const s = this.state;
    $('hearts-over-title').textContent =
      winner === 0 ? '🎉 You win!' : `${SEAT_NAMES[winner]} wins`;
    $('hearts-over-body').innerHTML = SEAT_NAMES.map(
      (n, i) => `<dt>${n}${i === winner ? ' 🏆' : ''}</dt><dd>${s.scores[i]}</dd>`,
    ).join('');
    ($('hearts-over-dialog') as HTMLDialogElement).showModal();
  }

  // ----- bindings ---------------------------------------------------------

  private bindToolbar(): void {
    $opt('btn-new')?.addEventListener('click', () => this.newGame());
    $opt('btn-pass')?.addEventListener('click', () => this.confirmPass());
    $opt('btn-round-continue')?.addEventListener('click', () => {
      ($('round-dialog') as HTMLDialogElement).close();
      H.startNextRound(this.state);
      this.selectedPass.clear();
      this.render();
      this.enterPhase();
    });
    $opt('btn-hearts-again')?.addEventListener('click', () => {
      ($('hearts-over-dialog') as HTMLDialogElement).close();
      this.newGame();
    });
    $opt('btn-settings')?.addEventListener('click', () =>
      ($('settings-dialog') as HTMLDialogElement).showModal(),
    );
    for (const el of document.querySelectorAll('[data-close-dialog]')) {
      el.addEventListener('click', () =>
        (el.closest('dialog') as HTMLDialogElement | null)?.close(),
      );
    }
  }

  private bindSettings(): void {
    const theme = $opt('set-theme') as HTMLSelectElement | null;
    const surface = $opt('set-surface') as HTMLSelectElement | null;
    const cardset = $opt('set-cardset') as HTMLSelectElement | null;
    const snd = $opt('set-sounds') as HTMLInputElement | null;
    if (theme) theme.value = this.settings.theme;
    if (surface) surface.value = this.settings.tableSurface;
    const shadow = $opt('set-ink-shadow') as HTMLInputElement | null;
    if (cardset) cardset.value = this.settings.cardSet === 'ink-shadow' ? 'ink' : this.settings.cardSet;
    if (shadow) shadow.checked = this.settings.cardSet === 'ink-shadow';
    if (snd) snd.checked = this.settings.sounds;
    const qbh = $opt('set-queen-breaks') as HTMLInputElement | null;
    if (qbh) qbh.checked = this.queenBreaksHearts();
    // The hand-drawn 'Ink' deck has a shadowed variant; its toggle only shows
    // while that deck is selected.
    const syncShadow = () => {
      const field = shadow?.closest('label');
      if (field) (field as HTMLElement).hidden = (cardset?.value ?? this.settings.cardSet) !== 'ink';
    };
    syncShadow();
    const update = () => {
      const baseSet = cardset?.value ?? this.settings.cardSet;
      const cardSet = baseSet === 'ink' && shadow?.checked ? 'ink-shadow' : baseSet;
      this.settings = {
        ...this.settings,
        theme: (theme?.value ?? this.settings.theme) as Settings['theme'],
        tableSurface: (surface?.value ?? this.settings.tableSurface) as Settings['tableSurface'],
        cardSet: cardSet as Settings['cardSet'],
        sounds: snd ? snd.checked : this.settings.sounds,
        variants: qbh
          ? { ...this.settings.variants, hearts: qbh.checked ? 1 : 0 }
          : this.settings.variants,
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      // A rule change takes effect on the current game and all future deals.
      this.state.queenBreaksHearts = this.queenBreaksHearts();
      this.render();
      syncShadow();
    };
    for (const el of [theme, surface, cardset, snd, shadow, qbh]) el?.addEventListener('change', update);
  }
}

export function startHearts(): void {
  new HeartsController();
}
