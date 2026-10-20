import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, FileText, Loader2, MessageSquarePlus, Paperclip, Search, Send, Trash2, Users, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { broadcast, createGroup, deleteMessage, getTeam, loadMessages, markRead, nameOf, openDirect, sendMessage, subscribeTeam } from '../../lib/team';
import type { ChatMessage, ChatThread, Profile } from '../../lib/team';
import { MAX_FILE_BYTES, deleteFile, openAttachment, shrinkImage, uploadFile, useSignedUrl } from '../../lib/files';
import type { Attachment } from '../../lib/files';

const T = (ar: boolean, en: string, a: string) => (ar ? a : en);
const input = 'w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-2.5 text-base sm:text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20';
const prettySize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function timeLabel(iso: string, ar: boolean): string {
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same
    ? d.toLocaleTimeString(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
    : d.toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' });
}

/** a stored picture (private link prepared on demand) */
const Pic: React.FC<{ path: string; alt: string; className?: string }> = ({ path, alt, className }) => {
  const url = useSignedUrl(path);
  return url ? <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={className} /> : <span className={`block animate-pulse bg-black/10 ${className || ''}`} style={{ width: 160, height: 120 }} />;
};

// ------------------------------------------------------------------ one message
const Bubble: React.FC<{ m: ChatMessage; mine: boolean; sender?: Profile; showName: boolean; ar: boolean }> = ({ m, mine, sender, showName, ar }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await deleteMessage(m);
      m.attachments.forEach((a) => void deleteFile(a.id));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && <Avatar person={sender} size={30} className="mt-5" />}
      <div className={`max-w-[82%] sm:max-w-[70%] min-w-0 ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        {showName && !mine && <span className="text-[11px] font-bold text-[#6e6e73] mb-0.5 px-1">{nameOf(sender)}</span>}
        <div
          onClick={() => mine && setOpen((o) => !o)}
          className={`rounded-2xl px-3 py-2 text-[15px] sm:text-sm leading-snug break-words whitespace-pre-wrap ${mine ? 'bg-[#0071e3] text-white rounded-te-md' : 'bg-white border border-[#e5e5ea] text-[#1d1d1f] rounded-ts-md'}`}
        >
          {m.attachments.map((a) =>
            a.kind === 'image' ? (
              <button key={a.id} type="button" onClick={(e) => { e.stopPropagation(); void openAttachment(a); }} className="block mb-1.5 -mx-1">
                <Pic path={a.id} alt={a.name} className="rounded-xl max-h-72 w-auto max-w-full object-cover bg-black/5" />
              </button>
            ) : (
              <button
                key={a.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void openAttachment(a);
                }}
                className={`flex items-center gap-2 rounded-xl px-2.5 py-2 mb-1.5 text-start ${mine ? 'bg-white/20' : 'bg-[#f5f5f7]'}`}
              >
                <FileText className="w-5 h-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <span className="block text-[11px] opacity-70">{prettySize(a.size)}</span>
                </span>
              </button>
            )
          )}
          {m.body}
        </div>
        <div className="flex items-center gap-2 px-1 mt-0.5 text-[10px] text-[#8e8e93]">
          {timeLabel(m.created_at, ar)}
          {mine && open && (
            <button type="button" disabled={busy} onClick={remove} className="inline-flex items-center gap-1 text-rose-700 font-bold min-h-8 px-1">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {T(ar, 'Delete', 'حذف')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ composer (text + files)
const Composer: React.FC<{ ar: boolean; onSend: (body: string, files: Attachment[]) => Promise<void>; placeholder?: string; autoFocus?: boolean }> = ({ ar, onSend, placeholder, autoFocus }) => {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [text]);

  const addFiles = async (list: File[]) => {
    setErr('');
    for (const f of list.slice(0, 5)) {
      if (f.size > MAX_FILE_BYTES) {
        setErr(T(ar, `"${f.name}" is bigger than 8 MB.`, `"${f.name}" أكبر من 8 ميجابايت.`));
        continue;
      }
      setUploading((n) => n + 1);
      try {
        // photos are squeezed hard (about 100-200 KB each); other files are stored as they are, up to 8 MB
        const ready = f.type.startsWith('image/') ? await shrinkImage(f, 1280, 0.6) : f;
        const att = await uploadFile(ready);
        setFiles((cur) => [...cur, { ...att, name: f.name }]);
      } catch (e) {
        setErr(String((e as Error).message));
        break;
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && files.length === 0) || sending || uploading) return;
    setSending(true);
    setErr('');
    try {
      await onSend(body, files);
      setText('');
      setFiles([]);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-[#e5e5ea] bg-white/95 p-2 sm:p-3 space-y-2">
      {(files.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2">
          {files.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5 rounded-lg bg-[#f5f5f7] border border-[#e5e5ea] ps-1 pe-1 py-1 text-xs max-w-full">
              {a.kind === 'image' ? <Pic path={a.id} alt="" className="w-8 h-8 rounded object-cover" /> : <FileText className="w-4 h-4 ms-1" />}
              <span className="truncate max-w-32">{a.name}</span>
              <button type="button" aria-label={T(ar, 'Remove', 'إزالة')} className="min-h-8 min-w-8 inline-flex items-center justify-center" onClick={() => { setFiles((c) => c.filter((x) => x.id !== a.id)); void deleteFile(a.id); }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          {uploading > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#6e6e73] px-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {T(ar, 'Uploading…', 'جارٍ الرفع…')}
            </span>
          )}
        </div>
      )}
      {err && <p className="text-xs text-rose-700">{err}</p>}
      <div className="flex items-end gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="shrink-0 min-h-11 min-w-11 rounded-xl border border-[#d2d2d7] bg-white inline-flex items-center justify-center text-[#515154]" aria-label={T(ar, 'Attach', 'إرفاق')}>
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const l = Array.from(e.target.files || []);
            e.target.value = '';
            if (l.length) void addFiles(l);
          }}
        />
        <textarea
          ref={taRef}
          rows={1}
          autoFocus={autoFocus}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia?.('(pointer: fine)').matches) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={placeholder || T(ar, 'Write a message…', 'اكتب رسالة…')}
          className={`${input} resize-none max-h-36`}
        />
        <button
          type="button"
          disabled={sending || uploading > 0 || (!text.trim() && files.length === 0)}
          onClick={send}
          className="shrink-0 min-h-11 min-w-11 rounded-xl bg-[#0071e3] text-white inline-flex items-center justify-center disabled:opacity-40"
          aria-label={T(ar, 'Send', 'إرسال')}
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className={`w-5 h-5 ${ar ? '-scale-x-100' : ''}`} />}
        </button>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ new chat sheet
const NewChat: React.FC<{ ar: boolean; people: Profile[]; canBroadcast: boolean; onClose: () => void; onOpen: (threadId: string) => void }> = ({ ar, people, canBroadcast, onClose, onOpen }) => {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<'group' | 'each'>(canBroadcast ? 'each' : 'group');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const list = people.filter((p) => !q.trim() || (nameOf(p) + ' ' + p.email).toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      if (picked.length === 1) return onOpen(await openDirect(picked[0]));
      if (mode === 'group') return onOpen(await createGroup(title.trim(), picked));
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (done) return null;
  return (
    <div className="absolute inset-0 z-20 bg-[#f5f5f7] flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-[#e5e5ea] bg-white">
        <button type="button" onClick={onClose} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl" aria-label={T(ar, 'Back', 'رجوع')}>
          {ar ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </button>
        <h2 className="font-bold text-base">{T(ar, 'New message', 'رسالة جديدة')}</h2>
        {picked.length > 0 && <span className="text-xs text-[#6e6e73]">{picked.length} {T(ar, 'selected', 'محدد')}</span>}
      </div>
      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        <div className="relative">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-[#8e8e93]" />
          <input className={`${input} ps-9`} placeholder={T(ar, 'Search people', 'ابحث عن شخص')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {people.length > 1 && (
          <button type="button" className="text-xs font-bold text-[#0071e3] min-h-9" onClick={() => setPicked(picked.length === people.length ? [] : people.map((p) => p.user_id))}>
            {picked.length === people.length ? T(ar, 'Clear selection', 'إلغاء التحديد') : T(ar, 'Select everyone', 'تحديد الجميع')}
          </button>
        )}
        <ul className="space-y-1.5">
          {list.map((p) => {
            const on = picked.includes(p.user_id);
            return (
              <li key={p.user_id}>
                <button type="button" onClick={() => toggle(p.user_id)} className={`w-full flex items-center gap-3 rounded-2xl border px-3 min-h-14 text-start ${on ? 'border-[#0071e3] bg-[#0071e3]/5' : 'border-[#e5e5ea] bg-white'}`}>
                  <Avatar person={p} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-sm truncate">{nameOf(p)}</span>
                    <span className="block text-xs text-[#6e6e73] truncate" dir="ltr">{p.email}</span>
                  </span>
                  <span className={`w-6 h-6 rounded-full border-2 inline-flex items-center justify-center ${on ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'border-[#c7c7cc]'}`}>{on && '✓'}</span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="text-sm text-[#6e6e73] p-3">{T(ar, 'No one found.', 'لا أحد.')}</li>}
        </ul>
        {picked.length > 1 && canBroadcast && (
          <div className="rounded-2xl border border-[#e5e5ea] bg-white p-1 flex gap-1 text-sm font-bold">
            {(['each', 'group'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`flex-1 min-h-11 rounded-xl ${mode === k ? 'bg-[#0071e3] text-white' : 'text-[#515154]'}`}>
                {k === 'each' ? T(ar, 'Same message to each', 'نفس الرسالة لكل شخص') : T(ar, 'One group chat', 'محادثة جماعية')}
              </button>
            ))}
          </div>
        )}
        {picked.length > 1 && mode === 'each' && canBroadcast && (
          <p className="text-xs text-[#6e6e73]">{T(ar, 'Each person receives it privately from you; they do not see who else got it.', 'يصل كل شخص الرسالة منك بشكل خاص ولا يرى من تلقاها غيره.')}</p>
        )}
        {picked.length > 1 && mode === 'group' && <input className={input} placeholder={T(ar, 'Group name', 'اسم المجموعة')} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />}
        {err && <p className="text-sm text-rose-700">{err}</p>}
      </div>
      {picked.length > 1 && mode === 'each' && canBroadcast ? (
        <Composer
          ar={ar}
          placeholder={T(ar, `Message to ${picked.length} people…`, `رسالة إلى ${picked.length} أشخاص…`)}
          onSend={async (body, files) => {
            await broadcast(picked, body, files);
            onClose();
          }}
        />
      ) : (
        <div className="p-3 border-t border-[#e5e5ea] bg-white">
          <button type="button" disabled={picked.length === 0 || busy || (picked.length > 1 && mode === 'group' && !title.trim())} onClick={go} className="w-full min-h-12 rounded-xl bg-[#0071e3] text-white font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {picked.length > 1 ? T(ar, 'Create group', 'إنشاء المجموعة') : T(ar, 'Start chat', 'بدء المحادثة')}
          </button>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ the page
export const ChatCenter: React.FC<{ locale: 'en' | 'ar'; openWith?: string | null; onOpened?: () => void }> = ({ locale, openWith, onOpened }) => {
  const ar = locale === 'ar';
  const team = useSyncExternalStore(subscribeTeam, getTeam);
  const [active, setActive] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const me = team.profiles.find((p) => p.user_id === team.meId);
  const others = useMemo(() => team.profiles.filter((p) => p.active && p.user_id !== team.meId), [team.profiles, team.meId]);
  const canBroadcast = true;
  const byId = useMemo(() => new Map(team.profiles.map((p) => [p.user_id, p])), [team.profiles]);

  // someone's birthday banner (or anywhere else) can ask to open a chat with a person
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  useEffect(() => {
    if (!openWith) return;
    void openDirect(openWith)
      .then((id) => setActive(id))
      .catch(() => undefined)
      .finally(() => onOpenedRef.current?.());
  }, [openWith]);

  const threadName = (t: ChatThread): string => {
    if (t.kind === 'group') return t.title || T(ar, 'Group', 'مجموعة');
    const other = team.members.find((m) => m.thread_id === t.id && m.user_id !== team.meId);
    return nameOf(other ? byId.get(other.user_id) : undefined);
  };
  const threadPerson = (t: ChatThread): Profile | undefined => {
    if (t.kind === 'group') return undefined;
    const other = team.members.find((m) => m.thread_id === t.id && m.user_id !== team.meId);
    return other ? byId.get(other.user_id) : undefined;
  };

  const thread = team.threads.find((t) => t.id === active) || null;
  const msgs = thread ? team.messages[thread.id] || [] : [];
  const endRef = useRef<HTMLDivElement>(null);
  const scRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  // open chat: read the newest messages, mark read, scroll to the bottom
  useEffect(() => {
    if (!thread) return;
    lastCount.current = 0;
    void loadMessages(thread.id);
  }, [thread?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!thread) return;
    const el = scRef.current;
    const grew = msgs.length > lastCount.current;
    if (el && grew && (lastCount.current === 0 || el.scrollHeight - el.scrollTop - el.clientHeight < 240)) endRef.current?.scrollIntoView({ block: 'end' });
    lastCount.current = msgs.length;
    if (grew && document.visibilityState === 'visible') void markRead(thread.id);
  }, [msgs.length, thread?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!team.ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#0071e3]" />
      </div>
    );
  }

  const list = (
    <div className={`flex flex-col min-h-0 bg-white sm:rounded-3xl sm:border border-[#e5e5ea] sm:w-80 lg:w-96 shrink-0 ${thread ? 'max-sm:hidden' : 'max-sm:flex-1'}`}>
      <div className="flex items-center justify-between p-3 border-b border-[#e5e5ea]">
        <h1 className="font-bold text-lg">{T(ar, 'Team chat', 'محادثات الفريق')}</h1>
        <button type="button" onClick={() => setComposing(true)} className="inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-xl bg-[#0071e3] text-white text-sm font-bold">
          <MessageSquarePlus className="w-4 h-4" />
          {T(ar, 'New', 'جديد')}
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto divide-y divide-[#f0f0f3]">
        {team.threads.length === 0 && <li className="p-6 text-center text-sm text-[#6e6e73]">{T(ar, 'No conversations yet. Tap New to write to someone.', 'لا توجد محادثات بعد. اضغط جديد للكتابة لشخص ما.')}</li>}
        {team.threads.map((t) => {
          const last = (team.messages[t.id] || []).at(-1);
          const n = team.unread[t.id] || 0;
          return (
            <li key={t.id}>
              <button type="button" onClick={() => { setActive(t.id); void markRead(t.id); }} className={`w-full flex items-center gap-3 px-3 min-h-[68px] text-start ${active === t.id ? 'bg-[#0071e3]/8' : 'active:bg-[#f5f5f7]'}`}>
                {t.kind === 'group' ? (
                  <span className="w-11 h-11 rounded-full bg-[#e8f1fd] text-[#0071e3] inline-flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></span>
                ) : (
                  <Avatar person={threadPerson(t)} size={44} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[15px] ${n ? 'font-extrabold' : 'font-bold'}`}>{threadName(t)}</span>
                    <span className="text-[11px] text-[#8e8e93] shrink-0">{last ? timeLabel(last.created_at, ar) : ''}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${n ? 'text-[#1d1d1f] font-semibold' : 'text-[#6e6e73]'}`}>
                      {last ? (last.sender_id === team.meId ? T(ar, 'You: ', 'أنت: ') : '') + (last.body || (last.attachments[0]?.kind === 'image' ? T(ar, '📷 Photo', '📷 صورة') : T(ar, '📎 File', '📎 ملف'))) : ''}
                    </span>
                    {n > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#0071e3] text-white text-[11px] font-bold inline-flex items-center justify-center">{n}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const pane = thread ? (
    <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-[#f5f5f7] sm:rounded-3xl sm:border border-[#e5e5ea] overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-2 bg-white border-b border-[#e5e5ea]">
        <button type="button" onClick={() => setActive(null)} className="sm:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl" aria-label={T(ar, 'Back', 'رجوع')}>
          {ar ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </button>
        {thread.kind === 'group' ? <span className="w-10 h-10 rounded-full bg-[#e8f1fd] text-[#0071e3] inline-flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></span> : <Avatar person={threadPerson(thread)} size={40} />}
        <div className="min-w-0">
          <div className="font-bold text-[15px] truncate">{threadName(thread)}</div>
          <div className="text-[11px] text-[#6e6e73] truncate">
            {thread.kind === 'group'
              ? team.members.filter((m) => m.thread_id === thread.id).map((m) => nameOf(byId.get(m.user_id))).join('، ')
              : threadPerson(thread)?.phone || ''}
          </div>
        </div>
      </div>
      <div ref={scRef} className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5">
        {team.hasMore[thread.id] && (
          <button type="button" className="mx-auto block text-xs font-bold text-[#0071e3] min-h-9" onClick={() => void loadMessages(thread.id, true)}>
            {T(ar, 'Earlier messages', 'رسائل أقدم')}
          </button>
        )}
        {msgs.map((m, i) => (
          <Bubble key={m.id} m={m} mine={m.sender_id === team.meId} sender={byId.get(m.sender_id)} showName={thread.kind === 'group' && msgs[i - 1]?.sender_id !== m.sender_id} ar={ar} />
        ))}
        <div ref={endRef} />
      </div>
      <Composer ar={ar} onSend={(body, files) => sendMessage(thread.id, body, files)} />
    </div>
  ) : (
    <div className="flex-1 max-sm:hidden flex items-center justify-center text-sm text-[#8e8e93] bg-white/50 rounded-3xl border border-dashed border-[#d2d2d7]">
      {T(ar, 'Choose a conversation', 'اختر محادثة')}
    </div>
  );

  return (
    <div className="relative h-full flex gap-3 min-h-0 -m-1 sm:m-0">
      {list}
      {pane}
      {composing && (
        <NewChat
          ar={ar}
          people={others}
          canBroadcast={canBroadcast}
          onClose={() => setComposing(false)}
          onOpen={(id) => {
            setComposing(false);
            setActive(id);
          }}
        />
      )}
    </div>
  );
};
