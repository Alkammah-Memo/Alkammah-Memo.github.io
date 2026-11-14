import { describe, it, expect } from 'vitest';
import { runMarketTool } from '../src/lib/ai/marketTools';
import { qiblaBearing, LANGUAGES, PHRASES } from '../src/lib/travelData';

describe('Spero market tools (no network needed)', () => {
  it('returns a phrase with its pronunciation', async () => {
    const r = (await runMarketTool('getPhrases', { language: 'Turkish', phrase: 'thank you' }, false)) as { ok: boolean; phrase: { written: string; pronunciation: string } };
    expect(r.ok).toBe(true);
    expect(r.phrase.written).toBe('Teşekkür ederim');
    expect(r.phrase.pronunciation).toContain('te-shek-KUR');
  });
  it('lists every phrase when none is asked for, and rejects unknown languages', async () => {
    const all = (await runMarketTool('getPhrases', { language: 'zh' }, false)) as { phrases: unknown[] };
    expect(all.phrases).toHaveLength(PHRASES.length);
    const bad = (await runMarketTool('getPhrases', { language: 'klingon' }, false)) as { ok: boolean };
    expect(bad.ok).toBe(false);
  });
  it('every language has one entry per phrase', () => {
    for (const l of LANGUAGES) expect(l.words).toHaveLength(PHRASES.length);
  });
  it('gives upcoming holidays in date order', async () => {
    const r = (await runMarketTool('getHolidays', { count: 4 }, false)) as { upcoming: { date: string }[] };
    expect(r.upcoming).toHaveLength(4);
    expect([...r.upcoming].sort((a, b) => a.date.localeCompare(b.date))).toEqual(r.upcoming);
  });
  it('adds, lists and removes an alert', async () => {
    const add = (await runMarketTool('manageMarketAlerts', { action: 'add', metric: 'USDEGP', direction: 'above', value: 70 }, false)) as { ok: boolean };
    expect(add.ok).toBe(true);
    const list = (await runMarketTool('manageMarketAlerts', { action: 'list' }, false)) as { alerts: { metric: string; value: number }[] };
    expect(list.alerts.some((a) => a.metric === 'USDEGP' && a.value === 70)).toBe(true);
    const rm = (await runMarketTool('manageMarketAlerts', { action: 'remove', metric: 'USDEGP', value: 70 }, false)) as { ok: boolean };
    expect(rm.ok).toBe(true);
  });
  it('ignores tools that are not its own', async () => {
    expect(await runMarketTool('createTask', {}, false)).toBeUndefined();
  });
  it('points the Qibla roughly south-east from Beijing and north-east from Cape Town', () => {
    expect(Math.round(qiblaBearing(39.9, 116.4))).toBeGreaterThan(270);
    expect(qiblaBearing(-33.9, 18.4)).toBeLessThan(45);
  });
});
