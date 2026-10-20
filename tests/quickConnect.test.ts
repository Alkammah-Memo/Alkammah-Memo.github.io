import { describe, expect, it } from 'vitest';
import { findGeminiKey, findOutlookIcsLink } from '../src/lib/quickConnect';
import { mergeRemote } from '../src/lib/merge';

describe('quick connect', () => {
  const base = 'https://outlook.office365.com/owa/calendar/abc123@elsewedy.com/tok456/calendar';
  it('finds the Outlook ICS link inside copied text', () => {
    expect(findOutlookIcsLink(`ICS: ${base}.ics`)).toBe(`${base}.ics`);
  });
  it('turns the HTML link into the ICS link', () => {
    expect(findOutlookIcsLink(`${base}.html`)).toBe(`${base}.ics`);
  });
  it('ignores links that are not Outlook calendars', () => {
    expect(findOutlookIcsLink('https://evil.example/owa/calendar/x/calendar.ics')).toBeNull();
    expect(findOutlookIcsLink('https://outlook.office.com/mail/inbox')).toBeNull();
    expect(findOutlookIcsLink('hello')).toBeNull();
  });
  it('finds a Gemini key in copied text', () => {
    const k = 'AIza' + 'B'.repeat(35);
    expect(findGeminiKey(`key: ${k} `)).toBe(k);
    expect(findGeminiKey('AIzaShort')).toBeNull();
  });
});

describe('merge keeps offline work', () => {
  it('keeps a local item the cloud has not seen yet when it is waiting to upload', () => {
    const old = new Date(Date.now() - 3600_000).toISOString();
    const local = [{ id: 'a', updatedAt: old }, { id: 'b', updatedAt: old }];
    const merged = mergeRemote(local, [], 20_000, Date.now(), new Set(['b']));
    expect(merged.map((x) => x.id)).toEqual(['b']);
  });
});
