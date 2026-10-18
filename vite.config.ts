import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// The app may only run its own code and talk to the services it really uses. GitHub Pages cannot send security headers,
// so the same rules are embedded as a meta tag. Production build only (the dev server needs inline scripts for hot reload).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://www.googleapis.com https://accounts.google.com",
  'frame-src https://accounts.google.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityMeta = (): Plugin => ({
  name: 'security-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
});

// Hosted at https://Alkammah-Memo.github.io (organization site => served from the domain root)
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), securityMeta()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
