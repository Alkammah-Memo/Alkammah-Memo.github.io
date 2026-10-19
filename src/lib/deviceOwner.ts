import { localDB } from './indexedDb';

const KEY = 'alkammah_device_owner';

/**
 * Several people may use the same device. The notes, tasks and settings kept on the device belong to whoever signed in last;
 * when a DIFFERENT person signs in, the old person's local copy is removed first, so nothing can mix or leak between accounts.
 * Returns true when the device was cleaned (the page should then reload).
 */
export async function claimDevice(userId: string): Promise<boolean> {
  let prev: string | null = null;
  try {
    prev = localStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (prev === userId) return false;
  if (!prev) {
    // first sign-in on this device since this feature exists: whoever is here now owns what is stored
    localStorage.setItem(KEY, userId);
    return false;
  }
  try {
    await localDB.clearAll();
  } catch {
    /* continue: the localStorage part below still runs */
  }
  localStorage.clear();
  localStorage.setItem(KEY, userId);
  return true;
}
