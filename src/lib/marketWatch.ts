import { useSyncExternalStore } from 'react';
import { getEgx30, getGold, getRates } from './market';

/** The CEO's watchlist (currencies and stocks) and price alerts. Kept on the device. */
export interface WatchItem {
  kind: 'pair' | 'stock';
  id: string;
  label: string;
}
export type Metric = 'USDEGP' | 'GOLD21' | 'GOLD24' | 'EGX30';
export interface Alert {
  id: string;
  metric: Metric;
  op: 'above' | 'below';
  value: number;
  active: boolean;
  firedAt?: number;
}
export interface Hit {
  id: string;
  text: string;
  at: number;
}
interface State {
  watch: WatchItem[];
  alerts: Alert[];
  hits: Hit[];
}

const KEY = 'alkammah_mate_watch_v1';
const listeners = new Set<() => void>();
let state: State = load();

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<State>;
      return { watch: p.watch || [], alerts: p.alerts || [], hits: p.hits || [] };
    }
  } catch {
    /* ignore */
  }
  return { watch: [{ kind: 'pair', id: 'USD/EGP', label: 'USD/EGP' }], alerts: [], hits: [] };
}
function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getWatchState = () => state;
export const useWatchState = (): State => useSyncExternalStore(subscribe, getWatchState);
export const useWatchlist = (): WatchItem[] => useWatchState().watch;
export const isWatched = (list: WatchItem[], kind: WatchItem['kind'], id: string) => list.some((w) => w.kind === kind && w.id === id);

export function toggleWatch(kind: WatchItem['kind'], id: string, label: string) {
  commit({ ...state, watch: isWatched(state.watch, kind, id) ? state.watch.filter((w) => !(w.kind === kind && w.id === id)) : [...state.watch, { kind, id, label }] });
}
export function addAlert(a: Omit<Alert, 'id' | 'active'>) {
  commit({ ...state, alerts: [...state.alerts, { ...a, id: `al-${Date.now().toString(36)}`, active: true }] });
}
export function removeAlert(id: string) {
  commit({ ...state, alerts: state.alerts.filter((a) => a.id !== id) });
}
export function setAlertActive(id: string, active: boolean) {
  commit({ ...state, alerts: state.alerts.map((a) => (a.id === id ? { ...a, active, firedAt: undefined } : a)) });
}
export function clearHits() {
  commit({ ...state, hits: [] });
}

export const METRICS: { id: Metric; en: string; ar: string; unit: string }[] = [
  { id: 'USDEGP', en: 'US dollar in EGP', ar: 'الدولار بالجنيه', unit: 'EGP' },
  { id: 'GOLD21', en: 'Gold 21K gram', ar: 'جرام الذهب عيار 21', unit: 'EGP' },
  { id: 'GOLD24', en: 'Gold 24K gram', ar: 'جرام الذهب عيار 24', unit: 'EGP' },
  { id: 'EGX30', en: 'EGX30 index', ar: 'مؤشر EGX30', unit: 'pts' },
];

export async function metricValue(m: Metric): Promise<number | null> {
  try {
    if (m === 'USDEGP') return (await getRates()).data.EGP ?? null;
    if (m === 'GOLD21') return (await getGold()).data.gram21;
    if (m === 'GOLD24') return (await getGold()).data.gram24;
    return (await getEgx30('1mo')).data.price;
  } catch {
    return null;
  }
}

const COOLDOWN_MS = 12 * 3600_000;

/** checks every active alert; the ones that crossed their line are returned, remembered and (if allowed) shown as a phone/desktop notification */
export async function evaluateAlerts(ar: boolean): Promise<Hit[]> {
  const live = state.alerts.filter((a) => a.active && (!a.firedAt || Date.now() - a.firedAt > COOLDOWN_MS));
  if (live.length === 0) return [];
  const values = new Map<Metric, number | null>();
  for (const m of new Set(live.map((a) => a.metric))) values.set(m, await metricValue(m));
  const hits: Hit[] = [];
  const fired = new Map<string, number>();
  for (const a of live) {
    const v = values.get(a.metric);
    if (v === null || v === undefined) continue;
    if (a.op === 'above' ? v >= a.value : v <= a.value) {
      const meta = METRICS.find((x) => x.id === a.metric)!;
      const text = ar
        ? `${meta.ar}: ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${a.op === 'above' ? 'تجاوز' : 'نزل عن'} ${a.value})`
        : `${meta.en}: ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${a.op === 'above' ? 'passed' : 'fell below'} ${a.value})`;
      hits.push({ id: `${a.id}-${Date.now()}`, text, at: Date.now() });
      fired.set(a.id, Date.now());
    }
  }
  if (hits.length) {
    commit({ ...state, alerts: state.alerts.map((a) => (fired.has(a.id) ? { ...a, firedAt: fired.get(a.id) } : a)), hits: [...hits, ...state.hits].slice(0, 20) });
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') hits.forEach((h) => new Notification(ar ? 'تنبيه سعر' : 'Price alert', { body: h.text }));
    } catch {
      /* notifications are optional */
    }
  }
  return hits;
}
