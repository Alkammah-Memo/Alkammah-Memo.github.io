import React, { useState, useSyncExternalStore } from 'react';
import { Bell } from 'lucide-react';
import { Fold } from './Fold';
import { notifPrefs } from '../../lib/notifications';

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
  <div className="flex items-center justify-between gap-3 min-h-12">
    <div className="min-w-0">
      <div className="text-sm font-semibold text-[#1d1d1f]">{label}</div>
      {hint && <div className="text-xs text-[#6e6e73]">{hint}</div>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${on ? 'bg-[#34c759]' : 'bg-[#d2d2d7]'}`}
    >
      <span className={`absolute top-0.5 start-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5 rtl:-translate-x-5' : ''}`} />
    </button>
  </div>
);

export const NotificationSettings: React.FC<{ ar: boolean }> = ({ ar }) => {
  const prefs = useSyncExternalStore(notifPrefs.subscribe, notifPrefs.get);
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState<string>(supported ? Notification.permission : 'unsupported');

  const enableSystem = async () => {
    if (!supported) return;
    const res = await Notification.requestPermission();
    setPerm(res);
    notifPrefs.set({ system: res === 'granted' });
  };

  return (
    <Fold id="notifications" icon={<Bell className="w-5 h-5" />} title={ar ? 'الإشعارات والتنبيهات' : 'Notifications and alerts'}>
      <p className="text-xs text-[#515154] mb-2">
        {ar ? 'الجرس في أعلى الشاشة يعرض الجديد بإضاءة والمقروء بلون رمادي، والضغط على أي إشعار يفتح الاجتماع أو المهمة مباشرة.' : 'The bell at the top shows new items highlighted and read ones grayed out. Tapping one opens the meeting or task.'}
      </p>
      <div className="divide-y divide-[#ececf0]">
        <Switch on={prefs.meetings} onChange={(v) => notifPrefs.set({ meetings: v })} label={ar ? 'تنبيه قبل الاجتماع' : 'Meeting alerts'} />
        {prefs.meetings && (
          <div className="flex items-center justify-between gap-3 min-h-12">
            <label htmlFor="lead" className="text-sm text-[#1d1d1f]">{ar ? 'قبل الاجتماع بـ' : 'Alert before the meeting'}</label>
            <select
              id="lead"
              value={prefs.leadMinutes}
              onChange={(e) => notifPrefs.set({ leadMinutes: Number(e.target.value) })}
              className="h-10 px-3 rounded-xl border border-[#d2d2d7] bg-white text-sm"
            >
              {[5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {ar ? `${m} دقيقة` : `${m} min`}
                </option>
              ))}
            </select>
          </div>
        )}
        <Switch on={prefs.overdue} onChange={(v) => notifPrefs.set({ overdue: v })} label={ar ? 'المهام المتأخرة' : 'Overdue tasks'} hint={ar ? 'عند تجاوز تاريخ الاستحقاق' : 'When a task passes its due date'} />
        <Switch on={prefs.followups} onChange={(v) => notifPrefs.set({ followups: v })} label={ar ? 'تذكيرات المتابعة' : 'Follow-up reminders'} hint={ar ? 'عند حلول تاريخ المتابعة في المهمة' : 'When a task follow-up date arrives'} />
        <div className="py-3">
          <Switch
            on={prefs.system && perm === 'granted'}
            onChange={(v) => (v ? void enableSystem() : notifPrefs.set({ system: false }))}
            label={ar ? 'تنبيهات المتصفح والجهاز' : 'Browser / device alerts'}
            hint={
              perm === 'unsupported'
                ? ar ? 'غير مدعومة في هذا المتصفح' : 'Not supported in this browser'
                : perm === 'denied'
                ? ar ? 'محظورة؛ فعّلها من إعدادات الموقع في المتصفح' : 'Blocked; allow it in the site settings of the browser'
                : ar ? 'تظهر والتطبيق مفتوح. على الآيفون أضف الموقع إلى الشاشة الرئيسية أولاً.' : 'Shown while the app is open. On iPhone, add the site to the Home Screen first.'
            }
          />
        </div>
      </div>
    </Fold>
  );
};
