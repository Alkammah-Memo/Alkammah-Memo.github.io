import React, { useState } from 'react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Meeting } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { checkMeetingConflicts, cairoDateOf, cairoTimeOf, cairoLocalToIso, getCairoDateString } from '../../lib/cairoTime';
import { X, Calendar, Clock, MapPin, Users, AlertTriangle } from 'lucide-react';

interface MeetingModalProps {
  meeting: Meeting | null;
  initialDate?: string;
  initialStartTime?: string;
  allMeetings: Meeting[];
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onSave: (meetingData: Partial<Meeting>) => void;
  onDelete?: (id: string) => void;
}

export const MeetingModal: React.FC<MeetingModalProps> = ({
  meeting,
  initialDate,
  initialStartTime,
  allMeetings,
  isOpen,
  locale,
  onClose,
  onSave,
  onDelete,
}) => {
  const t = translations[locale];
  const ar = locale === 'ar';
  const [formError, setFormError] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const fromMinutes = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  // Next free one-hour slot on a Cairo calendar day (all times are Cairo wall time)
  const computeNextAvailableSlot = (targetDateStr: string, preferredStart?: string) => {
    if (preferredStart && /^\d{2}:\d{2}$/.test(preferredStart)) {
      const s = toMinutes(preferredStart);
      return { start: preferredStart, end: fromMinutes(Math.min(s + 60, 23 * 60 + 59)) };
    }
    const sameDay = allMeetings.filter((m) => cairoDateOf(m.start) === targetDateStr);
    if (sameDay.length === 0) return { start: '10:00', end: '11:00' };

    let maxEnd = 10 * 60;
    sameDay.forEach((m) => {
      const endPart = cairoTimeOf(m.end);
      if (endPart && cairoDateOf(m.end) === targetDateStr) maxEnd = Math.max(maxEnd, toMinutes(endPart));
    });
    // keep a valid (start < end) one-hour window inside the day
    const startMin = Math.min(maxEnd, 22 * 60 + 58);
    return { start: fromMinutes(startMin), end: fromMinutes(Math.min(startMin + 60, 23 * 60 + 59)) };
  };

  const resolveInitial = () => {
    const hasValid = !!meeting?.start && cairoDateOf(meeting.start) !== '';
    const date = hasValid ? cairoDateOf(meeting!.start) : initialDate || getCairoDateString();
    const slot = hasValid
      ? { start: cairoTimeOf(meeting!.start), end: cairoTimeOf(meeting!.end) || cairoTimeOf(meeting!.start) }
      : computeNextAvailableSlot(date, initialStartTime);
    return { date, slot };
  };

  const init = resolveInitial();
  const [title, setTitle] = useState(meeting?.title || '');
  const [description, setDescription] = useState(meeting?.description || '');
  const [startDate, setStartDate] = useState(init.date);
  const [startTime, setStartTime] = useState(init.slot.start);
  const [endTime, setEndTime] = useState(init.slot.end);
  const [location, setLocation] = useState(meeting?.location || '');
  const [attendees, setAttendees] = useState(meeting?.attendees?.join(', ') || '');
  const [agenda, setAgenda] = useState(meeting?.agenda || '');
  const [decisions, setDecisions] = useState(meeting?.decisions?.join('\n') || '');

  // Reset form every time the modal opens or a different meeting/date is requested
  React.useEffect(() => {
    if (!isOpen) return;
    const { date, slot } = resolveInitial();
    setTitle(meeting?.title || '');
    setDescription(meeting?.description || '');
    setStartDate(date);
    setStartTime(slot.start);
    setEndTime(slot.end);
    setLocation(meeting?.location || '');
    setAttendees(meeting?.attendees?.join(', ') || '');
    setAgenda(meeting?.agenda || '');
    setDecisions(meeting?.decisions?.join('\n') || '');
    setFormError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, meeting, initialDate, initialStartTime]);

  if (!isOpen) return null;

  // Real UTC instants for the Cairo wall-clock values in the form
  let startISO = '';
  let endISO = '';
  try {
    startISO = cairoLocalToIso(startDate, startTime);
    endISO = cairoLocalToIso(startDate, endTime);
  } catch {
    /* incomplete input: handled by validation */
  }
  const timeOrderValid = !!startISO && !!endISO && new Date(endISO).getTime() > new Date(startISO).getTime();

  const conflicts = timeOrderValid
    ? checkMeetingConflicts({ id: meeting?.id, start: startISO, end: endISO }, allMeetings)
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!startISO || !endISO) {
      setFormError(ar ? 'يرجى إدخال تاريخ ووقت صحيحين.' : 'Please enter a valid date and time.');
      return;
    }
    if (!timeOrderValid) {
      setFormError(ar ? 'يجب أن يكون وقت الانتهاء بعد وقت البدء.' : 'End time must be after the start time.');
      return;
    }

    onSave({
      ...(meeting || {}),
      title: title.trim(),
      description: description.trim(),
      start: startISO,
      end: endISO,
      timezone: 'Africa/Cairo',
      location: location.trim(),
      attendees: attendees
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      agenda: agenda.trim(),
      decisions: decisions
        .split('\n')
        .map((d) => d.trim())
        .filter(Boolean),
      syncState: meeting?.syncState || 'internal_only',
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-stone-200 overflow-hidden my-8">
        <div className="bg-white text-stone-900 px-6 py-4 flex items-center justify-between border-b border-stone-200">
          <div>
            <span className="text-[11px] font-mono uppercase text-[#0071e3] font-semibold">
              {meeting ? (ar ? 'تعديل اجتماع تنفيذي' : 'EDIT EXECUTIVE MEETING') : (ar ? 'جدولة اجتماع تنفيذي' : 'SCHEDULE EXECUTIVE MEETING')}
            </span>
            <h2 className="text-lg font-bold text-stone-900">
              {meeting?.title ? meeting.title : (locale === 'en' ? 'New Meeting' : 'اجتماع جديد')}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Conflict warning banner */}
          {conflicts.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 p-3 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">{t.conflictDetected}</span>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {locale === 'ar'
                    ? 'يمكنك إضافة أكثر من اجتماع في نفس اليوم. فقط يُرجى تعديل وقت البدء/الانتهاء لتجنب التداخل مع الاجتماعات التالية:'
                    : 'You can schedule multiple meetings on the same day. Adjust start/end time to avoid time overlap with:'}
                </p>
                <ul className="list-disc list-inside mt-1 space-y-0.5 font-medium">
                  {conflicts.map((c) => (
                    <li key={c.id}>
                      {c.title} ({cairoTimeOf(c.start)} - {cairoTimeOf(c.end)})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              {locale === 'en' ? 'Meeting Title *' : 'عنوان الاجتماع *'}
            </label>
            <input
              type="text"
              required
              value={title}
              autoFocus={!meeting}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={locale === 'ar' ? 'عنوان الاجتماع أو الجلسة الاستراتيجية...' : 'Meeting title or executive session...'}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:border-[#0071e3] font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Date (Cairo)' : 'التاريخ'}
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Start Time' : 'وقت البدء'}
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3] font-mono"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'End Time' : 'وقت الانتهاء'}
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Location / Video URL' : 'المكان / رابط الاتصال'}
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={locale === 'ar' ? 'قاعة الاجتماعات أو رابط الاتصال' : 'Boardroom / Video call link'}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Attendees (Comma separated)' : 'الحضور (مفصول بفاصلة)'}
              </label>
              <input
                type="text"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder={locale === 'ar' ? 'أسماء الحضور' : 'Attendee names'}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              {locale === 'en' ? 'Agenda & Discussion Items' : 'جدول الأعمال ونقاط النقاش'}
            </label>
            <textarea
              rows={3}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder={locale === 'ar' ? 'بنود جدول الأعمال...' : 'Meeting agenda items...'}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              {locale === 'en' ? 'Approved Decisions (1 per line)' : 'القرارات المعتمدة'}
            </label>
            <textarea
              rows={2}
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
              placeholder={locale === 'ar' ? 'القرارات والتوجيهات المعتمدة...' : 'Approved directives and key decisions...'}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none"
            />
          </div>

          {formError && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-3 py-2">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-stone-200">
            {meeting?.id && onDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-xl"
              >
                {t.delete}
              </button>
            ) : <div />}
            {meeting?.id && onDelete && (
              <ConfirmDialog
                open={confirmDelete}
                ar={ar}
                title={ar ? 'هل تريد حذف هذا الاجتماع؟' : 'Delete this meeting?'}
                detail={meeting.title}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => {
                  setConfirmDelete(false);
                  onDelete(meeting.id);
                  onClose();
                }}
              />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-xl"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs"
              >
                {t.save}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
