import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Ban, Check, KeyRound, Loader2, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Fold } from '../settings/Fold';
import { Avatar } from './Avatar';
import { adminCreate, adminList, adminMessage, adminResetPassword, adminSetActive, adminSetRole, getTeam, nameOf, subscribeTeam } from '../../lib/team';
import type { Profile, Role } from '../../lib/team';
import { passwordProblem } from '../../lib/passwordRules';

const T = (ar: boolean, en: string, a: string) => (ar ? a : en);
const input = 'w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-base sm:text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20';
const roleLabel = (r: Role, ar: boolean) => (r === 'admin' ? T(ar, 'Administrator', 'مدير النظام') : r === 'manager' ? T(ar, 'Manager', 'مدير') : T(ar, 'Member', 'عضو'));

/** A readable temporary password (letters and numbers, no look-alike characters). */
function makePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  const pw = Array.from(a, (n) => chars[n % chars.length]).join('');
  return /[0-9]/.test(pw) && /[A-Za-z]/.test(pw) ? pw : makePassword();
}

/** Administrator-only: add people, give them a role, switch them off, reset a password. */
export const TeamAdmin: React.FC<{ ar: boolean }> = ({ ar }) => {
  const team = useSyncExternalStore(subscribeTeam, getTeam);
  const me = team.profiles.find((p) => p.user_id === team.meId);
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const [email, setEmail] = useState('');
  const [dname, setDname] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [pw, setPw] = useState(makePassword);
  const [creating, setCreating] = useState(false);
  const [given, setGiven] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      setPeople(await adminList());
    } catch (e) {
      setErr(adminMessage((e as Error).message, ar));
    }
  }, [ar]);
  useEffect(() => {
    if (me?.role === 'admin') void load();
  }, [me?.role, load]);

  if (me?.role !== 'admin') return null;

  const create = async () => {
    setNote(null);
    const bad = passwordProblem(pw);
    if (bad) return setNote({ ok: false, text: bad });
    setCreating(true);
    try {
      await adminCreate({ email, password: pw, displayName: dname, role });
      setGiven({ email: email.trim().toLowerCase(), password: pw });
      setEmail('');
      setDname('');
      setRole('member');
      setPw(makePassword());
      await load();
    } catch (e) {
      setNote({ ok: false, text: adminMessage((e as Error).message, ar) });
    } finally {
      setCreating(false);
    }
  };

  const act = async (id: string, fn: () => Promise<unknown>, okText?: string) => {
    setBusyId(id);
    setNote(null);
    try {
      await fn();
      if (okText) setNote({ ok: true, text: okText });
      await load();
    } catch (e) {
      setNote({ ok: false, text: adminMessage((e as Error).message, ar) });
    } finally {
      setBusyId('');
    }
  };

  const reset = (p: Profile) => {
    const next = makePassword();
    void act(
      p.user_id,
      async () => {
        await adminResetPassword(p.user_id, next);
        setGiven({ email: p.email, password: next });
      },
      T(ar, 'New temporary password created (shown below).', 'تم إنشاء كلمة مرور مؤقتة جديدة (تظهر بالأسفل).')
    );
  };

  return (
    <Fold id="team-admin" icon={<Users className="w-5 h-5" />} title={T(ar, 'Team & access (administrator)', 'الفريق والصلاحيات (مدير النظام)')} defaultOpen>
      <div className="space-y-5">
        <p className="text-sm text-[#515154] leading-relaxed">
          {T(
            ar,
            'Add a person with an e-mail and a temporary password. They must choose their own password the first time they sign in. Each person has their own private tasks, notes and calendar, and their own AI keys.',
            'أضف شخصاً بالبريد الإلكتروني وكلمة مرور مؤقتة. سيختار كلمة مروره بنفسه عند أول دخول. لكل شخص مهامه وملاحظاته وتقويمه الخاص ومفاتيح الذكاء الاصطناعي الخاصة به.'
          )}
        </p>

        <div className="rounded-2xl border border-[#e5e5ea] bg-[#fafafc] p-3.5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <UserPlus className="w-4 h-4 text-[#0071e3]" />
            {T(ar, 'Add a person', 'إضافة شخص')}
          </div>
          <input className={input} type="email" dir="ltr" placeholder={T(ar, 'E-mail', 'البريد الإلكتروني')} value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          <input className={input} placeholder={T(ar, 'Full name (optional)', 'الاسم الكامل (اختياري)')} value={dname} onChange={(e) => setDname(e.target.value)} maxLength={80} />
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="member">{roleLabel('member', ar)}</option>
            <option value="manager">{roleLabel('manager', ar)}</option>
            <option value="admin">{roleLabel('admin', ar)}</option>
          </select>
          <div className="flex gap-2">
            <input className={`${input} font-mono`} dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <button type="button" onClick={() => setPw(makePassword())} className="shrink-0 min-h-11 min-w-11 rounded-xl border border-[#d2d2d7] bg-white inline-flex items-center justify-center" aria-label={T(ar, 'New password', 'كلمة مرور جديدة')}>
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-[#6e6e73]">
            {T(ar, 'Managers can also send one message to several people. Administrators can also manage this list.', 'يستطيع المدير إرسال رسالة واحدة لعدة أشخاص. ويستطيع مدير النظام أيضاً إدارة هذه القائمة.')}
          </p>
          <button type="button" disabled={creating || !email.includes('@')} onClick={create} className="inline-flex items-center gap-2 min-h-11 px-5 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {T(ar, 'Create login', 'إنشاء الحساب')}
          </button>
        </div>

        {given && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900 space-y-2">
            <p className="font-bold">{T(ar, 'Give this to the person (shown only now):', 'سلّم هذا للشخص (يظهر الآن فقط):')}</p>
            <div className="font-mono text-[13px] break-all" dir="ltr">
              {given.email}
              <br />
              {given.password}
            </div>
            <p className="text-xs">{T(ar, 'They will be asked to choose a new password at first sign-in.', 'سيُطلب منهم اختيار كلمة مرور جديدة عند أول دخول.')}</p>
            <button type="button" className="text-xs font-bold underline min-h-9" onClick={() => setGiven(null)}>
              {T(ar, 'Hide', 'إخفاء')}
            </button>
          </div>
        )}

        {note && <p className={`text-sm ${note.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{note.text}</p>}
        {err && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {err}
            <button type="button" onClick={load} className="ms-2 font-bold underline">
              {T(ar, 'Try again', 'حاول مرة أخرى')}
            </button>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="w-4 h-4 text-[#0071e3]" />
            {T(ar, 'People', 'الأشخاص')} {people ? `(${people.length})` : ''}
          </div>
          {!people && !err && <Loader2 className="w-5 h-5 animate-spin text-[#0071e3]" />}
          {people?.map((p) => {
            const mine = p.user_id === team.meId;
            return (
              <div key={p.user_id} className={`rounded-2xl border p-3 space-y-2 ${p.active ? 'border-[#e5e5ea] bg-white' : 'border-stone-200 bg-stone-50 opacity-80'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar person={p} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">
                      {nameOf(p)} {mine && <span className="text-xs font-normal text-[#6e6e73]">({T(ar, 'you', 'أنت')})</span>}
                    </div>
                    <div className="text-xs text-[#6e6e73] truncate" dir="ltr">
                      {p.email}
                    </div>
                    <div className="text-[11px] text-[#6e6e73]">
                      {p.lastSignIn ? T(ar, 'Last sign-in ', 'آخر دخول ') + new Date(p.lastSignIn).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' }) : T(ar, 'Never signed in', 'لم يدخل بعد')}
                      {!p.active && ' · ' + T(ar, 'switched off', 'موقوف')}
                    </div>
                  </div>
                  {busyId === p.user_id && <Loader2 className="w-4 h-4 animate-spin text-[#0071e3]" />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-xl border border-[#d2d2d7] bg-white px-2.5 min-h-10 text-sm"
                    value={p.role}
                    disabled={busyId === p.user_id}
                    onChange={(e) => void act(p.user_id, () => adminSetRole(p.user_id, e.target.value as Role))}
                  >
                    <option value="member">{roleLabel('member', ar)}</option>
                    <option value="manager">{roleLabel('manager', ar)}</option>
                    <option value="admin">{roleLabel('admin', ar)}</option>
                  </select>
                  <button type="button" disabled={busyId === p.user_id} onClick={() => reset(p)} className="inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl border border-[#d2d2d7] bg-white text-xs font-bold">
                    <KeyRound className="w-3.5 h-3.5" />
                    {T(ar, 'New password', 'كلمة مرور جديدة')}
                  </button>
                  {!mine && (
                    <button
                      type="button"
                      disabled={busyId === p.user_id}
                      onClick={() => void act(p.user_id, () => adminSetActive(p.user_id, !p.active))}
                      className={`inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl border text-xs font-bold ${p.active ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {p.active ? T(ar, 'Switch off', 'إيقاف') : T(ar, 'Switch on', 'تفعيل')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Fold>
  );
};
