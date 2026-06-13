import { type SudokuState, conflicts, isGiven } from './engine';

/**
 * Renders the 9×9 grid as a CSS-grid of buttons inside the shared #board
 * host. Selection, peer/same-digit highlighting, conflicts, and pencil
 * marks are all expressed as classes for the stylesheet.
 */
export class SudokuBoard {
  readonly container: HTMLElement;
  private cells: HTMLButtonElement[] = [];
  private onSelect: (index: number) => void;

  constructor(container: HTMLElement, onSelect: (index: number) => void) {
    this.container = container;
    this.onSelect = onSelect;
    this.mount();
  }

  private mount(): void {
    this.container.classList.add('sudoku-host');
    const grid = document.createElement('div');
    grid.className = 'sudoku-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Sudoku grid');
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'sudoku-cell';
      cell.dataset.index = String(i);
      cell.addEventListener('click', () => this.onSelect(i));
      this.cells.push(cell);
      grid.appendChild(cell);
    }
    this.container.appendChild(grid);
  }

  render(state: SudokuState, selected: number | null): void {
    const bad = conflicts(state);
    const selectedValue = selected !== null ? state.values[selected]! : 0;
    for (let i = 0; i < 81; i++) {
      const cell = this.cells[i]!;
      const v = state.values[i]!;
      const row = Math.floor(i / 9);
      const col = i % 9;
      if (v !== 0) {
        cell.textContent = String(v);
      } else if (state.notes[i]) {
        cell.innerHTML = `<span class="sudoku-notes">${Array.from({ length: 9 }, (_, d) =>
          state.notes[i]! & (1 << d) ? `<i>${d + 1}</i>` : '<i></i>',
        ).join('')}</span>`;
      } else {
        cell.textContent = '';
      }
      cell.classList.toggle('given', isGiven(state, i));
      cell.classList.toggle('conflict', bad.has(i));
      cell.classList.toggle('selected', i === selected);
      cell.classList.toggle(
        'peer',
        selected !== null &&
          i !== selected &&
          (row === Math.floor(selected / 9) ||
            col === selected % 9 ||
            (Math.floor(row / 3) === Math.floor(Math.floor(selected / 9) / 3) &&
              Math.floor(col / 3) === Math.floor((selected % 9) / 3))),
      );
      cell.classList.toggle('same', v !== 0 && v === selectedValue && i !== selected);
      cell.setAttribute(
        'aria-label',
        `Row ${row + 1}, column ${col + 1}${
          v !== 0 ? `, ${isGiven(state, i) ? 'given' : 'entered'} ${v}` : ', empty'
        }`,
      );
    }
  }

  /** Brief celebratory pulse on the solved grid. */
  flashSolved(): void {
    const grid = this.container.querySelector('.sudoku-grid');
    grid?.classList.add('solved');
    window.setTimeout(() => grid?.classList.remove('solved'), 1600);
  }

  focusCell(i: number): void {
    this.cells[i]?.focus();
  }
}
