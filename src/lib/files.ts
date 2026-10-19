/**
 * Pictures and chat files live in a private Supabase Storage bucket ("team-files"), NOT in the database tables.
 * Pictures are squeezed hard before upload (a profile photo ends up around 20-40 KB, a chat photo around 100-200 KB),
 * so the free storage lasts for many thousands of pictures. Only a short record (path, name, type, size) goes in the database.
 * Files are private: they are shown through short-lived signed links, and only signed-in team members can ask for one.
 */
import { useEffect, useState } from 'react';
import { getCurrentUser, supabase } from './cloud';

export const BUCKET = 'team-files';
export const MAX_PROFILE_BYTES = 15 * 1024 * 1024; // what the person may choose (it is shrunk before upload)
export const MAX_FILE_BYTES = 8 * 1024 * 1024; // the largest thing that is actually stored

export interface Attachment {
  id: string; // storage path
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'file';
}

export class FileError extends Error {
  constructor(public code: 'NO_CLOUD' | 'TOO_BIG' | 'FAILED', message: string) {
    super(message);
  }
}

/** Shrinks a picture (and turns it into JPEG) so it loads fast and costs almost no storage. */
export async function shrinkImage(file: File, maxSide: number, quality: number): Promise<File> {
  if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Uploads one file to the signed-in person's own folder and returns the small record to keep in the database. */
export async function uploadFile(file: File, opts: { maxBytes?: number } = {}): Promise<Attachment> {
  const me = getCurrentUser();
  if (!supabase || !me) throw new FileError('NO_CLOUD', 'Sign in to the cloud first.');
  if (file.size > (opts.maxBytes ?? MAX_FILE_BYTES)) throw new FileError('TOO_BIG', 'This file is too big.');
  const ext = (file.name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] || 'bin').toLowerCase();
  const path = `${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const mime = file.type || 'application/octet-stream';
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, cacheControl: '31536000', upsert: false });
  if (error) throw new FileError('FAILED', /exceeded|too large|size/i.test(error.message) ? 'This file is too big.' : error.message);
  return { id: path, name: file.name || `file.${ext}`, mime, size: file.size, kind: mime.startsWith('image/') ? 'image' : 'file' };
}

/** Best effort: removes a file (only the person who uploaded it is allowed to). */
export async function deleteFile(path: string): Promise<void> {
  if (!supabase || !path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* it stays; the storage is tiny anyway */
  }
}

// ----- short-lived private links (kept in memory so a picture is only signed once per session)
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string>>();
const TTL = 6 * 3600;

export async function signedUrl(path: string, download?: string): Promise<string> {
  if (!supabase || !path || /^https?:/i.test(path)) return '';
  const key = download ? `${path}|dl` : path;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  let p = inflight.get(key);
  if (!p) {
    p = supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, TTL, download ? { download } : undefined)
      .then(({ data }) => {
        const url = data?.signedUrl || '';
        if (url) cache.set(key, { url, exp: Date.now() + TTL * 1000 });
        return url;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** The address to show for a stored picture ('' while it is being prepared or if it cannot be shown). */
export function useSignedUrl(path: string | undefined): string {
  const [url, setUrl] = useState<string>(() => (path ? cache.get(path)?.url || '' : ''));
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl('');
      return;
    }
    void signedUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

/** Opens a picture in a new tab, or downloads any other file (the tab is opened first so iOS does not block it). */
export async function openAttachment(a: Attachment): Promise<void> {
  const w = window.open('', '_blank');
  const url = await signedUrl(a.id, a.kind === 'image' ? undefined : a.name);
  if (url && w) w.location.href = url;
  else if (url) location.href = url;
  else w?.close();
}
