// @ts-nocheck -- this file runs on Supabase Edge Functions (Deno), not in the browser build
// Supabase Edge Function: lets an ADMINISTRATOR create logins, change roles, switch people off and reset passwords.
// Creating logins needs the server-side service key, which must never be in the app, so it happens here.
// Safety: the caller must be signed in AND be an active administrator in the `profiles` table (checked on every call).
// No secrets to paste: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ROLES = ['admin', 'manager', 'member'];
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const passwordProblem = (pw: string): string | null => {
  if (pw.length < 10) return 'password_too_short';
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/[0-9]/.test(pw)) return 'password_needs_letters_and_numbers';
  if (/^(.)\1+$/.test(pw)) return 'password_too_simple';
  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await sb.auth.getUser(jwt);
    if (whoErr || !who.user) return json({ error: 'not_signed_in' }, 401);
    const me = who.user.id;

    const { data: mine } = await sb.from('profiles').select('role, active').eq('user_id', me).maybeSingle();
    if (!mine || !mine.active || mine.role !== 'admin') return json({ error: 'admins_only' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    if (action === 'list') {
      const { data: profiles, error } = await sb.from('profiles').select('*').order('created_at', { ascending: true });
      if (error) return json({ error: error.message }, 500);
      const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const last = new Map((users?.users || []).map((u) => [u.id, u.last_sign_in_at || null]));
      return json({ people: (profiles || []).map((p) => ({ ...p, lastSignIn: last.get(p.user_id) ?? null })) });
    }

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const name = String(body.displayName || '').trim().slice(0, 80);
      const role = String(body.role || 'member');
      if (!isEmail(email)) return json({ error: 'bad_email' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'bad_role' }, 400);
      const pp = passwordProblem(password);
      if (pp) return json({ error: pp }, 400);
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name, role, must_change_password: true },
      });
      if (error) return json({ error: /already/i.test(error.message) ? 'email_exists' : error.message }, 400);
      await sb.from('profiles').upsert({ user_id: data.user.id, email, display_name: name, role, active: true });
      return json({ ok: true, userId: data.user.id });
    }

    const target = String(body.userId || '');
    if (!target) return json({ error: 'no_user' }, 400);
    const { data: tp } = await sb.from('profiles').select('role, active').eq('user_id', target).maybeSingle();
    if (!tp) return json({ error: 'unknown_user' }, 404);

    // never leave the system without an active administrator
    const lastAdminGuard = async () => {
      if (tp.role !== 'admin' || !tp.active) return true;
      const { count } = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true);
      return (count || 0) > 1;
    };

    if (action === 'setRole') {
      const role = String(body.role || '');
      if (!ROLES.includes(role)) return json({ error: 'bad_role' }, 400);
      if (role !== 'admin' && !(await lastAdminGuard())) return json({ error: 'last_admin' }, 400);
      await sb.from('profiles').update({ role }).eq('user_id', target);
      return json({ ok: true });
    }
    if (action === 'setActive') {
      const active = body.active === true;
      if (!active && !(await lastAdminGuard())) return json({ error: 'last_admin' }, 400);
      await sb.from('profiles').update({ active }).eq('user_id', target);
      // switched-off people cannot sign in again
      await sb.auth.admin.updateUserById(target, { ban_duration: active ? 'none' : '876000h' });
      return json({ ok: true });
    }
    if (action === 'resetPassword') {
      const password = String(body.password || '');
      const pp = passwordProblem(password);
      if (pp) return json({ error: pp }, 400);
      const { data: u } = await sb.auth.admin.getUserById(target);
      const { error } = await sb.auth.admin.updateUserById(target, {
        password,
        user_metadata: { ...(u?.user?.user_metadata || {}), must_change_password: true },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    return json({ error: 'server_error', detail: String(e?.message || e).slice(0, 200) }, 500);
  }
});
