import React, { useEffect, useState } from 'react';
import { Check, DatabaseZap, Eye, EyeOff, KeyRound, Lock, ScanFace, ShieldCheck, Smartphone, TriangleAlert, Wifi } from 'lucide-react';
import { Fold } from './Fold';
import { biometricsAvailable, disableLock, enableLock, readLock, setLockTimeout, unlockWithBiometrics } from '../../lib/appLock';
import type { LockTimeout } from '../../lib/appLock';
import { changePassword, isCloudConfigured } from '../../lib/cloud';
import { passwordProblem } from '../../lib/passwordRules';

const T = (ar: boolean, en: string, a: string) => (ar ? a : en);

const Row: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <li className="flex items-center gap-2 text-sm">
    <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
      {ok ? <Check className="w-3 h-3" /> : <TriangleAlert className="w-3 h-3" />}
    </span>
    {label}
  </li>
);

const Card: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="rounded-2xl border border-[#e5e5ea] bg-[#fafafc] p-3.5">
    <div className="flex items-center gap-2 text-sm font-bold text-[#1d1d1f]">
      <span className="text-[#0071e3] shrink-0">{icon}</span>
      {title}
    </div>
    <p className="mt-1.5 text-[13px] leading-relaxed text-[#515154]">{children}</p>
  </div>
);

