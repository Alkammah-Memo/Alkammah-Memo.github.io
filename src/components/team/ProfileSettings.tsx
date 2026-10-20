import React, { useRef, useState, useSyncExternalStore } from 'react';
import { Camera, Check, Loader2, Trash2, UserRound } from 'lucide-react';
import { Fold } from '../settings/Fold';
import { Avatar } from './Avatar';
import { getTeam, saveMyProfile, subscribeTeam } from '../../lib/team';
import { getFemalePref, setFemalePref, subscribeFemalePref } from '../../lib/ai/speroUser';
import { savePref } from '../../lib/cloud';
import { MAX_PROFILE_BYTES, deleteFile, shrinkImage, uploadFile } from '../../lib/files';

const T = (ar: boolean, en: string, a: string) => (ar ? a : en);
const input = 'w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-base sm:text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20';

export const ProfileSettings: React.FC<{ ar: boolean }> = ({ ar }) => {
  const team = useSyncExternalStore(subscribeTeam, getTeam);
  const female = useSyncExternalStore(subscribeFemalePref, getFemalePref);
  const me = team.profiles.find((p) => p.user_id === team.meId);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [birthday, setBirthday] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!me) return null;
  const nameV = name ?? me.display_name;
  const phoneV = phone ?? me.phone;
  const bdV = birthday ?? me.birthday;
  const dirty = nameV !== me.display_name || phoneV !== me.phone || bdV !== me.birthday;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await saveMyProfile({ display_name: nameV.trim(), phone: phoneV.trim(), birthday: bdV });
      setName(null);
      setPhone(null);
      setBirthday(null);
      setMsg({ ok: true, text: T(ar, 'Profile saved.', 'تم حفظ الملف الشخصي.') });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setMsg(null);
    if (file.size > MAX_PROFILE_BYTES) return setMsg({ ok: false, text: T(ar, 'The picture is bigger than 15 MB. Choose a smaller one.', 'الصورة أكبر من 15 ميجابايت. اختر صورة أصغر.') });
    if (!file.type.startsWith('image/')) return setMsg({ ok: false, text: T(ar, 'Please choose a picture.', 'الرجاء اختيار صورة.') });
    setPhotoBusy(true);
    try {
      // squeezed to a small square-ish picture: about 20-40 KB instead of megabytes
      const small = await shrinkImage(file, 400, 0.72);
      const att = await uploadFile(small, { maxBytes: 2 * 1024 * 1024 });
      const old = me.avatar_url;
      await saveMyProfile({ avatar_url: att.id });
      if (old) void deleteFile(old);
      setMsg({ ok: true, text: T(ar, 'Picture updated.', 'تم تحديث الصورة.') });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message) });
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      const old = me.avatar_url;
      await saveMyProfile({ avatar_url: '' });
      if (old) void deleteFile(old);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Fold id="profile" icon={<UserRound className="w-5 h-5" />} title={T(ar, 'My profile', 'ملفي الشخصي')} defaultOpen>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar person={me} size={84} />
            {photoBusy && (
              <span className="absolute inset-0 rounded-full bg-white/70 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#0071e3]" />
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <button
              type="button"
              disabled={photoBusy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              {T(ar, 'Change picture', 'تغيير الصورة')}
            </button>
            {me.avatar_url && (
              <button type="button" disabled={photoBusy} onClick={removePhoto} className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 min-h-9 self-start">
                <Trash2 className="w-3.5 h-3.5" />
                {T(ar, 'Remove picture', 'إزالة الصورة')}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void upload(f);
              }}
            />
          </div>
        </div>
        <p className="text-xs text-[#6e6e73] leading-relaxed">
          {T(ar, 'Any picture up to 15 MB. It is shrunk automatically and kept privately for your team.', 'أي صورة حتى 15 ميجابايت. تُصغَّر تلقائياً وتُحفظ بشكل خاص لفريقك.')}
        </p>

        <label className="block space-y-1">
          <span className="text-xs font-bold text-[#515154]">{T(ar, 'Name shown to the team', 'الاسم الظاهر للفريق')}</span>
          <input className={input} value={nameV} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-[#515154]">{T(ar, 'Phone number', 'رقم الهاتف')}</span>
          <input className={input} value={phoneV} maxLength={40} inputMode="tel" onChange={(e) => setPhone(e.target.value)} autoComplete="tel" dir="ltr" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-[#515154]">{T(ar, 'Birthday (the team is reminded on the day)', 'تاريخ الميلاد (يُذكَّر الفريق في يومه)')}</span>
          <input className={input} type="date" value={bdV} min="1930-01-01" max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthday(e.target.value)} />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-bold text-[#515154]">{T(ar, 'Spero speaks to me as', 'يخاطبني سبيرو بصيغة')}</span>
          <div className="flex gap-1 rounded-xl border border-[#d2d2d7] bg-white p-1 text-sm font-bold max-w-xs">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => {
                  setFemalePref(v);
                  void savePref('speroFemale', v);
                }}
                className={`flex-1 min-h-10 rounded-lg ${female === v ? 'bg-[#0071e3] text-white' : 'text-[#515154]'}`}
              >
                {v ? T(ar, 'She / her', 'المؤنث') : T(ar, 'He / him', 'المذكر')}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-[#6e6e73]">
          {T(ar, 'E-mail', 'البريد الإلكتروني')}: <span dir="ltr">{me.email}</span> · {T(ar, 'Role', 'الدور')}: <b>{me.role === 'admin' ? T(ar, 'Administrator', 'مدير النظام') : T(ar, 'Manager', 'مدير')}</b>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" disabled={!dirty || busy} onClick={save} className="inline-flex items-center gap-2 min-h-11 px-5 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {T(ar, 'Save profile', 'حفظ الملف')}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</span>}
        </div>
      </div>
    </Fold>
  );
};
