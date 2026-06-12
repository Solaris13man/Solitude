import type { DrawMode } from './engine/klondike';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type Felt = 'green' | 'blue' | 'slate' | 'crimson';
export type CardBack = 'classic' | 'royal' | 'mint' | 'midnight';

export interface Settings {
  drawMode: DrawMode;
  theme: ThemeMode;
  felt: Felt;
  cardBack: CardBack;
  leftHand: boolean;
  animations: boolean;
}

const KEY = 'solitude.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  drawMode: 1,
  theme: 'auto',
  felt: 'green',
  cardBack: 'classic',
  leftHand: false,
  animations: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
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
  root.classList.toggle('no-animations', !settings.animations);
}

/** True when motion should be suppressed (user setting or OS preference). */
export function reducedMotion(settings: Settings): boolean {
  if (!settings.animations) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