export const SecuritySettings: React.FC<{ ar: boolean; userEmail?: string | null }> = ({ ar, userEmail }) => {
  const [canBio, setCanBio] = useState<boolean | null>(null);
  const [lockOn, setLockOn] = useState<boolean>(() => readLock() !== null);
  const [timeout, setTimeoutState] = useState<LockTimeout>(() => readLock()?.timeout ?? 1);
  const [lockMsg, setLockMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lockBusy, setLockBusy] = useState(false);

  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void biometricsAvailable().then(setCanBio);
  }, []);

  const toggleLock = async () => {
    setLockMsg(null);
    setLockBusy(true);
    try {
      if (lockOn) {
        // turning it off asks for the face first, so a borrowed unlocked device cannot switch it off
        if (!(await unlockWithBiometrics())) throw new Error(T(ar, 'Face ID was not confirmed, so the lock stays on.', 'لم يتم تأكيد Face ID، لذلك سيبقى القفل مفعلاً.'));
        disableLock();
        setLockOn(false);
      } else {
        await enableLock(userEmail || 'owner', timeout);
        setLockOn(true);
        setLockMsg({ ok: true, text: T(ar, 'Face ID lock is on for this device.', 'تم تفعيل قفل Face ID على هذا الجهاز.') });
      }
    } catch (e) {
      const m = (e as Error)?.message || '';
      setLockMsg({ ok: false, text: /NotAllowed|cancel/i.test(m) || !m ? T(ar, 'It was cancelled or not confirmed.', 'تم الإلغاء أو لم يتم التأكيد.') : m });
    } finally {
      setLockBusy(false);
    }
  };

  const submitPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwBusy) return;
    setPwMsg(null);
    const problem = passwordProblem(pw);
    if (problem) return setPwMsg({ ok: false, text: T(ar, problem, 'استخدم 10 أحرف على الأقل مع حروف وأرقام.') });
    if (pw !== pw2) return setPwMsg({ ok: false, text: T(ar, 'The two new passwords do not match.', 'كلمتا المرور الجديدتان غير متطابقتين.') });
    if (pw === cur) return setPwMsg({ ok: false, text: T(ar, 'Choose a password different from the current one.', 'اختر كلمة مرور مختلفة عن الحالية.') });
    setPwBusy(true);
    try {
      await changePassword(cur, pw);
      setCur('');
      setPw('');
      setPw2('');
      setPwMsg({ ok: true, text: T(ar, 'Password changed. Use the new one next time you sign in.', 'تم تغيير كلمة المرور. استخدم الجديدة عند تسجيل الدخول المرة القادمة.') });
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error)?.message || T(ar, 'Could not change the password.', 'تعذر تغيير كلمة المرور.') });
    } finally {
      setPwBusy(false);
    }
  };

  const input = 'mt-1 w-full h-11 px-3 rounded-xl border border-[#d2d2d7] bg-white text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20';
  const https = typeof location !== 'undefined' && location.protocol === 'https:';

  return (
    <Fold id="security" icon={<ShieldCheck className="w-5 h-5" />} title={T(ar, 'Security & privacy', 'الأمان والخصوصية')}>
      <div className="space-y-5">
        {/* live status */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
          <div className="text-sm font-bold text-emerald-900 mb-2">{T(ar, 'Your protection right now', 'حالة الحماية الآن')}</div>
          <ul className="space-y-1.5 text-emerald-950">
            <Row ok={https} label={T(ar, 'Connection is encrypted (HTTPS)', 'الاتصال مشفّر (HTTPS)')} />
            <Row ok={isCloudConfigured && Boolean(userEmail)} label={T(ar, 'Signed in with your private account', 'تم تسجيل الدخول بحسابك الخاص')} />
            <Row ok={lockOn} label={lockOn ? T(ar, 'Face ID lock is on for this device', 'قفل Face ID مفعّل على هذا الجهاز') : T(ar, 'Face ID lock is off on this device (recommended: turn it on below)', 'قفل Face ID غير مفعّل على هذا الجهاز (يُفضّل تفعيله بالأسفل)')} />
            <Row ok label={T(ar, 'Only you can read your data (enforced by the database itself)', 'أنت فقط من يقرأ بياناتك (تفرضه قاعدة البيانات نفسها)')} />
          </ul>
        </div>

        {/* Face ID */}
        <div className="rounded-2xl border border-[#e5e5ea] p-3.5 space-y-3">
          <div className="flex items-start gap-3">
            <ScanFace className="w-6 h-6 text-[#0071e3] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{T(ar, 'Face ID / Touch ID lock', 'قفل Face ID / بصمة الإصبع')}</div>
              <p className="text-xs text-[#6e6e73] mt-0.5">
                {T(ar, 'A second lock on top of the password. When you open the app, it asks for your face or fingerprint first. Set it on each device you use.', 'قفل ثانٍ فوق كلمة المرور. عند فتح التطبيق يطلب وجهك أو بصمتك أولاً. فعّله على كل جهاز تستخدمه.')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={lockOn}
              disabled={lockBusy || canBio === false}
              onClick={toggleLock}
              className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-40 ${lockOn ? 'bg-emerald-500' : 'bg-[#c7c7cc]'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${lockOn ? 'start-[22px]' : 'start-0.5'}`} />
            </button>
          </div>
          {canBio === false && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
              {T(ar, 'This device or browser does not offer Face ID / Touch ID here. On iPhone and iPad use Safari or the home-screen app, with Face ID set up in Settings.', 'هذا الجهاز أو المتصفح لا يوفّر Face ID / البصمة هنا. على iPhone وiPad استخدم Safari أو تطبيق الشاشة الرئيسية مع إعداد Face ID في إعدادات الجهاز.')}
            </p>
          )}
          {lockOn && (
            <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#515154]">
              {T(ar, 'Ask again after being away for', 'اطلب مرة أخرى بعد الابتعاد لمدة')}
              <select
                value={timeout}
                onChange={(e) => {
                  const v = Number(e.target.value) as LockTimeout;
                  setTimeoutState(v);
                  setLockTimeout(v);
                }}
                className="h-10 rounded-xl border border-[#d2d2d7] bg-white px-2 text-sm"
              >
                <option value={0}>{T(ar, 'Every time I leave', 'كل مرة أغادر')}</option>
                <option value={1}>{T(ar, '1 minute', 'دقيقة')}</option>
                <option value={5}>{T(ar, '5 minutes', '5 دقائق')}</option>
                <option value={15}>{T(ar, '15 minutes', '15 دقيقة')}</option>
              </select>
            </label>
          )}
          {lockMsg && <p className={`text-xs rounded-xl p-2.5 border ${lockMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{lockMsg.text}</p>}
        </div>

        {/* Change password */}
        {isCloudConfigured && userEmail && (
          <form onSubmit={submitPw} className="rounded-2xl border border-[#e5e5ea] p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <KeyRound className="w-5 h-5 text-[#0071e3]" />
              {T(ar, 'Change password', 'تغيير كلمة المرور')}
            </div>
            <p className="text-xs text-[#6e6e73]">
              {T(ar, 'This account is shared by everyone who signs in with it, so after changing it, tell them the new password.', 'هذا الحساب مشترك بين كل من يسجّل الدخول به، لذلك بعد التغيير أخبرهم بكلمة المرور الجديدة.')}
            </p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              <label className="block text-xs font-semibold text-[#515154]">
                {T(ar, 'Current password', 'كلمة المرور الحالية')}
                <input type={showPw ? 'text' : 'password'} required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className={input} />
              </label>
              <label className="block text-xs font-semibold text-[#515154]">
                {T(ar, 'New password', 'كلمة المرور الجديدة')}
                <input type={showPw ? 'text' : 'password'} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
              </label>
              <label className="block text-xs font-semibold text-[#515154]">
                {T(ar, 'Repeat new password', 'أعد كتابة الجديدة')}
                <input type={showPw ? 'text' : 'password'} required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button type="button" onClick={() => setShowPw((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0071e3] min-h-9">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPw ? T(ar, 'Hide', 'إخفاء') : T(ar, 'Show', 'إظهار')}
              </button>
              <button type="submit" disabled={pwBusy} className="h-10 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-60">
                {T(ar, 'Save new password', 'حفظ كلمة المرور')}
              </button>
            </div>
            <p className="text-[11px] text-[#8e8e93]">{T(ar, 'At least 10 characters, with letters and numbers.', '10 أحرف على الأقل مع حروف وأرقام.')}</p>
            {pwMsg && <p className={`text-xs rounded-xl p-2.5 border ${pwMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{pwMsg.text}</p>}
          </form>
        )}

        {/* plain-language explanation */}
        <div>
          <div className="text-sm font-bold mb-2">{T(ar, 'How this app keeps your information safe', 'كيف يحمي التطبيق معلوماتك')}</div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <Card icon={<Lock className="w-4 h-4" />} title={T(ar, '1. A locked front door', '1. باب مقفل')}>
              {T(ar, 'Nobody can open the app without your e-mail and password. Your password is never kept in readable form anywhere. The sign-in service stores only a scrambled version that cannot be turned back into the password.', 'لا أحد يستطيع فتح التطبيق بدون بريدك وكلمة مرورك. كلمة المرور لا تُحفظ في أي مكان بصيغة مقروءة، فالخدمة تحتفظ بنسخة مُشفَّرة لا يمكن إعادتها إلى كلمة المرور.')}
            </Card>
            <Card icon={<ScanFace className="w-4 h-4" />} title={T(ar, '2. A second lock: your face', '2. قفل ثانٍ: وجهك')}>
              {T(ar, 'With Face ID on, even someone holding your unlocked iPad or iPhone cannot open the app. Your face or fingerprint stays inside the device; the app is only told "yes" or "no".', 'مع تفعيل Face ID، حتى من يمسك جهازك مفتوحاً لا يستطيع فتح التطبيق. وجهك أو بصمتك تبقى داخل الجهاز، والتطبيق يعرف فقط "نعم" أو "لا".')}
            </Card>
            <Card icon={<DatabaseZap className="w-4 h-4" />} title={T(ar, '3. Your data belongs only to you', '3. بياناتك لك وحدك')}>
              {T(ar, 'Every note, task and meeting is tagged with your account, and the database itself refuses to show it to anyone else. This is enforced inside the database, not just in the app, so it cannot be skipped by tampering with the app.', 'كل ملاحظة ومهمة واجتماع موسوم بحسابك، وقاعدة البيانات نفسها ترفض عرضه لأي شخص آخر. هذا مفروض داخل قاعدة البيانات وليس في التطبيق فقط، فلا يمكن تجاوزه بالعبث بالتطبيق.')}
            </Card>
            <Card icon={<Wifi className="w-4 h-4" />} title={T(ar, '4. Encrypted on the way and at rest', '4. تشفير أثناء النقل وفي التخزين')}>
              {T(ar, 'Everything travels over an encrypted connection (the padlock you see in a browser), and the stored data is encrypted by the cloud provider. Anyone listening on Wi-Fi sees only scrambled data.', 'كل شيء ينتقل عبر اتصال مشفّر (القفل الذي تراه في المتصفح)، والبيانات المخزّنة مشفّرة لدى مزوّد السحابة. من يتنصّت على الواي فاي لا يرى إلا بيانات مبعثرة.')}
            </Card>
            <Card icon={<KeyRound className="w-4 h-4" />} title={T(ar, '5. No passwords or keys hidden in the code', '5. لا كلمات مرور أو مفاتيح داخل الكود')}>
              {T(ar, 'The app\'s code was checked for stored passwords, keys and tokens and none are inside it. The one truly secret Google key lives only on the server and is never sent to any screen. Your AI keys are saved only in your private settings.', 'تم فحص كود التطبيق بحثاً عن كلمات مرور ومفاتيح ورموز ولا يوجد أي منها داخله. مفتاح Google السري الوحيد موجود على الخادم فقط ولا يُرسل لأي شاشة. مفاتيح الذكاء الاصطناعي محفوظة في إعداداتك الخاصة فقط.')}
            </Card>
            <Card icon={<ShieldCheck className="w-4 h-4" />} title={T(ar, '6. Strict browser rules', '6. قواعد صارمة للمتصفح')}>
              {T(ar, 'The app is only allowed to talk to a short list of approved services and to run its own code. That blocks injected scripts and data theft to unknown sites. It also refuses to be shown inside another website.', 'التطبيق مسموح له فقط بالتواصل مع قائمة قصيرة من الخدمات المعتمدة وتشغيل كوده الخاص. هذا يمنع السكربتات المحقونة وسرقة البيانات إلى مواقع مجهولة، ويرفض أيضاً أن يُعرض داخل موقع آخر.')}
            </Card>
            <Card icon={<Smartphone className="w-4 h-4" />} title={T(ar, '7. Google Calendar: limited access', '7. تقويم Google: صلاحية محدودة')}>
              {T(ar, 'The app can only read and write calendar events and see your e-mail address. It cannot read your e-mails, contacts or files. You can disconnect it any time from the Google Calendar card.', 'يستطيع التطبيق فقط قراءة وكتابة أحداث التقويم ورؤية عنوان بريدك. لا يستطيع قراءة رسائلك أو جهات اتصالك أو ملفاتك. يمكنك فصله في أي وقت من بطاقة تقويم Google.')}
            </Card>
            <Card icon={<KeyRound className="w-4 h-4" />} title={T(ar, '8. Safe password recovery', '8. استرجاع آمن لكلمة المرور')}>
              {T(ar, 'If the password is forgotten, a one-time link is e-mailed to the account owner. Changing the password inside the app needs the current password first.', 'عند نسيان كلمة المرور يُرسل رابط لمرة واحدة إلى بريد صاحب الحساب. وتغيير كلمة المرور داخل التطبيق يتطلب كتابة الحالية أولاً.')}
            </Card>
          </div>
        </div>

        {/* honest limits */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <TriangleAlert className="w-4 h-4" />
            {T(ar, 'An honest word', 'كلمة صريحة')}
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-950">
            {T(ar, 'No online system in the world can honestly promise to be "unhackable". This app is built the way professional systems are, so that breaking in is very hard and what is stored is useless to a stranger. The weak point left is always people: a shared or guessed password, a fake e-mail asking you to sign in, or a phone left unlocked.', 'لا يوجد نظام على الإنترنت يستطيع أن يعد بصدق بأنه "غير قابل للاختراق". هذا التطبيق مبني بالطريقة التي تُبنى بها الأنظمة الاحترافية، بحيث يكون الاختراق صعباً جداً وما هو مخزّن بلا فائدة لغريب. نقطة الضعف المتبقية دائماً هي الأشخاص: كلمة مرور مشتركة أو متوقعة، أو رسالة مزيفة تطلب تسجيل الدخول، أو هاتف متروك مفتوحاً.')}
          </p>
          <ul className="mt-2 space-y-1 text-[13px] text-amber-950 list-disc ps-5">
            <li>{T(ar, 'Turn on the Face ID lock on every device.', 'فعّل قفل Face ID على كل جهاز.')}</li>
            <li>{T(ar, 'Use a long password nobody could guess, and never reuse it elsewhere.', 'استخدم كلمة مرور طويلة لا يمكن تخمينها ولا تكررها في أي مكان آخر.')}</li>
            <li>{T(ar, 'Turn on 2-Step Verification on the Gmail account, because it receives password-reset links.', 'فعّل التحقق بخطوتين على حساب Gmail لأنه يستقبل روابط استرجاع كلمة المرور.')}</li>
            <li>{T(ar, 'Never sign in from a link sent to you by e-mail or chat. Open the app from your own bookmark or home-screen icon.', 'لا تسجّل الدخول من رابط وصلك بالبريد أو الرسائل. افتح التطبيق من العلامة المرجعية أو أيقونة الشاشة الرئيسية.')}</li>
            <li>{T(ar, 'Sign out on any shared or borrowed device.', 'سجّل الخروج على أي جهاز مشترك أو مستعار.')}</li>
          </ul>
        </div>
      </div>
    </Fold>
  );
};
