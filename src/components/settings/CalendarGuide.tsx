import React from 'react';
import { ArrowLeftRight, Check, Plus, Trash2, X } from 'lucide-react';
import { Fold } from './Fold';

const T = (ar: boolean, en: string, a: string) => (ar ? a : en);

const Rule: React.FC<{ icon: React.ReactNode; tone: string; title: string; children: React.ReactNode }> = ({ icon, tone, title, children }) => (
  <div className="rounded-2xl border border-[#e5e5ea] bg-[#fafafc] p-3.5">
    <div className="flex items-center gap-2 text-sm font-bold text-[#1d1d1f]">
      <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0 ${tone}`}>{icon}</span>
      {title}
    </div>
    <div className="mt-1.5 text-[13px] leading-relaxed text-[#515154] space-y-1.5">{children}</div>
  </div>
);

/** A picture and plain rules for how the system, Google and Outlook calendars follow each other. */
export const CalendarGuide: React.FC<{ ar: boolean }> = ({ ar }) => {
  const f = 'system-ui, -apple-system, sans-serif';
  return (
    <Fold id="calguide" icon={<ArrowLeftRight className="w-5 h-5" />} title={T(ar, 'How my calendars work together', 'كيف تعمل التقاويم معاً')}>
      <p className="text-xs text-[#515154] mb-3">
        {T(ar, 'One picture, then three simple rules: where to add a meeting, where to delete it, and what cannot be changed.', 'صورة واحدة ثم ثلاث قواعد بسيطة: أين تضيف الاجتماع، وأين تحذفه، وما الذي لا يمكن تغييره.')}
      </p>

      <div className="rounded-2xl border border-[#e5e5ea] bg-white p-2 sm:p-3 overflow-hidden" dir="ltr">
        <svg viewBox="0 0 680 350" role="img" aria-label={T(ar, 'Diagram of how the system, Google Calendar and Outlook follow each other', 'رسم يوضح كيف يتبع النظام وتقويم Google وOutlook بعضها')} className="w-full h-auto" style={{ fontFamily: f }}>
          <defs>
            <marker id="cgArrG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#1f9d55" />
            </marker>
            <marker id="cgArrO" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#d97706" />
            </marker>
          </defs>
          <rect x="0" y="0" width="680" height="350" rx="14" fill="#ffffff" />

          {/* three linked boxes */}
          <rect x="10" y="40" width="190" height="96" rx="16" fill="#eef5ff" stroke="#0071e3" strokeWidth="2" />
          <text x="105" y="78" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0b3d75">{T(ar, 'The system', 'النظام')}</text>
          <text x="105" y="100" textAnchor="middle" fontSize="12" fill="#355f8f">Alkammah Memo</text>
          <text x="105" y="120" textAnchor="middle" fontSize="11" fill="#355f8f">{T(ar, 'add · change · delete', 'إضافة · تعديل · حذف')}</text>

          <rect x="245" y="40" width="190" height="96" rx="16" fill="#eefaf2" stroke="#1f9d55" strokeWidth="2" />
          <text x="340" y="78" textAnchor="middle" fontSize="16" fontWeight="700" fill="#14532d">{T(ar, 'Google Calendar', 'تقويم Google')}</text>
          <text x="340" y="100" textAnchor="middle" fontSize="12" fill="#2f6b47">Gmail account</text>
          <text x="340" y="120" textAnchor="middle" fontSize="11" fill="#2f6b47">{T(ar, 'the middle point', 'نقطة الوصل')}</text>

          <rect x="480" y="40" width="190" height="96" rx="16" fill="#eef5ff" stroke="#0071e3" strokeWidth="2" />
          <text x="575" y="78" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0b3d75">Outlook</text>
          <text x="575" y="100" textAnchor="middle" fontSize="12" fill="#355f8f">{T(ar, 'Gmail calendar inside Outlook', 'تقويم Gmail داخل Outlook')}</text>
          <text x="575" y="120" textAnchor="middle" fontSize="11" fill="#355f8f">{T(ar, 'add · change · delete', 'إضافة · تعديل · حذف')}</text>

          {/* two-way arrows */}
          <line x1="204" y1="88" x2="241" y2="88" stroke="#1f9d55" strokeWidth="4" markerStart="url(#cgArrG)" markerEnd="url(#cgArrG)" />
          <line x1="439" y1="88" x2="476" y2="88" stroke="#1f9d55" strokeWidth="4" markerStart="url(#cgArrG)" markerEnd="url(#cgArrG)" />
          <text x="222" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1f9d55">{T(ar, 'both ways', 'في الاتجاهين')}</text>
          <text x="457" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1f9d55">{T(ar, 'both ways', 'في الاتجاهين')}</text>
          <text x="222" y="158" textAnchor="middle" fontSize="10" fill="#6e6e73">{T(ar, 'seconds → minutes', 'ثوانٍ ← دقائق')}</text>
          <text x="457" y="158" textAnchor="middle" fontSize="10" fill="#6e6e73">{T(ar, 'minutes', 'دقائق')}</text>

          {/* work calendar, one way and read-only */}
          <rect x="480" y="222" width="190" height="90" rx="16" fill="#fff6e8" stroke="#d97706" strokeWidth="2" />
          <text x="575" y="258" textAnchor="middle" fontSize="15" fontWeight="700" fill="#7c3f00">{T(ar, 'Outlook work calendar', 'تقويم العمل في Outlook')}</text>
          <text x="575" y="280" textAnchor="middle" fontSize="11" fill="#8a5a1b">{T(ar, 'meetings made at work', 'اجتماعات تُنشأ في العمل')}</text>
          <text x="575" y="298" textAnchor="middle" fontSize="11" fill="#8a5a1b">{T(ar, 'or sent to you by others', 'أو يرسلها لك الآخرون')}</text>
          <path d="M476 267 H105 V142" fill="none" stroke="#d97706" strokeWidth="3.5" strokeDasharray="8 6" markerEnd="url(#cgArrO)" />
          <text x="290" y="258" textAnchor="middle" fontSize="11" fontWeight="700" fill="#b45309">{T(ar, 'one way, read-only copy', 'اتجاه واحد، نسخة للقراءة فقط')}</text>
          <text x="290" y="290" textAnchor="middle" fontSize="10" fill="#6e6e73">{T(ar, 'refreshes about every 15 minutes', 'تتحدّث كل 15 دقيقة تقريباً')}</text>

          {/* legend */}
          <line x1="20" y1="332" x2="52" y2="332" stroke="#1f9d55" strokeWidth="4" />
          <text x="60" y="336" fontSize="11" fill="#444">{T(ar, 'change it on either side, both follow', 'غيّر من أي طرف ويتبعه الآخر')}</text>
          <line x1="330" y1="332" x2="362" y2="332" stroke="#d97706" strokeWidth="3.5" strokeDasharray="6 4" />
          <text x="370" y="336" fontSize="11" fill="#444">{T(ar, 'only shown here, change it in Outlook', 'تظهر هنا فقط، عدّلها من Outlook')}</text>
        </svg>
      </div>

      <div className="grid sm:grid-cols-3 gap-2.5 mt-3">
        <Rule icon={<Plus className="w-4 h-4" />} tone="bg-emerald-100 text-emerald-700" title={T(ar, 'Add a meeting', 'إضافة اجتماع')}>
          <p>{T(ar, 'Add it in the system. It appears in Google and in Outlook by itself.', 'أضفه في النظام. يظهر في Google وفي Outlook تلقائياً.')}</p>
          <p>{T(ar, 'A meeting made in Outlook\'s own work calendar shows here too, but only for reading.', 'اجتماع يُنشأ في تقويم العمل في Outlook يظهر هنا أيضاً لكن للقراءة فقط.')}</p>
        </Rule>
        <Rule icon={<Trash2 className="w-4 h-4" />} tone="bg-rose-100 text-rose-700" title={T(ar, 'Delete a meeting', 'حذف اجتماع')}>
          <p>
            <b>{T(ar, 'Made in the system or Google:', 'أُنشئ في النظام أو Google:')}</b>{' '}
            {T(ar, 'delete it in the system. It disappears from Google and Outlook too. Deleting it in Google or in Outlook\'s Gmail calendar removes it here as well.', 'احذفه من النظام فيختفي من Google وOutlook أيضاً. وحذفه من Google أو من تقويم Gmail داخل Outlook يزيله من هنا أيضاً.')}
          </p>
          <p>
            <b>{T(ar, 'Made in Outlook\'s work calendar:', 'أُنشئ في تقويم العمل بـ Outlook:')}</b>{' '}
            {T(ar, 'delete it only in Outlook. Its copy here disappears by itself soon after.', 'احذفه من Outlook فقط. وتختفي نسخته هنا تلقائياً بعد قليل.')}
          </p>
        </Rule>
        <Rule icon={<X className="w-4 h-4" />} tone="bg-amber-100 text-amber-800" title={T(ar, 'What cannot be done', 'ما لا يمكن فعله')}>
          <p>{T(ar, 'Outlook work-calendar meetings cannot be edited or deleted from the system. Open one here and it says "read-only".', 'لا يمكن تعديل أو حذف اجتماعات تقويم العمل من النظام. عند فتح أحدها يظهر "للقراءة فقط".')}</p>
          <p>{T(ar, 'Declining an invite in Outlook does not delete the meeting for everyone.', 'رفض دعوة في Outlook لا يحذف الاجتماع للجميع.')}</p>
        </Rule>
      </div>

      <div className="mt-3 rounded-2xl border border-[#e5e5ea] bg-white overflow-hidden">
        <div className="grid grid-cols-[1.1fr_1fr_1fr] text-[11px] font-bold bg-[#f5f5f7] text-[#6e6e73]">
          <div className="p-2.5">{T(ar, 'Where was it made?', 'أين أُنشئ؟')}</div>
          <div className="p-2.5">{T(ar, 'Delete it in', 'احذفه من')}</div>
          <div className="p-2.5">{T(ar, 'Result', 'النتيجة')}</div>
        </div>
        {[
          [T(ar, 'The system', 'النظام'), T(ar, 'the system (best)', 'النظام (الأفضل)'), T(ar, 'gone in Google and Outlook', 'يختفي من Google وOutlook')],
          [T(ar, 'Google / Outlook Gmail calendar', 'Google أو تقويم Gmail في Outlook'), T(ar, 'either of them', 'أي منهما'), T(ar, 'gone everywhere, here within minutes', 'يختفي في كل مكان، وهنا خلال دقائق')],
          [T(ar, 'Outlook work calendar', 'تقويم العمل في Outlook'), T(ar, 'Outlook only', 'Outlook فقط'), T(ar, 'gone here by itself', 'يختفي هنا تلقائياً')],
        ].map((r, i) => (
          <div key={i} className="grid grid-cols-[1.1fr_1fr_1fr] text-[12px] border-t border-[#ececf0] text-[#1d1d1f]">
            <div className="p-2.5 font-semibold">{r[0]}</div>
            <div className="p-2.5">{r[1]}</div>
            <div className="p-2.5 text-[#515154] flex items-start gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{r[2]}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] text-[#8e8e93]">
        {T(ar, 'Tip: the first time, try it with a test meeting. Changes made in Google or Outlook can take a few minutes to appear here.', 'نصيحة: جرّب أول مرة باجتماع تجريبي. التغييرات التي تتم في Google أو Outlook قد تستغرق دقائق لتظهر هنا.')}
      </p>
    </Fold>
  );
};
