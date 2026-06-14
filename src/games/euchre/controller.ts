import { type Settings, applySettings, loadSettings, saveSettings } from '../../lib/settings';
import { SoundPlayer } from '../../lib/sound';
import { recordResult } from '../../lib/stats';
import { cardArt, cardArtById } from '../cards/board';
import { RANK_LABELS, SUIT_SYMBOLS, SUIT_NAMES, SUITS, type Card, type Suit, isRed } from '../cards/deck';
import * as E from './engine';

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

const suitGlyph = (suit: Suit) =>
  `<span class="${isRed(suit) ? 'suit-red' : ''}">${SUIT_SYMBOLS[suit]}</span>`;

class EuchreController {
  private state!: E.EuchreState;
  private settings: Settings;
  private sound = new SoundPlayer();
  private busy = false;
  private discarding = false;

  constructor() {
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.bindToolbar();
    this.bindSettings();
    $('euchre-hand').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.hcard');
      if (card?.dataset.id) this.onCardClick(card.dataset.id);
    });
    $('euchre-bid').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (btn) this.onBidAction(btn);
    });
    this.newGame();
  }

  private newGame(): void {
    this.state = E.newGame((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    this.discarding = false;
    this.render();
    void this.advance();
  }

  private async advance(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    while (true) {
      const s = this.state;

      if (s.phase === 'bid1') {
        if (s.turn === 0) {
          this.busy = false;
          this.render();
          this.showBidPanel();
          this.setStatus(`Order up the ${SUIT_NAMES[s.upCard.suit]}?`);
          return;
        }
        this.hideBidPanel();
        this.setStatus(`${NAMES[s.turn]} is bidding…`);
        await delay(460);
        const d = E.aiBidRound1(s, s.turn);
        if (d.order) E.orderUp(s, s.turn, d.alone);
        else E.passBid(s, s.turn);
        this.render();
        continue;
      }

      if (s.phase === 'bid2') {
        if (s.turn === 0) {
          this.busy = false;
          this.render();
          this.showBidPanel();
          this.setStatus(
            s.turn === s.dealer ? 'You must name a trump suit.' : 'Name a trump suit, or pass.',
          );
          return;
        }
        this.hideBidPanel();
        this.setStatus(`${NAMES[s.turn]} is bidding…`);
        await delay(460);
        const d = E.aiBidRound2(s, s.turn);
        if (d) E.nameTrump(s, s.turn, d.suit, d.alone);
        else E.passBid(s, s.turn);
        this.render();
        continue;
      }

      if (s.phase === 'discard') {
        this.hideBidPanel();
        if (s.dealer === 0) {
          this.busy = false;
          this.discarding = true;
          this.render();
          this.setStatus('You picked it up — choose a card to discard.');
          return;
        }
        this.setStatus(`${NAMES[s.dealer]} picks it up…`);
        await delay(560);
        E.dealerDiscard(s, E.aiDiscard(s));
        this.sound.play('flip');
        this.render();
        continue;
      }

      if (s.phase !== 'playing') {
        this.busy = false;
        this.onEnd();
        return;
      }

      const trickFull = s.trick.length === (s.alone ? 3 : 4);
      if (trickFull) {
        this.render();
        await delay(850);
        E.resolveTrick(s);
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
      await delay(520);
      const card = E.aiPlay(s, s.turn);
      E.playCard(s, s.turn, card);
      this.sound.play('flip');
      this.render();
    }
  }

  private onBidAction(btn: HTMLElement): void {
    const s = this.state;
    if (this.busy || s.turn !== 0) return;
    const act = btn.dataset.act;
    const aloneChk = $opt('bid-alone-chk') as HTMLInputElement | null;
    const alone = !!aloneChk?.checked;
    if (act === 'order' && s.phase === 'bid1') {
      E.orderUp(s, 0, alone);
    } else if (act === 'name' && s.phase === 'bid2') {
      E.nameTrump(s, 0, btn.dataset.suit as Suit, alone);
    } else if (act === 'pass') {
      E.passBid(s, 0);
    } else {
      return;
    }
    this.hideBidPanel();
    this.sound.play('flip');
    this.render();
    void this.advance();
  }

  private onCardClick(id: string): void {
    const s = this.state;
    if (this.busy) return;

    if (this.discarding && s.phase === 'discard' && s.dealer === 0) {
      const card = s.hands[0]!.find((c) => c.id === id);
      if (!card) return;
      E.dealerDiscard(s, card);
      this.discarding = false;
      this.sound.play('place');
      this.render();
      void this.advance();
      return;
    }

    if (s.phase !== 'playing' || s.turn !== 0) return;
    const card = s.hands[0]!.find((c) => c.id === id);
    if (!card || !E.isLegalPlay(s, 0, card)) {
      this.setStatus('You must follow suit.');
      return;
    }
    E.playCard(s, 0, card);
    this.sound.play('place');
    this.render();
    void this.advance();
  }

  private onEnd(): void {
    const s = this.state;
    const youTeam = E.teamOf(0);
    if (s.phase === 'gameOver') {
      const winner = E.gameWinner(s);
      const youWon = winner === youTeam;
      if (youWon) this.sound.play('win');
      recordResult({
        game: 'euchre',
        variant: 0,
        won: youWon,
        elapsedMs: 0,
        moves: s.round + 1,
        score: s.scores[youTeam]!,
      });
      $('euchre-over-title').textContent = youWon ? '🎉 Your team wins!' : 'Opponents win';
      $('euchre-over-body').innerHTML =
        `<dt>You &amp; North</dt><dd>${s.scores[0]}</dd>` +
        `<dt>West &amp; East</dt><dd>${s.scores[1]}</dd>`;
      ($('euchre-over-dialog') as HTMLDialogElement).showModal();
    } else if (s.phase === 'roundEnd') {
      const r = s.roundResult;
      $('round-title').textContent = r
        ? r.euchred
          ? 'Euchred!'
          : r.march
            ? r.alone
              ? 'A lone march!'
              : 'Marched — all five!'
            : 'Round scored'
        : 'Round scored';
      const makerNames = r && r.makerTeam === 0 ? 'You &amp; North' : 'West &amp; East';
      $('round-body').innerHTML =
        (r
          ? `<dt>Makers</dt><dd>${makerNames} took ${r.makerTricks}</dd>` +
            `<dt>Points</dt><dd>+${r.points} to ${r.awardedTeam === 0 ? 'You &amp; North' : 'West &amp; East'}</dd>`
          : '') +
        `<dt>You &amp; North</dt><dd>${s.scores[0]}</dd>` +
        `<dt>West &amp; East</dt><dd>${s.scores[1]}</dd>`;
      ($('round-dialog') as HTMLDialogElement).showModal();
    }
  }

  private render(): void {
    const s = this.state;

    // Opponent + partner hands (face-down backs).
    for (const seat of [1, 2, 3]) {
      const host = $(`hand-${NAMES[seat]!.toLowerCase()}`);
      host.replaceChildren();
      const sittingOut = s.sittingOut === seat;
      host.classList.toggle('sitting-out', sittingOut);
      for (let i = 0; i < s.hands[seat]!.length; i++) host.appendChild(cardEl(null, false));
      const chip = $opt(`chip-${NAMES[seat]!.toLowerCase()}`);
      if (chip) chip.innerHTML = this.seatLabel(seat);
    }
    const youChip = $opt('chip-you');
    if (youChip) youChip.innerHTML = this.seatLabel(0);

    // Scoreboard with trump indicator.
    const board = $opt('euchre-scoreboard');
    if (board) {
      const trumpStr = s.trump
        ? `Trump ${suitGlyph(s.trump)}`
        : s.phase === 'bid1' || s.phase === 'bid2'
          ? 'Bidding'
          : '';
      board.innerHTML =
        `<span>You &amp; North · <b>${s.scores[0]}</b></span>` +
        (trumpStr ? `<span class="euchre-trump">${trumpStr}</span>` : '') +
        `<span>West &amp; East · <b>${s.scores[1]}</b></span>`;
    }

    // Up-card: face up during round 1, turned down during round 2.
    const up = $opt('euchre-up');
    if (up) {
      up.replaceChildren();
      if (s.phase === 'bid1' && s.upCardVisible) {
        up.appendChild(cardEl(s.upCard, true));
        const lab = document.createElement('span');
        lab.className = 'euchre-up-label';
        lab.textContent = 'Up-card';
        up.appendChild(lab);
        up.hidden = false;
      } else if (s.phase === 'bid2') {
        up.appendChild(cardEl(null, false));
        const lab = document.createElement('span');
        lab.className = 'euchre-up-label';
        lab.textContent = 'Turned down';
        up.appendChild(lab);
        up.hidden = false;
      } else {
        up.hidden = true;
      }
    }

    // Current trick.
    const trick = $('euchre-trick');
    trick.replaceChildren();
    for (const tc of s.trick) {
      const el = cardEl(tc.card, true);
      el.classList.add(`trick-${NAMES[tc.player]!.toLowerCase()}`);
      trick.appendChild(el);
    }

    // Your hand.
    const hand = $('euchre-hand');
    hand.replaceChildren();
    const playable = s.phase === 'playing' && s.turn === 0 && !this.discarding;
    const legalIds = playable ? new Set(E.legalPlays(s, 0).map((c) => c.id)) : null;
    for (const card of sortHand(s.hands[0]!)) {
      const el = cardEl(card, true);
      if (this.discarding) {
        el.classList.add('selectable');
      } else if (legalIds) {
        el.classList.toggle('playable', legalIds.has(card.id));
        el.classList.toggle('dim', !legalIds.has(card.id));
      }
      hand.appendChild(el);
    }
  }

  private seatLabel(seat: number): string {
    const s = this.state;
    const name = NAMES[seat];
    const parts: string[] = [name!];
    if (seat === s.dealer) parts.push('<span class="seat-badge">D</span>');
    if (s.maker === seat) parts.push(`<span class="seat-badge maker">${s.alone ? 'alone' : 'maker'}</span>`);
    if (s.sittingOut === seat) parts.push('<span class="seat-badge">sitting out</span>');
    let label = parts.join(' ');
    if (s.phase === 'playing' || s.phase === 'roundEnd') {
      label += ` · ${s.trickCount[seat]}`;
    }
    return label;
  }

  private showBidPanel(): void {
    const s = this.state;
    const panel = $('euchre-bid');
    const aloneToggle =
      '<label class="bid-alone"><input type="checkbox" id="bid-alone-chk"> Go alone</label>';
    if (s.phase === 'bid1') {
      panel.innerHTML =
        aloneToggle +
        `<button class="bid-btn" type="button" data-act="order">Order up ${suitGlyph(s.upCard.suit)}</button>` +
        '<button class="bid-btn" type="button" data-act="pass">Pass</button>';
    } else {
      const candidates = SUITS.filter((su) => su !== s.upCard.suit);
      const suitBtns = candidates
        .map(
          (su) =>
            `<button class="bid-btn suit-btn${isRed(su) ? ' red' : ''}" type="button" data-act="name" data-suit="${su}">${SUIT_SYMBOLS[su]}</button>`,
        )
        .join('');
      const pass =
        s.turn === s.dealer ? '' : '<button class="bid-btn" type="button" data-act="pass">Pass</button>';
      panel.innerHTML = aloneToggle + suitBtns + pass;
    }
    panel.hidden = false;
  }

  private hideBidPanel(): void {
    const panel = $opt('euchre-bid');
    if (panel) {
      panel.hidden = true;
      panel.replaceChildren();
    }
  }

  private setStatus(text: string): void {
    const el = $opt('euchre-status');
    if (el) el.textContent = text;
  }

  private bindToolbar(): void {
    $opt('btn-new')?.addEventListener('click', () => this.newGame());
    $opt('btn-round-continue')?.addEventListener('click', () => {
      ($('round-dialog') as HTMLDialogElement).close();
      E.startNextRound(this.state);
      this.render();
      void this.advance();
    });
    $opt('btn-euchre-again')?.addEventListener('click', () => {
      ($('euchre-over-dialog') as HTMLDialogElement).close();
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
    if (cardset) cardset.value = this.settings.cardSet;
    if (snd) snd.checked = this.settings.sounds;
    const update = () => {
      this.settings = {
        ...this.settings,
        theme: (theme?.value ?? this.settings.theme) as Settings['theme'],
        tableSurface: (surface?.value ?? this.settings.tableSurface) as Settings['tableSurface'],
        cardSet: (cardset?.value ?? this.settings.cardSet) as Settings['cardSet'],
        sounds: snd ? snd.checked : this.settings.sounds,
      };
      saveSettings(this.settings);
      applySettings(this.settings);
      this.sound.enabled = this.settings.sounds;
      this.render();
    };
    for (const el of [theme, surface, cardset, snd]) el?.addEventListener('change', update);
  }
}

export function startEuchre(): void {
  new EuchreController();
}
