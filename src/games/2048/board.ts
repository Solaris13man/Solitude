import { type Direction, type G2048State, type MoveEvents, type Tile } from './engine';

/** 4×4 board with persistent tile elements; slides/merges/spawns animate. */
export class G2048Board {
  readonly container: HTMLElement;
  private tileEls = new Map<number, HTMLElement>();
  private gridEl!: HTMLElement;
  private onSwipe: (dir: Direction) => void;

  constructor(container: HTMLElement, onSwipe: (dir: Direction) => void) {
    this.container = container;
    this.onSwipe = onSwipe;
    container.classList.add('g2048-host');
    this.mountGrid();
    this.bindSwipe();
  }

  private mountGrid(): void {
    const grid = document.createElement('div');
    grid.className = 'g2048-grid';
    grid.setAttribute('aria-label', '2048 board');
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div');
      cell.className = 'g2048-cell';
      grid.appendChild(cell);
    }
    this.container.appendChild(grid);
    this.gridEl = grid;
  }

  private bindSwipe(): void {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    this.container.addEventListener('pointerdown', (e) => {
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
    });
    this.container.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) this.onSwipe(dx > 0 ? 'right' : 'left');
      else this.onSwipe(dy > 0 ? 'down' : 'up');
    });
  }

  private place(el: HTMLElement, r: number, c: number): void {
    el.style.transform = `translate(calc(${c} * (100% + var(--g2048-gap))), calc(${r} * (100% + var(--g2048-gap))))`;
  }

  private tileClass(value: number): string {
    return `g2048-tile g2048-v${value <= 2048 ? value : 'super'}`;
  }

  private makeTileEl(tile: Tile): HTMLElement {
    const el = document.createElement('div');
    el.className = this.tileClass(tile.value);
    el.textContent = String(tile.value);
    this.place(el, tile.r, tile.c);
    this.gridEl.appendChild(el);
    this.tileEls.set(tile.id, el);
    return el;
  }

  /** Full re-sync (deal/resume/undo): rebuild elements without animation. */
  render(state: G2048State): void {
    for (const el of this.tileEls.values()) el.remove();
    this.tileEls.clear();
    for (const tile of state.tiles) this.makeTileEl(tile);
  }

  /** Animate one move's events: slide, then merge-pop and spawn. */
  applyMove(state: G2048State, events: MoveEvents): void {
    // slide survivors and consumed tiles to their final cells
    for (const tile of state.tiles) {
      const el = this.tileEls.get(tile.id);
      if (el) this.place(el, tile.r, tile.c);
    }
    for (const gone of events.removedTiles) {
      const el = this.tileEls.get(gone.id);
      if (el) this.place(el, gone.r, gone.c);
    }
    window.setTimeout(() => {
      for (const gone of events.removedTiles) {
        this.tileEls.get(gone.id)?.remove();
        this.tileEls.delete(gone.id);
      }
      // update merged values with a pop
      for (const tile of state.tiles) {
        const el = this.tileEls.get(tile.id);
        if (el && el.textContent !== String(tile.value)) {
          el.className = `${this.tileClass(tile.value)} g2048-pop`;
          el.textContent = String(tile.value);
        }
      }
      if (events.spawned) {
        const el = this.makeTileEl(events.spawned);
        el.classList.add('g2048-spawn');
      }
    }, 110);
  }
}
