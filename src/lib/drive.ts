/**
 * Keeps pictures and chat files in the user's OWN Google Drive (folder "Memo System"), shared as "anyone with the link can view".
 * The database only stores a small record (id, name, type, size); nobody's Supabase space is used for files.
 * The app can only see files it created itself (Drive scope "drive.file"), never the rest of the user's Drive.
 */
import { getGoogleLink, requestGoogleToken, setGoogleLink, tokenIsValid } from './googleCalendar';

export const FOLDER_NAME = 'Memo System';
export const MAX_PROFILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface Attachment {
  id: string; // Drive file id
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'file';
}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const folderKey = (email: string | undefined) => `alkammah_drive_folder_${email || 'me'}`;

/** What to show for a Drive file (the link people see; the app never shows the raw address in the chat). */
export const imageUrl = (id: string, width = 1000) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
export const viewUrl = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
export const downloadUrl = (id: string) => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;

/** Only pictures that really live on Google's servers are shown (blocks tracking pictures from anywhere else). */
export function safeImageUrl(url: string | undefined | null): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return '';
    if (u.hostname === 'drive.google.com' || u.hostname.endsWith('.googleusercontent.com')) return u.toString();
  } catch {
    /* not a link */
  }
  return '';
}

export class DriveError extends Error {
  constructor(public code: 'NOT_CONNECTED' | 'NO_PERMISSION' | 'TOO_BIG' | 'FAILED', message: string) {
    super(message);
  }
}

async function token(): Promise<string> {
  const l = getGoogleLink();
  if (tokenIsValid(l) && l.driveOk) return l.token as string;
  let t: string;
  try {
    t = await requestGoogleToken(false);
  } catch {
    throw new DriveError('NOT_CONNECTED', 'Connect your Google account in Settings first.');
  }
  if (!getGoogleLink().driveOk) throw new DriveError('NO_PERMISSION', 'Google is connected, but file storage was not allowed yet.');
  return t;
}

async function g(path: string, tk: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${tk}` } });
  if (res.status === 401) {
    setGoogleLink({ token: undefined, expiresAt: undefined });
    throw new DriveError('NOT_CONNECTED', 'Google needs to be connected again.');
  }
  if (res.status === 403) throw new DriveError('NO_PERMISSION', 'Google did not allow file storage.');
  if (!res.ok) throw new DriveError('FAILED', `Google Drive error ${res.status}`);
  return res;
}

async function folderId(tk: string): Promise<string> {
  const key = folderKey(getGoogleLink().email);
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      // make sure it still exists (the user may have deleted it)
      const r = await fetch(`${API}/files/${cached}?fields=id,trashed`, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.ok && !(await r.json()).trashed) return cached;
    }
  } catch {
    /* look it up again */
  }
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = (await (await g(`${API}/files?q=${q}&fields=files(id)&spaces=drive`, tk)).json()) as { files?: { id: string }[] };
  let id = found.files?.[0]?.id;
  if (!id) {
    const made = await g(`${API}/files?fields=id`, tk, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    id = ((await made.json()) as { id: string }).id;
  }
  try {
    localStorage.setItem(key, id);
  } catch {
    /* ignore */
  }
  return id;
}

/** Shrinks a picture so it loads fast on a phone (and so a 15 MB photo costs the user almost no Drive space). */
export async function shrinkImage(file: File, maxSide: number, quality = 0.86): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return file;
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
    if (!blob || blob.size >= file.size) return scale < 1 && blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Uploads one file to the user's "Memo System" folder, makes it viewable by link, and returns the small record to store. */
export async function uploadToDrive(file: File, opts: { maxBytes?: number; prefix?: string } = {}): Promise<Attachment> {
  if (file.size > (opts.maxBytes ?? MAX_FILE_BYTES)) throw new DriveError('TOO_BIG', 'This file is too big.');
  const tk = await token();
  const parent = await folderId(tk);
  const name = `${opts.prefix ? opts.prefix + '-' : ''}${file.name || 'file'}`.slice(0, 180);
  const mime = file.type || 'application/octet-stream';

  let created: { id: string };
  if (file.size <= 4 * 1024 * 1024) {
    const boundary = `memo${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name, parents: [parent] });
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, file, `\r\n--${boundary}--`]);
    const r = await g(`${UPLOAD}?uploadType=multipart&fields=id`, tk, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    created = (await r.json()) as { id: string };
  } else {
    const start = await g(`${UPLOAD}?uploadType=resumable&fields=id`, tk, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(file.size) },
      body: JSON.stringify({ name, parents: [parent] }),
    });
    const loc = start.headers.get('Location');
    if (!loc) throw new DriveError('FAILED', 'Google Drive did not start the upload.');
    const put = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': mime }, body: file });
    if (!put.ok) throw new DriveError('FAILED', `Google Drive upload error ${put.status}`);
    created = (await put.json()) as { id: string };
  }
  await g(`${API}/files/${created.id}/permissions`, tk, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return { id: created.id, name: file.name || name, mime, size: file.size, kind: mime.startsWith('image/') ? 'image' : 'file' };
}

/** Best effort: removes a file from the sender's Drive when its message or picture is deleted. */
export async function deleteFromDrive(id: string): Promise<void> {
  try {
    const tk = await token();
    await fetch(`${API}/files/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tk}` } });
  } catch {
    /* the file simply stays in the sender's own Drive */
  }
}
