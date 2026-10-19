import React, { useRef, useState, useSyncExternalStore } from 'react';
import { Camera, Check, Loader2, Trash2, UserRound } from 'lucide-react';
import { Fold } from '../settings/Fold';
import { Avatar } from './Avatar';
import { getTeam, saveMyProfile, subscribeTeam } from '../../lib/team';
import { DriveError, MAX_PROFILE_BYTES, deleteFromDrive, imageUrl, shrinkImage, uploadToDrive } from '../../lib/drive';
import { reconnectGoogle } from '../../lib/googleCalendar';

const T = (ar: boolean, en: string, a: string) => (ar ? a : en);
const driveIdOf = (url: string) => {
  try {
    return new URL(url).searchParams.get('id') || '';
  } catch {
    return '';
  }
};
const input = 'w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-base sm:text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20';

export const ProfileSettings: React.FC<{ ar: boolean }> = ({ ar }) => {
  const team = useSyncExternalStore(subscribeTeam, getTeam);
  const me = team.profiles.find((p) => p.user_id === team.meId);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [birthday, setBirthday] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [needDrive, setNeedDrive] = useState<File | null>(null);
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
    setNeedDrive(null);
    try {
      const small = await shrinkImage(file, 640);
      const att = await uploadToDrive(small, { prefix: 'profile' });
      const old = driveIdOf(me.avatar_url);
      await saveMyProfile({ avatar_url: imageUrl(att.id, 480) });
      if (old) void deleteFromDrive(old);
      setMsg({ ok: true, text: T(ar, 'Picture updated. It is kept in your Google Drive, folder "Memo System".', 'تم تحديث الصورة. محفوظة في Google Drive الخاص بك داخل مجلد "Memo System".') });
    } catch (e) {
      if (e instanceof DriveError && (e.code === 'NOT_CONNECTED' || e.code === 'NO_PERMISSION')) setNeedDrive(file);
      else setMsg({ ok: false, text: String((e as Error).message) });
    } finally {
      setPhotoBusy(false);
    }
  };

  const allowDrive = () => {
    const f = needDrive;
    reconnectGoogle()
      .then(() => f && upload(f))
      .catch((e) => setMsg({ ok: false, text: String((e as Error).message) }));
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      const old = driveIdOf(me.avatar_url);
      await saveMyProfile({ avatar_url: '' });
      if (old) void deleteFromDrive(old);
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
          {T(ar, 'Up to 15 MB. The picture is stored in your own Google Drive (folder "Memo System"), not in the app database.', 'حتى 15 ميجابايت. تُحفظ الصورة في Google Drive الخاص بك (مجلد "Memo System") وليس في قاعدة بيانات التطبيق.')}
        </p>

        {needDrive && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
            <p>{T(ar, 'To keep your picture in your Google Drive, allow file storage once.', 'لحفظ صورتك في Google Drive، اسمح بتخزين الملفات مرة واحدة.')}</p>
            <button type="button" onClick={allowDrive} className="min-h-11 px-4 rounded-xl bg-[#1d1d1f] text-white text-sm font-bold">
              {T(ar, 'Allow Google Drive', 'السماح بـ Google Drive')}
            </button>
          </div>
        )}

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
        <div className="text-xs text-[#6e6e73]">
          {T(ar, 'E-mail', 'البريد الإلكتروني')}: <span dir="ltr">{me.email}</span> · {T(ar, 'Role', 'الدور')}: <b>{me.role === 'admin' ? T(ar, 'Administrator', 'مدير النظام') : me.role === 'manager' ? T(ar, 'Manager', 'مدير') : T(ar, 'Member', 'عضو')}</b>
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
