/**
 * Merge a remote snapshot into local state without losing in-flight local edits.
 *
 * - a remote item replaces the local one only when it is at least as new (by `updatedAt`)
 * - local items missing remotely are kept if they were touched in the last `graceMs`
 *   (still being uploaded), otherwise they were deleted elsewhere and are dropped
 */
export interface Timestamped {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

const ts = (v?: string) => {
  const n = v ? Date.parse(v) : 0;
  return Number.isFinite(n) ? n : 0;
};

export function mergeRemote<T extends Timestamped>(local: T[], remote: T[], graceMs = 20_000, now = Date.now()): T[] {
  const localById = new Map(local.map((i) => [i.id, i]));
  const merged = new Map<string, T>();

  for (const r of remote) {
    const l = localById.get(r.id);
    merged.set(r.id, l && ts(l.updatedAt) > ts(r.updatedAt) ? l : r);
  }
  for (const l of local) {
    if (merged.has(l.id)) continue;
    const touched = Math.max(ts(l.updatedAt), ts(l.createdAt));
    if (now - touched < graceMs) merged.set(l.id, l);
  }
  return [...merged.values()];
}

/** Local items the cloud has never seen (used to upload offline-created data on first sync). */
export function localOnly<T extends Timestamped>(local: T[], remote: T[]): T[] {
  const remoteIds = new Set(remote.map((r) => r.id));
  return local.filter((l) => !remoteIds.has(l.id));
}
