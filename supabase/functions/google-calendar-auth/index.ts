// @ts-nocheck -- this file runs on Supabase Edge Functions (Deno), not in the browser build
// Supabase Edge Function: keeps the Google Calendar sign-in alive for good.
// Google's browser sign-in only lasts an hour. This function holds the long-lived "refresh token" (server side, never in the browser)
// and hands the app a fresh one-hour access token whenever it asks, so nobody has to tap "Sync now" again.
//
// Secrets to set (Supabase Dashboard -> Edge Functions -> Secrets):
//   GOOGLE_CLIENT_ID      the OAuth Web client ID
//   GOOGLE_CLIENT_SECRET  the OAuth Web client secret
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function googleToken(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return { ok: res.ok, data: await res.json() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
    if (whoErr || !who.user) return json({ error: 'not_signed_in' }, 401);
    const uid = who.user.id;

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (action === 'status') {
      const { data } = await admin.from('google_tokens').select('email').eq('user_id', uid).maybeSingle();
      return json({ configured: !!(clientId && clientSecret), linked: !!data, email: data?.email ?? null });
    }
    if (!clientId || !clientSecret) return json({ error: 'server_not_configured' }, 503);

    if (action === 'exchange') {
      const r = await googleToken({ code: String(body.code || ''), client_id: clientId, client_secret: clientSecret, redirect_uri: 'postmessage', grant_type: 'authorization_code' });
      if (!r.ok) return json({ error: r.data?.error_description || r.data?.error || 'exchange_failed' }, 400);
      if (r.data.refresh_token) {
        await admin.from('google_tokens').upsert({ user_id: uid, refresh_token: r.data.refresh_token, updated_at: new Date().toISOString() });
      } else {
        const { data } = await admin.from('google_tokens').select('user_id').eq('user_id', uid).maybeSingle();
        if (!data) return json({ error: 'no_refresh_token' }, 400);
      }
      return json({ access_token: r.data.access_token, expires_in: r.data.expires_in, scope: r.data.scope });
    }

    if (action === 'refresh') {
      const { data } = await admin.from('google_tokens').select('refresh_token').eq('user_id', uid).maybeSingle();
      if (!data) return json({ error: 'no_link' }, 404);
      const r = await googleToken({ refresh_token: data.refresh_token, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' });
      if (!r.ok) {
        if (r.data?.error === 'invalid_grant') {
          await admin.from('google_tokens').delete().eq('user_id', uid);
          return json({ error: 'reauth' }, 401);
        }
        return json({ error: r.data?.error_description || 'refresh_failed' }, 502);
      }
      return json({ access_token: r.data.access_token, expires_in: r.data.expires_in, scope: r.data.scope });
    }

    if (action === 'disconnect') {
      const { data } = await admin.from('google_tokens').select('refresh_token').eq('user_id', uid).maybeSingle();
      if (data) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: 'POST' }).catch(() => undefined);
      await admin.from('google_tokens').delete().eq('user_id', uid);
      return json({ ok: true });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
