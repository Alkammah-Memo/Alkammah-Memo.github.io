/** Look of the app. "classic" is the original flat style; "glass" re-skins everything with the iOS glass theme (see glass.css). */
export type ThemeId = 'classic' | 'glass';
export type Wallpaper = 'aurora' | 'sunset' | 'ocean' | 'graphite' | 'dark';

export interface ThemeState {
  theme: ThemeId;
  wallpaper: Wallpaper;
}

const KEY = 'alkammah_theme_v1';
const DEFAULT: ThemeState = { theme: 'classic', wallpaper: 'aurora' };
let state: ThemeState | null = null;
const listeners = new Set<() => void>();

function load(): ThemeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ThemeState>;
      return {
        theme: p.theme === 'glass' ? 'glass' : 'classic',
        wallpaper: (['aurora', 'sunset', 'ocean', 'graphite', 'dark'] as const).includes(p.wallpaper as Wallpaper) ? (p.wallpaper as Wallpaper) : 'aurora',
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

export function getTheme(): ThemeState {
  if (!state) state = load();
  return state;
}

export function applyTheme(): void {
  const s = getTheme();
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.wallpaper = s.wallpaper;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', s.theme === 'glass' ? (s.wallpaper === 'dark' ? '#0b0d14' : '#dfe9ff') : '#11161F');
}

export function setTheme(patch: Partial<ThemeState>): void {
  state = { ...getTheme(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function subscribeTheme(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
