export type ThemeMode = 'auto' | 'light' | 'dark';
export type Felt = 'green' | 'blue' | 'slate' | 'crimson';
export type CardBack = 'classic' | 'royal' | 'mint' | 'midnight';
export type TileSet = 'china' | 'japan' | 'korea' | 'india' | 'medieval';
/** Card face+back artwork: 'classic' = the built-in drawn deck. */
export type CardSet =
  | 'classic'
  | 'new-blue'
  | 'new-red'
  | 'vintage-blue'
  | 'vintage-red'
  | 'ink'
  | 'ink-shadow';
/** The table surface behind every game. 'felt' uses the felt-colour gradient. */
export type TableSurface = 'felt' | 'wood-walnut' | 'wood-oak' | 'marble' | 'granite';

export interface Settings {
  theme: ThemeMode;
  felt: Felt;
  /** Table surface texture. */
  tableSurface: TableSurface;
  cardBack: CardBack;
  /** Playing-card artwork set. */
  cardSet: CardSet;
  /** Mahjong tile artwork set. */
  tileSet: TileSet;
  leftHand: boolean;
  animations: boolean;
  sounds: boolean;
  /** Per-game variant choice (Klondike draw count, Spider suit count, …). */
  variants: Record<string, number>;
  /** Preferred local hour (0–23) for the daily-reminder push. */
  reminderHour: number;
}

const KEY = 'solitude.settings.v1';
const TS_KEY = 'solitude.settings.v1.ts';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  felt: 'green',
  tableSurface: 'felt',
  cardBack: 'classic',
  cardSet: 'new-blue',
  tileSet: 'china',
  leftHand: false,
  animations: true,
  sounds: true,
  variants: {},
  reminderHour: 19,
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

function writeSettings(settings: Settings, updatedAt: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    localStorage.setItem(TS_KEY, String(updatedAt));
  } catch {
    // Storage unavailable; settings just won't persist.
  }
}

/** Persist a user-made settings change and let listeners (e.g. cloud sync) react. */
export function saveSettings(settings: Settings, updatedAt: number = Date.now()): void {
  writeSettings(settings, updatedAt);
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('cardhearth:settings'));
    } catch {
      /* ignore */
    }
  }
}

/** When this device's settings last changed (epoch ms); 0 if never. */
export function loadSettingsUpdatedAt(): number {
  try {
    return Number(localStorage.getItem(TS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Apply settings that arrived from the cloud: persist them (preserving the
 * remote change-time) and reflect them on the document, WITHOUT emitting the
 * change event — so syncing down never bounces a redundant push back up.
 */
export function applyRemoteSettings(settings: Settings, updatedAt: number): void {
  writeSettings(settings, updatedAt);
  applySettings(settings);
}

/** Reflect settings onto the document so CSS custom properties pick them up. */
export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.felt = settings.felt;
  root.dataset.surface = settings.tableSurface;
  root.dataset.cardback = settings.cardBack;
  root.dataset.cardset = settings.cardSet;
  root.dataset.tileset = settings.tileSet;
  root.classList.toggle('no-animations', !settings.animations);
}

/** True when motion should be suppressed (user setting or OS preference). */
export function reducedMotion(settings: Settings): boolean {
  if (!settings.animations) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
