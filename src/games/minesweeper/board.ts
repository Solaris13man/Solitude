import { type MinesweeperState } from './engine';

const NUMBER_CLASSES = ['', 'ms-1', 'ms-2', 'ms-3', 'ms-4', 'ms-5', 'ms-6', 'ms-7', 'ms-8'];

const FLAG_SVG =
  '<svg class="ms-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<ellipse cx="9" cy="20" rx="5.6" ry="1.5" fill="#2c2f3a"/>' +
  '<rect x="8.1" y="3.6" width="1.8" height="15" rx="0.9" fill="#2c2f3a"/>' +
  '<path d="M9 4.2 19 8 9 11.8Z" fill="#c2273a"/></svg>';

const MINE_SVG =
  '<svg class="ms-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<g stroke="#1d2230" stroke-width="2.2" stroke-linecap="round">' +
  '<line x1="12" y1="3.5" x2="12" y2="20.5"/><line x1="3.5" y1="12" x2="20.5" y2="12"/>' +
  '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></g>' +
  '<circle cx="12" cy="12" r="5.6" fill="#1d2230"/>' +
  '<circle cx="10" cy="10" r="1.5" fill="#fff" opacity="0.65"/></svg>';

export interface MinesweeperTaps {
  onReveal(index: number): void;
  onFlag(index: number): void;
  onChord(index: number): void;
}

/** Grid renderer with tap/right-click/long-press input. */
export class MinesweeperBoard {
  readonly container: HTMLElement;
  private taps: MinesweeperTaps;
  private cells: HTMLButtonElement[] = [];
  private grid: HTMLElement | null = null;
  private pressTimer = 0;
  private longPressed = false;

  constructor(container: HTMLElement, taps: MinesweeperTaps) {
    this.container = container;
    this.taps = taps;
    container.classList.add('minesweeper-host');
  }

  mount(state: MinesweeperState): void {
    this.grid?.remove();
    this.cells = [];
    const grid = document.createElement('div');
    grid.className = 'ms-grid';
    grid.style.setProperty('--ms-cols', String(state.width));
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Minesweeper board');
    for (let i = 0; i < state.width * state.height; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'ms-cell';
      cell.addEventListener('click', () => {
        if (this.longPressed) {
          this.longPressed = false;
          return;
        }
        if (cell.classList.contains('ms-open')) this.taps.onChord(i);
        else this.taps.onReveal(i);
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.taps.onFlag(i);
      });
      // long-press flags on touch devices
      cell.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        this.longPressed = false;
        this.pressTimer = window.setTimeout(() => {
          this.longPressed = true;
          this.taps.onFlag(i);
        }, 450);
      });
      const cancel = () => window.clearTimeout(this.pressTimer);
      cell.addEventListener('pointerup', cancel);
      cell.addEventListener('pointercancel', cancel);
      cell.addEventListener('pointerleave', cancel);
      // A scroll/drag must not trip the long-press flag.
      cell.addEventListener('pointermove', cancel);
      grid.appendChild(cell);
      this.cells.push(cell);
    }
    this.container.appendChild(grid);
    this.grid = grid;
  }

  render(state: MinesweeperState): void {
    state.revealed.forEach((open, i) => {
      const cell = this.cells[i]!;
      const flagged = state.flagged[i]!;
      cell.classList.toggle('ms-open', open);
      cell.classList.toggle('ms-flag', flagged && !open);
      const row = Math.floor(i / state.width) + 1;
      const col = (i % state.width) + 1;
      if (open && state.mine[i]) {
        cell.innerHTML = MINE_SVG;
        cell.className = 'ms-cell ms-open ms-mine';
        cell.setAttribute('aria-label', `Row ${row} column ${col}, mine`);
      } else if (open) {
        const n = state.adjacent[i]!;
        cell.textContent = n > 0 ? String(n) : '';
        cell.className = `ms-cell ms-open ${n > 0 ? NUMBER_CLASSES[n] : ''}`.trim();
        cell.setAttribute('aria-label', `Row ${row} column ${col}, ${n} adjacent mines`);
      } else {
        cell.innerHTML = flagged ? FLAG_SVG : '';
        cell.setAttribute(
          'aria-label',
          `Row ${row} column ${col}, ${flagged ? 'flagged' : 'hidden'}`,
        );
      }
    });
  }
}
