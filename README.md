# Alkammah Memo

Private, bilingual (English / Arabic) executive notebook, tasks, calendar and **Spero** voice assistant (Gemini Live).
Static React app hosted on GitHub Pages, with Supabase for login and cloud sync.

Live URL (after setup): **https://alkammah-memo.github.io**

## What changed from the AI Studio version
- No Express server: all Gemini calls run in the browser, so the app can live on GitHub Pages.
- Firebase replaced by **Supabase** (email login + row-level security + realtime sync). IndexedDB still works offline.
- New **Settings** page: three Gemini API keys, per-key connection test (AI request + Live voice handshake),
  and automatic failover. If a key hits a quota, rate limit, overload or gets rejected, the next key takes over
  immediately and the system keeps retrying (including live voice sessions, which reconnect on the next key).
- Fixes: see `CHANGELOG.md`.

## Develop
```bash
npm install
cp .env.example .env     # optional: add Supabase URL + anon key; without it the app runs in local-only mode
npm run dev              # http://localhost:5173
npm run lint             # strict TypeScript
npm test                 # unit tests (failover, Cairo time, sync merge)
npm run build            # static site in dist/
```

## Deploy
See `SETUP.md` (Supabase project, GitHub organization, Pages).
