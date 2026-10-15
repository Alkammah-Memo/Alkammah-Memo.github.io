import { describe, expect, it } from 'vitest';
import { mergeRemote } from '../src/lib/merge';

const item = (id: string, updatedAt: string) => ({ id, updatedAt, createdAt: updatedAt });
const NOW = Date.parse('2026-10-15T12:00:00Z');

describe('mergeRemote', () => {
  it('keeps the newer local edit over an older remote echo', () => {
    const local = [item('a', '2026-10-15T11:59:59Z')];
    const remote = [item('a', '2026-10-15T11:59:00Z')];
    expect(mergeRemote(local, remote, 20000, NOW)[0].updatedAt).toBe('2026-10-15T11:59:59Z');
  });
  it('takes newer remote data', () => {
    const local = [item('a', '2026-10-15T10:00:00Z')];
    const remote = [item('a', '2026-10-15T11:00:00Z')];
    expect(mergeRemote(local, remote, 20000, NOW)[0].updatedAt).toBe('2026-10-15T11:00:00Z');
  });
  it('drops items deleted elsewhere but keeps fresh local ones still uploading', () => {
    const local = [item('old', '2026-10-15T10:00:00Z'), item('fresh', '2026-10-15T11:59:55Z')];
    const out = mergeRemote(local, [], 20000, NOW).map((i) => i.id);
    expect(out).toEqual(['fresh']);
  });
});
