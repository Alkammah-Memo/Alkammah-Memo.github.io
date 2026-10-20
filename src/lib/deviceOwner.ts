import { localDB } from './indexedDb';

const KEY = 'alkammah_device_owner';
/** keys the app writes per signed-in person; they reveal who used this device before, even on devices from before this check existed */
const PER_USER_KEY = /^alkammah_(?:last_cloud_sync|doc_meta)_(.+)$/;

/** ids of the people whose cloud sync left a trace in this browser */
export function previousUsers(storage: Pick<Storage, 'length' | 'key'>): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < storage.length; i++) {
    const m = storage.key(i)?.match(PER_USER_KEY);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/** true when the data kept in this browser may belong to someone other than `userId` */
export function needsWipe(userId: string, owner: string | null, traces: Set<string>): boolean {
  if (owner && owner !== userId) return true;
  // someone else synced here (also covers devices used before the owner was recorded, and a device that was already mixed)
  for (const id of traces) if (id !== userId) return true;
  return false;
}

/**
 * Several people may use the same device. The notes, tasks, keys and links kept on the device belong to one person only;
 * when a DIFFERENT person signs in, everything stored locally is removed first, so nothing can mix or be uploaded into the
 * wrong account. Returns true when the device was cleaned (the page should then reload).
 */
export async function claimDevice(userId: string): Promise<boolean> {
  let owner: string | null = null;
  let traces = new Set<string>();
  try {
    owner = localStorage.getItem(KEY);
    traces = previousUsers(localStorage);
  } catch {
    return false;
  }
  if (!needsWipe(userId, owner, traces)) {
    if (owner !== userId) localStorage.setItem(KEY, userId);
    return false;
  }
  try {
    await localDB.clearAll();
  } catch {
    /* continue: the browser storage part below still runs */
  }
  localStorage.clear();
  localStorage.setItem(KEY, userId);
  return true;
}
