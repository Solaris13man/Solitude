import { type Settings, applySettings, loadSettings, saveSettings } from '../../lib/settings';
import { SoundPlayer } from '../../lib/sound';
import { recordResult } from '../../lib/stats';
import { cardArt, cardArtById } from '../cards/board';
import { activateOnKey, markHandCard } from '../cards/a11y';
import { RANK_LABELS, SUIT_SYMBOLS, type Card, isRed } from '../cards/deck';
import * as S from './engine';

const NAMES = ['You', 'West', 'North', 'East'];
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

const bidText = (b: number) => (b < 0 ? '' : b === 0 ? 'Nil' : String(b));

class SpadesController {
  private state!: S.SpadesState;
  private settings: Settings;
  private sound = new SoundPlayer();
  private busy = false;

  constructor() {
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.bindToolbar();
    this.bindSettings();
    $('spades-hand').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.hcard');
      if (card?.dataset.id) this.onCardClick(card.dataset.id);
    });
    activateOnKey($('spades-hand'), '.hcard', (el) => {
      if (el.dataset.id) this.onCardClick(el.dataset.id);
    });
    $('bid-bar').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-bid]');
      if (btn) this.onPlaceBid(Number(btn.dataset.bid));
    });
    this.newGame();
  }

  private newGame(): void {
    this.state = S.newGame((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    this.render();
    void this.advance();
  }

  private async advance(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    while (true) {
      const s = this.state;
      if (s.phase === 'bidding') {
        if (s.turn === 0) {
          this.busy = false;
          this.showBidBar(true);
          this.setStatus('Your bid — how many tricks will you take?');
          return;
        }
        this.showBidBar(false);
        this.setStatus(`${NAMES[s.turn]} is bidding…`);
        await delay(440);
        S.placeBid(s, s.turn, S.aiBid(s, s.turn));
        this.render();
        continue;
      }
      if (s.phase !== 'playing') {
        this.busy = false;
        this.onEnd();
        return;
      }
      if (s.trick.length === 4) {
        this.render();
        await delay(850);
        S.resolveTrick(s);
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
      this.setStatus(`${NAMES[s.turn]} is thinking…`);
      await delay(500);
      const card = S.aiPlay(s, s.turn);
      S.playCard(s, s.turn, card);
      this.sound.play('flip');
      this.render();
    }
  }

  private onPlaceBid(bid: number): void {
    const s = this.state;
    if (this.busy || s.phase !== 'bidding' || s.turn !== 0) return;
    S.placeBid(s, 0, bid);
    this.showBidBar(false);
    this.sound.play('flip');
    this.render();
    void this.advance();
  }

  private onCardClick(id: string): void {
    const s = this.state;
    if (this.busy || s.phase !== 'playing' || s.turn !== 0) return;
    const card = s.hands[0]!.find((c) => c.id === id);
    if (!card || !S.isLegalPlay(s, 0, card)) {
      this.setStatus("You can't play that card.");
      return;
    }
    S.playCard(s, 0, card);
    this.sound.play('place');
    this.render();
    void this.advance();
  }

  private onEnd(): void {
    const s = this.state;
    if (s.phase === 'gameOver') {
      const winner = S.gameWinner(s);
      const youWon = winner === S.teamOf(0);
      if (youWon) this.sound.play('win');
      recordResult({
        game: 'spades',
        variant: 0,
        won: youWon,
        elapsedMs: 0,
        moves: s.round + 1,
        score: s.scores[S.teamOf(0)]!,
      });
      $('spades-over-title').textContent = youWon ? '🎉 Your team wins!' : 'Opponents win';
      $('spades-over-body').innerHTML =
        `<dt>You &amp; North</dt><dd>${s.scores[0]}</dd>` +
        `<dt>West &amp; East</dt><dd>${s.scores[1]}</dd>`;
      ($('spades-over-dialog') as HTMLDialogElement).showModal();
    } else if (s.phase === 'roundEnd') {
      $('round-title').textContent = `Round ${s.round + 1} scored`;
      $('round-body').innerHTML =
        `<dt>You &amp; North</dt><dd>${s.roundScore[0]! >= 0 ? '+' : ''}${s.roundScore[0]} → ${s.scores[0]} (${s.bags[0]} bags)</dd>` +
        `<dt>West &amp; East</dt><dd>${s.roundScore[1]! >= 0 ? '+' : ''}${s.roundScore[1]} → ${s.scores[1]} (${s.bags[1]} bags)</dd>`;
      ($('round-dialog') as HTMLDialogElement).showModal();
    }
  }

  private render(): void {
    const s = this.state;
    for (const seat of [1, 2, 3]) {
      const host = $(`hand-${NAMES[seat]!.toLowerCase()}`);
      host.replaceChildren();
      for (let i = 0; i < s.hands[seat]!.length; i++) host.appendChild(cardEl(null, false));
      const chip = $opt(`chip-${NAMES[seat]!.toLowerCase()}`);
      if (chip) chip.textContent = this.seatLabel(seat);
    }
    const youChip = $opt('chip-you');
    if (youChip) youChip.textContent = this.seatLabel(0);

    const board = $opt('spades-scoreboard');
    if (board) {
      board.innerHTML =
        `<span>You &amp; North · <b>${s.scores[0]}</b> · ${s.bags[0]} bags</span>` +
        `<span>West &amp; East · <b>${s.scores[1]}</b> · ${s.bags[1]} bags</span>`;
    }

    const trick = $('spades-trick');
    trick.replaceChildren();
    for (const tc of s.trick) {
      const el = cardEl(tc.card, true);
      el.classList.add(`trick-${NAMES[tc.player]!.toLowerCase()}`);
      trick.appendChild(el);
    }

    const hand = $('spades-hand');
    hand.replaceChildren();
    const legal = s.phase === 'playing' && s.turn === 0 ? S.legalPlays(s, 0) : null;
    const legalIds = legal ? new Set(legal.map((c) => c.id)) : null;
    for (const card of sortHand(s.hands[0]!)) {
      const el = cardEl(card, true);
      if (legalIds) {
        el.classList.toggle('playable', legalIds.has(card.id));
        el.classList.toggle('dim', !legalIds.has(card.id));
      }
      markHandCard(el, card, { playable: legalIds ? legalIds.has(card.id) : undefined });
      hand.appendChild(el);
    }
  }

  private seatLabel(seat: number): string {
    const s = this.state;
    const name = NAMES[seat];
    if (s.phase === 'bidding') {
      return s.bids[seat]! < 0 ? `${name}` : `${name} · bid ${bidText(s.bids[seat]!)}`;
    }
    return `${name} · ${s.trickCount[seat]}/${bidText(s.bids[seat]!)}`;
  }

  private setStatus(text: string): void {
    const el = $opt('spades-status');
    if (el) el.textContent = text;
  }

  private showBidBar(show: boolean): void {
    const bar = $opt('bid-bar');
    if (bar) bar.hidden = !show;
  }

  private bindToolbar(): void {
    $opt('btn-new')?.addEventListener('click', () => this.newGame());
    $opt('btn-round-continue')?.addEventListener('click', () => {
      ($('round-dialog') as HTMLDialogElement).close();
      S.startNextRound(this.state);
      this.render();
      void this.advance();
    });
    $opt('btn-spades-again')?.addEventListener('click', () => {
      ($('spades-over-dialog') as HTMLDialogElement).close();
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
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      this.render();
      syncShadow();
    };
    for (const el of [theme, surface, cardset, snd, shadow]) el?.addEventListener('change', update);
  }
}

export function startSpades(): void {
  new SpadesController();
}
