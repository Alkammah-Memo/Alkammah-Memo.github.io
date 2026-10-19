import { describe, expect, it } from 'vitest';
import { safeImageUrl } from '../src/lib/drive';
import { birthdaysOn, nameOf } from '../src/lib/team';
import type { Profile } from '../src/lib/team';

const p = (over: Partial<Profile>): Profile => ({ user_id: 'u', email: 'a.b@x.com', display_name: '', phone: '', birthday: '', avatar_url: '', role: 'member', active: true, created_at: '', ...over });

describe('team helpers', () => {
  it('only shows pictures hosted by Google', () => {
    expect(safeImageUrl('https://drive.google.com/thumbnail?id=abc&sz=w400')).toContain('drive.google.com');
    expect(safeImageUrl('https://lh3.googleusercontent.com/d/abc')).toContain('googleusercontent');
    expect(safeImageUrl('https://evil.example/pixel.gif')).toBe('');
    expect(safeImageUrl('http://drive.google.com/x')).toBe('');
    expect(safeImageUrl('javascript:alert(1)')).toBe('');
    expect(safeImageUrl('')).toBe('');
  });
  it('falls back to the e-mail name', () => {
    expect(nameOf(p({ display_name: ' Sara ' }))).toBe('Sara');
    expect(nameOf(p({}))).toBe('a.b');
  });
  it('finds birthdays by month and day, ignoring the year and switched-off people', () => {
    const list = [p({ user_id: '1', birthday: '1980-10-19' }), p({ user_id: '2', birthday: '1990-10-20' }), p({ user_id: '3', birthday: '2001-10-19', active: false }), p({ user_id: '4' })];
    expect(birthdaysOn(list, '2026-10-19').map((x) => x.user_id)).toEqual(['1']);
  });
});
