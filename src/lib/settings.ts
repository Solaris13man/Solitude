export type ThemeMode = 'auto' | 'light' | 'dark';
export type Felt = 'green' | 'blue' | 'slate' | 'crimson';
export type CardBack = 'classic' | 'royal' | 'mint' | 'midnight';
export type TileSet = 'china' | 'japan' | 'korea' | 'india' | 'medieval';

export interface Settings {
  theme: ThemeMode;
  felt: Felt;
  cardBack: CardBack;
  /** Mahjong tile artwork set. */
  tileSet: TileSet;
  leftHand: boolean;
  animations: boolean;
  sounds: boolean;
  /** Per-game variant choice (Klondike draw count, Spider suit count, …). */
  variants: Record<string, number>;
}

const KEY = 'solitude.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  felt: 'green',
  cardBack: 'classic',
  tileSet: 'china',
  leftHand: false,
  animations: true,
  sounds: true,
  variants: {},
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, variants: {} };
    const parsed = JSON.parse(raw) as Partial<Settings> & { drawMode?: number };
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      variants: { ...(parsed.variants ?? {}) },
    };
    // Migrate the pre-suite Klondike draw-mode field.
    if (parsed.drawMode !== undefined && settings.variants['klondike'] === undefined) {
      settings.variants['klondike'] = parsed.drawMode;
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS, variants: {} };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable; settings just won't persist.
  }
}

/** Reflect settings onto the document so CSS custom properties pick them up. */
export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.felt = settings.felt;
  root.dataset.cardback = settings.cardBack;
  root.dataset.tileset = settings.tileSet;
  root.classList.toggle('no-animations', !settings.animations);
}

/** True when motion should be suppressed (user setting or OS preference). */
export function reducedMotion(settings: Settings): boolean {
  if (!settings.animations) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
