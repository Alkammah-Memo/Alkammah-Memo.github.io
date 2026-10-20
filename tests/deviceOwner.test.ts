import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/indexedDb', () => ({ localDB: { clearAll: async () => undefined } }));
import { needsWipe, previousUsers } from '../src/lib/deviceOwner';

const storage = (keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null });

describe('device hand-over', () => {
  it('finds who synced in this browser', () => {
    expect([...previousUsers(storage(['alkammah_last_cloud_sync_ceo', 'alkammah_doc_meta_walid', 'other']))].sort()).toEqual(['ceo', 'walid']);
  });
  it('wipes when another person signs in', () => {
    expect(needsWipe('walid', 'ceo', new Set(['ceo']))).toBe(true);
  });
  it('wipes an old device that never recorded its owner but holds someone else’s data', () => {
    expect(needsWipe('walid', null, new Set(['ceo']))).toBe(true);
  });
  it('wipes a device that is already mixed', () => {
    expect(needsWipe('walid', 'walid', new Set(['ceo', 'walid']))).toBe(true);
  });
  it('keeps the data of the same person', () => {
    expect(needsWipe('ceo', 'ceo', new Set(['ceo']))).toBe(false);
    expect(needsWipe('ceo', null, new Set())).toBe(false);
  });
});
