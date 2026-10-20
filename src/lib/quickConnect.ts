/**
 * "Open, copy, come back, paste" helpers used by the quick-connect buttons (Outlook calendar link, free Gemini key).
 * Nothing here talks to a server: the person copies the value on the provider's own page, and the app reads it from the
 * clipboard only when they tap "Paste" (iOS shows its own Paste confirmation).
 */

/** Outlook on the web, opened straight on Settings → Calendar → Shared calendars → "Publish a calendar". */
export const OUTLOOK_PUBLISH_URL = 'https://outlook.office.com/calendar/options/calendar/SharedCalendars';
/** Google AI Studio's key page: a free key is one tap there (the person is already signed in to Google). */
export const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/apikey';

const OUTLOOK_HOSTS = ['outlook.office365.com', 'outlook.office.com', 'outlook.live.com'];

/**
 * Finds a published Outlook calendar link in any pasted text. Outlook shows two links (HTML and ICS) with the same address;
 * if the HTML one was copied by mistake it is turned into the ICS one, so either works.
 */
export function findOutlookIcsLink(text: string): string | null {
  const urls = text.match(/https:\/\/[^\s"'<>]+/g) || [];
  for (const raw of urls) {
    let u: URL;
    try {
      u = new URL(raw.replace(/[).,;]+$/, ''));
    } catch {
      continue;
    }
    if (!OUTLOOK_HOSTS.includes(u.hostname) || !/\/calendar\//i.test(u.pathname)) continue;
    if (/\.ics$/i.test(u.pathname)) return u.toString();
    if (/\.html?$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\.html?$/i, '.ics');
      return u.toString();
    }
  }
  return null;
}

/** Finds a Google AI Studio (Gemini) API key in any pasted text. */
export function findGeminiKey(text: string): string | null {
  const m = text.match(/AIza[0-9A-Za-z_-]{35}/);
  return m ? m[0] : null;
}

/** Reads the clipboard after a tap. Throws 'NO_CLIPBOARD' when the browser does not allow it (the caller shows a paste box). */
export async function readClipboard(): Promise<string> {
  if (!navigator.clipboard?.readText) throw new Error('NO_CLIPBOARD');
  try {
    return await navigator.clipboard.readText();
  } catch {
    throw new Error('NO_CLIPBOARD');
  }
}

/** Opens a provider page in a new tab (must be called from the tap itself). */
export function openExternal(url: string): void {
  // ('noopener' would make window.open return null, so the link is cut off from this page afterwards instead)
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
  else location.href = url;
}
