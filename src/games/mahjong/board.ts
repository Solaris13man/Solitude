import { TURTLE, type MahjongState, isFree } from './engine';

/** Visual faces for each tile kind: corner label + main glyph + color. */
function face(kind: string): { corner: string; glyph: string; cls: string } {
  const n = kind.slice(1);
  switch (kind[0]) {
    case 'd': return { corner: n, glyph: '●', cls: 'tile-dot' };
    case 'b': return { corner: n, glyph: '❚', cls: 'tile-bamboo' };
    case 'c': return { corner: n, glyph: '万', cls: 'tile-char' };
    case 'w': {
      const winds: Record<string, string> = { E: '東', S: '南', W: '西', N: '北' };
      return { corner: n, glyph: winds[n] ?? '東', cls: 'tile-wind' };
    }
    case 'g': {
      const dragons: Record<string, [string, string]> = {
        R: ['中', 'tile-char'],
        G: ['發', 'tile-bamboo'],
        W: ['□', 'tile-dot'],
      };
      const d = dragons[n] ?? dragons['R']!;
      return { corner: '', glyph: d[0], cls: d[1] };
    }
    case 'f': return { corner: n, glyph: '✿', cls: 'tile-flower' };
    case 's': {
      const seasons = ['春', '夏', '秋', '冬'];
      return { corner: n, glyph: seasons[Number(n) - 1] ?? '春', cls: 'tile-season' };
    }
    default: return { corner: '', glyph: '?', cls: 'tile-dot' };
  }
}

/** Renders the layered tile formation; tap-only. */
export class MahjongBoard {
  readonly container: HTMLElement;
  private onTap: (index: number) => void;
  private tileEls: HTMLElement[] = [];
  private tileW = 44;
  private tileH = 58;

  constructor(container: HTMLElement, onTap: (index: number) => void) {
    this.container = container;
    this.onTap = onTap;
    container.classList.add('mahjong-host');
    window.addEventListener('resize', () => this.computeMetrics());
  }

  /** (Re)build tile elements for a new deal. */
  mount(state: MahjongState): void {
    for (const el of this.tileEls) el.remove();
    this.tileEls = [];
    state.tiles.forEach((tile, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      const f = face(tile.kind);
      el.className = `tile ${f.cls}`;
      el.innerHTML = `
        <span class="tile-corner">${f.corner}</span>
        <span class="tile-glyph">${f.glyph}</span>`;
      el.addEventListener('click', () => this.onTap(i));
      this.container.appendChild(el);
      this.tileEls.push(el);
    });
    this.computeMetrics();
  }

  computeMetrics(): void {
    const availW = this.container.clientWidth || 700;
    // formation spans 30 half-tiles wide (x 0..28 + tile width)
    this.tileW = Math.min(Math.floor(availW / 15.6), 64);
    this.tileH = Math.round(this.tileW * 1.32);
    const lift = Math.max(3, Math.round(this.tileW * 0.09));
    const boardH = 8 * this.tileH + lift * 5 + 8;
    this.container.style.height = `${boardH}px`;
    this.container.style.setProperty('--tile-w', `${this.tileW}px`);
    this.container.style.setProperty('--tile-h', `${this.tileH}px`);
    this.layout();
  }

  private layout(): void {
    const availW = this.container.clientWidth || 700;
    const lift = Math.max(3, Math.round(this.tileW * 0.09));
    const ox = Math.max(0, (availW - 15 * this.tileW) / 2);
    TURTLE.forEach((slot, i) => {
      const el = this.tileEls[i];
      if (!el) return;
      const x = ox + (slot.x / 2) * this.tileW + slot.z * lift;
      const y = (slot.y / 2) * this.tileH - slot.z * lift + lift * 4 + 4;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      el.style.zIndex = String(slot.z * 1000 + slot.y * 30 + slot.x);
    });
  }

  render(state: MahjongState, selected: number | null): void {
    if (this.tileEls.length === 0) this.mount(state);
    state.tiles.forEach((tile, i) => {
      const el = this.tileEls[i]!;
      if (tile.removed) {
        el.classList.add('tile-removed');
        el.tabIndex = -1;
        return;
      }
      el.classList.remove('tile-removed');
      const free = isFree(state, i);
      el.classList.toggle('tile-free', free);
      el.classList.toggle('tile-selected', i === selected);
      el.tabIndex = free ? 0 : -1;
      el.setAttribute('aria-label', `${describeKind(tile.kind)}${free ? '' : ', blocked'}`);
    });
  }

  highlight(pair: [number, number]): void {
    for (const i of pair) {
      const el = this.tileEls[i];
      if (!el) continue;
      el.classList.remove('hint');
      void el.offsetWidth;
      el.classList.add('hint');
      window.setTimeout(() => el.classList.remove('hint'), 1600);
    }
  }

  shake(index: number): void {
    const el = this.tileEls[index];
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    window.setTimeout(() => el.classList.remove('shake'), 350);
  }
}

function describeKind(kind: string): string {
  const n = kind.slice(1);
  switch (kind[0]) {
    case 'd': return `${n} of dots`;
    case 'b': return `${n} of bamboo`;
    case 'c': return `${n} of characters`;
    case 'w': return `${{ E: 'east', S: 'south', W: 'west', N: 'north' }[n] ?? ''} wind`;
    case 'g': return `${{ R: 'red', G: 'green', W: 'white' }[n] ?? ''} dragon`;
    case 'f': return `flower ${n}`;
    case 's': return `season ${n}`;
    default: return 'tile';
  }
}
