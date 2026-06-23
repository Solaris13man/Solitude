import { type Settings, applySettings, loadSettings, saveSettings } from '../../lib/settings';
import { SoundPlayer } from '../../lib/sound';
import { recordResult } from '../../lib/stats';
import { cardArt, cardArtById } from '../cards/board';
import { activateOnKey, markHandCard } from '../cards/a11y';
import { RANK_LABELS, SUIT_SYMBOLS, type Card, isRed } from '../cards/deck';
import * as G from './engine';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ended = (s: G.GinState): boolean => s.phase === 'roundEnd' || s.phase === 'gameOver';

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

function meldLabel(m: G.Meld): string {
  return `${m.type === 'set' ? 'Set' : 'Run'}: ${m.cards.map((c) => RANK_LABELS[c.rank] + SUIT_SYMBOLS[c.suit]).join(' ')}`;
}

class GinController {
  private state!: G.GinState;
  private settings: Settings;
  private sound = new SoundPlayer();
  private busy = false;
  private knockMode = false;

  constructor() {
    this.settings = loadSettings();
    applySettings(this.settings);
    this.sound.enabled = this.settings.sounds;
    this.bindToolbar();
    this.bindSettings();
    $('gin-hand').addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('.hcard');
      if (c?.dataset.id) this.onCardClick(c.dataset.id);
    });
    activateOnKey($('gin-hand'), '.hcard', (el) => {
      if (el.dataset.id) this.onCardClick(el.dataset.id);
    });
    $('gin-stock').addEventListener('click', () => this.onDraw('stock'));
    $('gin-discard').addEventListener('click', () => this.onDraw('discard'));
    // #gin-discard is a div[role=button]; Enter/Space don't fire click natively.
    activateOnKey($('gin-discard'), '#gin-discard', () => this.onDraw('discard'));
    $opt('btn-knock')?.addEventListener('click', () => this.toggleKnock());
    this.newGame();
  }

  private newGame(): void {
    this.state = G.newGame((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    this.knockMode = false;
    this.render();
    if (this.state.turn === 1) void this.runAi();
    else this.setStatus('Your turn — draw from the stock or the discard pile.');
  }

  // ----- the human's actions ----------------------------------------------

  private onDraw(source: 'stock' | 'discard'): void {
    const s = this.state;
    if (this.busy || s.phase !== 'draw' || s.turn !== 0) return;
    if (source === 'discard') {
      if (!G.canDrawDiscard(s, 0)) return;
      G.drawDiscard(s, 0);
    } else {
      if (s.stock.length === 0) return;
      G.drawStock(s, 0);
    }
    this.sound.play('flip');
    this.knockMode = false;
    this.render();
    this.setStatus('Discard a card to end your turn — or knock if your deadwood is 10 or less.');
  }

  private onCardClick(id: string): void {
    const s = this.state;
    if (this.busy || s.phase !== 'discard' || s.turn !== 0) return;
    const card = s.hands[0]!.find((c) => c.id === id);
    if (!card) return;
    if (this.knockMode) {
      if (!G.canKnock(s, 0, card)) {
        this.setStatus('Knocking on that card would leave more than 10 deadwood — pick another.');
        return;
      }
      G.knock(s, 0, card);
      this.sound.play('place');
      this.knockMode = false;
      this.render();
      this.onEnd();
      return;
    }
    G.discard(s, 0, card);
    this.sound.play('place');
    this.render();
    if (ended(s)) {
      this.onEnd();
      return;
    }
    void this.runAi();
  }

  private toggleKnock(): void {
    const s = this.state;
    if (s.phase !== 'discard' || s.turn !== 0 || this.busy) return;
    this.knockMode = !this.knockMode;
    this.render();
    this.setStatus(
      this.knockMode
        ? 'Knock mode: tap the card to discard as your knock.'
        : 'Discard a card to end your turn — or knock.',
    );
  }

  // ----- the AI turn ------------------------------------------------------

  private async runAi(): Promise<void> {
    const s = this.state;
    if (s.phase !== 'draw' || s.turn !== 1) return;
    this.busy = true;
    this.setStatus('Opponent is drawing…');
    await delay(620);
    if (G.aiChooseDraw(s, 1) === 'discard') G.drawDiscard(s, 1);
    else G.drawStock(s, 1);
    this.sound.play('flip');
    this.render();
    await delay(640);
    const choice = G.aiChooseDiscard(s, 1);
    if (choice.knock && G.canKnock(s, 1, choice.card)) G.knock(s, 1, choice.card);
    else G.discard(s, 1, choice.card);
    this.sound.play('place');
    this.busy = false;
    this.render();
    if (ended(s)) this.onEnd();
    else this.setStatus('Your turn — draw from the stock or the discard pile.');
  }

  private onEnd(): void {
    const s = this.state;
    const r = s.lastResult;
    if (s.phase === 'gameOver') {
      const winner = G.gameWinner(s);
      if (winner === 0) this.sound.play('win');
      recordResult({
        game: 'gin',
        variant: 0,
        won: winner === 0,
        elapsedMs: 0,
        moves: s.round + 1,
        score: s.scores[0]!,
      });
      $('gin-over-title').textContent = winner === 0 ? '🎉 You win!' : 'Opponent wins';
      $('gin-over-body').innerHTML = `<dt>You</dt><dd>${s.scores[0]}</dd><dt>Opponent</dt><dd>${s.scores[1]}</dd>`;
      ($('gin-over-dialog') as HTMLDialogElement).showModal();
      return;
    }
    // roundEnd
    if (r && r.winner === -1) {
      $('round-title').textContent = 'Stalemate — the deal is dead';
      $('round-body').innerHTML = '<dt>No score</dt><dd>Redealing…</dd>';
    } else if (r) {
      const who = r.winner === 0 ? 'You' : 'Opponent';
      const tag = r.gin ? 'Gin!' : r.undercut ? 'Undercut!' : 'Knock';
      $('round-title').textContent = `${tag} — ${who} +${r.delta}`;
      $('round-body').innerHTML =
        `<dt>${r.knocker === 0 ? 'You' : 'Opponent'} (knocker)</dt><dd>${r.knockerDeadwood} deadwood</dd>` +
        `<dt>${r.knocker === 0 ? 'Opponent' : 'You'}</dt><dd>${r.opponentDeadwood} deadwood${r.laidOff.length ? ` · laid off ${r.laidOff.length}` : ''}</dd>` +
        `<dt class="stats-section">Score</dt><dd class="stats-section"></dd>` +
        `<dt>You</dt><dd>${s.scores[0]}</dd><dt>Opponent</dt><dd>${s.scores[1]}</dd>`;
    }
    ($('round-dialog') as HTMLDialogElement).showModal();
  }

  // ----- rendering --------------------------------------------------------

  private render(): void {
    const s = this.state;
    // opponent backs
    const opp = $('gin-opp');
    opp.replaceChildren();
    for (let i = 0; i < s.hands[1]!.length; i++) opp.appendChild(cardEl(null, false));
    const oppScore = $opt('gin-score-opp');
    if (oppScore) oppScore.textContent = `Opponent · ${s.scores[1]}`;
    const youScore = $opt('gin-score-you');
    if (youScore) youScore.textContent = `You · ${s.scores[0]}`;

    // stock + discard
    const stock = $('gin-stock');
    stock.replaceChildren();
    stock.appendChild(cardEl(null, false));
    stock.classList.toggle('drawable', s.phase === 'draw' && s.turn === 0 && s.stock.length > 0);
    const stockN = $opt('gin-stock-count');
    if (stockN) stockN.textContent = `${s.stock.length}`;
    const disc = $('gin-discard');
    disc.replaceChildren();
    const topCard = s.discard[s.discard.length - 1] ?? null;
    if (topCard) disc.appendChild(cardEl(topCard, true));
    disc.classList.toggle('drawable', G.canDrawDiscard(s, 0));

    // your hand, grouped by best melds
    const hand = $('gin-hand');
    hand.replaceChildren();
    const best = G.bestMelds(s.hands[0]!);
    const groups: Card[][] = [...best.melds.map((m) => m.cards), best.deadwood];
    const canDiscard = s.phase === 'discard' && s.turn === 0;
    let first = true;
    for (const group of groups) {
      if (group.length === 0) continue;
      let groupStart = true;
      for (const card of group) {
        const el = cardEl(card, true);
        if (!first && groupStart) el.classList.add('group-start');
        groupStart = false;
        if (canDiscard) {
          if (this.knockMode) {
            el.classList.toggle('playable', G.canKnock(s, 0, card));
            el.classList.toggle('dim', !G.canKnock(s, 0, card));
          } else {
            el.classList.add('playable');
          }
        }
        markHandCard(el, card, {
          playable: canDiscard ? (this.knockMode ? G.canKnock(s, 0, card) : true) : undefined,
        });
        hand.appendChild(el);
      }
      first = false;
    }

    // deadwood readout + knock button
    const dwEl = $opt('gin-deadwood');
    const knockBtn = $opt('btn-knock') as HTMLButtonElement | null;
    if (s.phase === 'discard' && s.turn === 0) {
      let knockDw = Infinity;
      for (const c of s.hands[0]!) {
        if (G.canKnock(s, 0, c)) {
          const dw = G.deadwoodValue(s.hands[0]!.filter((x) => x.id !== c.id));
          knockDw = Math.min(knockDw, dw);
        }
      }
      const cur = best.deadwoodValue;
      if (dwEl) dwEl.textContent = `Deadwood: ${cur}`;
      if (knockBtn) {
        knockBtn.disabled = !Number.isFinite(knockDw);
        knockBtn.classList.toggle('btn-primary', this.knockMode);
        knockBtn.textContent = this.knockMode ? 'Cancel knock' : 'Knock';
      }
    } else {
      if (dwEl) dwEl.textContent = `Deadwood: ${best.deadwoodValue}`;
      if (knockBtn) {
        knockBtn.disabled = true;
        knockBtn.textContent = 'Knock';
        knockBtn.classList.remove('btn-primary');
      }
    }
  }

  private setStatus(text: string): void {
    const el = $opt('gin-status');
    if (el) el.textContent = text;
  }

  private bindToolbar(): void {
    $opt('btn-new')?.addEventListener('click', () => this.newGame());
    $opt('btn-round-continue')?.addEventListener('click', () => {
      ($('round-dialog') as HTMLDialogElement).close();
      G.startNextRound(this.state);
      this.knockMode = false;
      this.render();
      if (this.state.turn === 1) void this.runAi();
      else this.setStatus('Your turn — draw from the stock or the discard pile.');
    });
    $opt('btn-gin-again')?.addEventListener('click', () => {
      ($('gin-over-dialog') as HTMLDialogElement).close();
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

export { meldLabel };
export function startGin(): void {
  new GinController();
}
