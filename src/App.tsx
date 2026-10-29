/**
 * Executive AI Planner — Main Application Entry Point
 * @license Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import {
  Task,
  Meeting,
  Notebook,
  NotebookPage,
  PlannerImportPage,
  Person,
  Project,
  AssistantMessage,
  ExtractedCandidate,
  InkStroke,
  CanvasTextItem,
  PageVersion,
  PaperStyle,
  PaperColor,
} from './types';
import { Locale } from './lib/translations';
import { getCairoDateString, cairoLocalToIso, normalizeToIso, parseTimeTo24h, cairoDateOf, cairoTimeOf } from './lib/cairoTime';
import { localDB } from './lib/indexedDb';
import type { WorkspaceState } from './lib/indexedDb';
import { newId, hasDuplicateName, normalizeTask } from './lib/taskLogic';
import { PLANNER_CANVAS, findPageForDate, plannerPageDefaults } from './lib/planner';
import type { PlannerPageRequest } from './lib/planner';
import { INITIAL_DEPARTMENTS } from './lib/referenceData';
import {
  isCloudConfigured,
  getInitialSession,
  onAuthChange,
  signOutUser,
  testCloudConnection,
  syncTaskToCloud,
  deleteTaskFromCloud,
  syncMeetingToCloud,
  deleteMeetingFromCloud,
  syncPageToCloud,
  deletePageFromCloud,
  syncNotebookToCloud,
  deleteNotebookFromCloud,
  syncProjectToCloud,
  deleteProjectFromCloud,
  syncPersonToCloud,
  deletePersonFromCloud,
  subscribeWorkspace,
  unsyncedIds,
  flushPendingPages,
  loadRemoteGeminiSettings,
  saveRemoteGeminiSettings,
  loadAllPrefs,
  savePref,
  syncSharedQuota,
  clearCloudCollections,
  flushRetryQueue,
  OPENED_FROM_RECOVERY_LINK,
} from './lib/cloud';
import type { CollectionName, DocChange } from './lib/cloud';
import { mergeRemote } from './lib/merge';
import { keyManager } from './lib/ai/keyManager';
import { usage } from './lib/ai/modelQueue';
import { NotificationCenter } from './components/notifications/NotificationCenter';
import { fetchGoogleEvents, fetchPrimaryCalendar, eventsToMeetings, planSync, pushMeeting, deleteGoogleEvent, syncTasksToGoogle, requestGoogleToken, getGoogleLink, setGoogleLink, tokenIsValid, probeServer } from './lib/googleCalendar';
import { chatWithAssistant } from './lib/ai/gemini';
import { disableLock } from './lib/appLock';
import { notifPrefs, setNotifPrefsAccountSaver } from './lib/notifications';
import type { NotifPrefs } from './lib/notifications';
import { cachedFeedMeetings, getFeedState, refreshFeed, setFeedUrl, subscribeFeed } from './lib/outlookFeed';
import { LoginScreen } from './components/auth/LoginScreen';
import { ChatCenter } from './components/team/ChatCenter';
import { BirthdayBanner } from './components/team/BirthdayBanner';
import { claimDevice } from './lib/deviceOwner';
import { birthdaysOn, broadcast, getTeam, loadMessages, markRead, nameOf, openDirect, refreshTeam, sendMessage, startTeam, stopTeam, subscribeTeam } from './lib/team';
import { SetupGuide } from './components/team/SetupGuide';
import { callAr, callEn, getFemalePref, getSperoUser, setFemalePref, setSperoUser, speroUserFrom, subscribeFemalePref } from './lib/ai/speroUser';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen';
import { SettingsView } from './components/settings/SettingsView';
import type { User } from '@supabase/supabase-js';
import { AppShell } from './components/layout/AppShell';
import { TodayBriefing } from './components/briefing/TodayBriefing';
import { NotebookView } from './components/notebook/NotebookView';
import { TaskCenter } from './components/tasks/TaskCenter';
import { TaskModal } from './components/tasks/TaskModal';
import { CalendarCenter } from './components/calendar/CalendarCenter';
import { MeetingModal } from './components/calendar/MeetingModal';
import { ExecutiveAssistant } from './components/assistant/ExecutiveAssistant';
import { FollowUpCenter } from './components/followup/FollowUpCenter';
import { DirectoryCenter } from './components/directory/DirectoryCenter';
import { BackupModal } from './components/backup/BackupModal';
import { LiveVoiceModal } from './components/assistant/LiveVoiceModal';
import { Sparkles } from 'lucide-react';

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [currentTab, setCurrentTab] = useState<string>('today');
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Core Data Stores
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);

  // Active Notebook & Page
  const [activeNotebookId, setActiveNotebookId] = useState<string>('');
  const [activePageId, setActivePageId] = useState<string>('');

  // Modals state
  const [selectedTaskForModal, setSelectedTaskForModal] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState<boolean>(false);

  const [selectedMeetingForModal, setSelectedMeetingForModal] = useState<Meeting | null>(null);
  const [selectedMeetingInitialDate, setSelectedMeetingInitialDate] = useState<string | undefined>(undefined);
  const [selectedMeetingInitialTime, setSelectedMeetingInitialTime] = useState<string | undefined>(undefined);
  const [departments, setDepartments] = useState<string[]>(INITIAL_DEPARTMENTS);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState<boolean>(false);

  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [isLiveVoiceModalOpen, setIsLiveVoiceModalOpen] = useState<boolean>(false);

  // Full Screen Paper (Hide Top & Side Bars for Apple Pencil)
  const [isFullScreenPaper, setIsFullScreenPaper] = useState<boolean>(false);

  // Undo Toast state
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null);

  // Latest-state refs so long-lived callbacks (voice session, debounced ink saves) never act on stale data
  const tasksRef = useRef<Task[]>([]);
  const meetingsRef = useRef<Meeting[]>([]);
  const pagesRef = useRef<NotebookPage[]>([]);
  const notebooksRef = useRef<Notebook[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const peopleRef = useRef<Person[]>([]);
  notebooksRef.current = notebooks;
  projectsRef.current = projects;
  peopleRef.current = people;
  tasksRef.current = tasks;
  meetingsRef.current = meetings;
  pagesRef.current = pages;

  // Auth gate (only when Supabase is configured)
  const [authReady, setAuthReady] = useState<boolean>(!isCloudConfigured);
  const [user, setUser] = useState<User | null>(null);
  const userId = user?.id;
  // opened from the "reset my password" e-mail: ask for a new password before anything else
  const [recovering, setRecovering] = useState<boolean>(OPENED_FROM_RECOVERY_LINK);

  useEffect(() => {
    if (!isCloudConfigured) return;
    let alive = true;
    // a different person on a shared device: remove the previous person's local copy first, then start fresh
    // Supabase reports "signed in" again each time the app returns to the screen, with a new but identical user object.
    // Keep the old object then, so nothing that depends on the user restarts (cloud sync, calendars, team) for no reason.
    const same = (a: User | null, b: User | null) =>
      a === b || (!!a && !!b && a.id === b.id && a.updated_at === b.updated_at && JSON.stringify(a.user_metadata) === JSON.stringify(b.user_metadata));
    const keepSame = (u: User | null) => setUser((prev) => (same(prev, u) ? prev : u));
    const accept = async (u: User | null): Promise<boolean> => {
      if (u && (await claimDevice(u.id))) {
        location.reload();
        return false;
      }
      return alive;
    };
    getInitialSession()
      .then(async (session) => {
        if (!alive) return;
        const u = session?.user ?? null;
        if (await accept(u)) keepSame(u);
      })
      .finally(() => alive && setAuthReady(true));
    const off = onAuthChange((u, ev) => {
      if (!alive) return;
      if (ev === 'PASSWORD_RECOVERY') setRecovering(true);
      void accept(u).then((ok) => ok && keepSame(u));
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  // Team: profiles + chat for the signed-in person (only when the cloud is on)
  const [chatWith, setChatWith] = useState<string | null>(null);
  useEffect(() => {
    if (!isCloudConfigured) return;
    if (!userId) {
      stopTeam();
      return;
    }
    void startTeam(userId);
    const onVisible = () => document.visibilityState === 'visible' && void refreshTeam();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);
  // Spero speaks to whoever is signed in: their profile name and the he/she choice (only re-render when those change)
  const myProfileKey = useSyncExternalStore(subscribeTeam, () => {
    const t = getTeam();
    const me = t.profiles.find((p) => p.user_id === t.meId);
    return me ? `${me.role}|${me.display_name}` : '';
  });
  const femalePref = useSyncExternalStore(subscribeFemalePref, getFemalePref);
  useEffect(() => {
    if (!isCloudConfigured || !myProfileKey) return;
    const [role, ...rest] = myProfileKey.split('|');
    setSperoUser(speroUserFrom({ role, display_name: rest.join('|') }, femalePref));
  }, [myProfileKey, femalePref]);

  // leaving a page (or the notebook) sends its waiting ink right away instead of after the quiet period
  const onNotebook = currentTab === 'notebook';
  useEffect(() => {
    flushPendingPages();
  }, [activePageId, onNotebook]);

  // the first password was given by an administrator: the person must choose their own before anything else
  const mustChangePassword = !!user && user.user_metadata?.must_change_password === true;

  // Build the assistant greeting from real data only
  const buildGreeting = useCallback(
    (list: Meeting[], lang: Locale): string => {
      const todayCairo = getCairoDateString();
      const upcoming = list
        .filter((m) => getCairoDateString(new Date(m.start)) >= todayCairo && new Date(m.end).getTime() >= Date.now())
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      if (upcoming.length > 0) {
        const nextM = upcoming[0];
        const timeStr = nextM.start
          ? new Date(nextM.start).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Africa/Cairo',
            })
          : '';
        return lang === 'ar'
          ? `مرحباً ${callAr()}، أنا في خدمتك. أُذكّرك بأن لديك اجتماعاً "${nextM.title}" ${timeStr ? `في تمام الساعة ${timeStr}` : ''}. هل ترغب في أن أُعدّ ملخصاً للاجتماع أو أراجع بنود جدول الأعمال؟`
          : `Good morning${callEn()}. How can I assist you today? Just reminding you that you have an upcoming meeting "${nextM.title}" ${timeStr ? `at ${timeStr}` : ''}. Would you like me to prepare briefing notes or review agenda items?`;
      }
      return lang === 'ar'
        ? `مرحباً ${callAr()}، أنا في خدمتك. لا توجد اجتماعات مسجلة في جدولك للفترة القادمة. هل ترغب في مراجعة المهام المعلقة أو التخطيط لمهام جديدة؟`
        : `Good morning${callEn()}. How can I assist you today? You have no upcoming meetings scheduled right now. Would you like help reviewing pending tasks or planning new work?`;
    },
    []
  );

  // Load local data once
  useEffect(() => {
    let cancelled = false;
    async function loadLocal() {
      try {
        // One-time fix for meetings saved before real-UTC storage (idempotent, see lib/legacyMeetings.ts)
        let migratedMeetings: Meeting[] = [];
        try {
          migratedMeetings = await localDB.migrateLegacyMeetingTimes();
        } catch (migrationErr) {
          console.warn('Meeting time migration skipped:', migrationErr);
        }
        const state = await localDB.initAndSeed();
        if (cancelled) return;
        migratedMeetings.forEach((m) => syncMeetingToCloud(m).catch(console.warn));

        // Departments live in IndexedDB; adopt the list the old version kept in localStorage once
        try {
          let savedDepartments = await localDB.getDepartments();
          if (!savedDepartments) {
            const legacy = localStorage.getItem('executive_custom_departments');
            const parsed: unknown = legacy ? JSON.parse(legacy) : null;
            if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') && parsed.length > 0) {
              savedDepartments = parsed as string[];
              await localDB.setDepartments(savedDepartments);
            }
          }
          if (savedDepartments && !cancelled) setDepartments(savedDepartments);
        } catch (depErr) {
          console.warn('Could not load departments:', depErr);
        }
        setTasks(state.tasks.map(normalizeTask));
        setMeetings(state.meetings);
        setNotebooks(state.notebooks);
        setPages(state.pages);
        setPeople(state.people);
        setProjects(state.projects);

        let msgs = state.messages;
        if (msgs.length === 0 || msgs[0].id.startsWith('msg-greeting-')) {
          const greetingMsg: AssistantMessage = {
            id: msgs.length > 0 ? msgs[0].id : newId('msg-greeting'),
            role: 'assistant',
            content: buildGreeting(state.meetings, 'en'),
            timestamp: new Date().toISOString(),
          };
          await localDB.put('messages', greetingMsg);
          msgs = msgs.length === 0 ? [greetingMsg] : [greetingMsg, ...msgs.slice(1)];
        }
        setMessages(msgs);

        if (state.notebooks.length > 0) {
          setActiveNotebookId(state.notebooks[0].id);
          const firstPage = state.pages.find((p) => p.notebookId === state.notebooks[0].id);
          if (firstPage) setActivePageId(firstPage.id);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadLocal();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cloud sync: starts once a user is signed in, stops on sign-out
  useEffect(() => {
    if (!isCloudConfigured || !userId || loading) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const LAST_SYNC_KEY = `alkammah_last_cloud_sync_${userId}`;

    // remote wins when it has a value; a value that only this device has is sent up (first time after this was added)
    async function pullAccountPrefs() {
      const remote = await loadAllPrefs();
      if (cancelled) return;
      const feedRemote = remote.outlookFeedUrl;
      const feedLocal = getFeedState().url;
      if (typeof feedRemote === 'string') {
        if (feedRemote !== feedLocal) setFeedUrl(feedRemote);
      } else if (feedLocal) void savePref('outlookFeedUrl', feedLocal);
      const workRemote = remote.workCalendarEmail;
      const workLocal = getGoogleLink().workEmail || '';
      if (typeof workRemote === 'string') {
        if (workRemote !== workLocal) setGoogleLink({ workEmail: workRemote, workEmailDone: undefined });
      } else if (workLocal) void savePref('workCalendarEmail', workLocal);
      if (typeof remote.speroFemale === 'boolean') setFemalePref(remote.speroFemale);
      const np = remote.notifPrefs;
      if (np && typeof np === 'object') notifPrefs.set(np as Partial<NotifPrefs>, true);
      else void savePref('notifPrefs', notifPrefs.shared());
    }

    async function startSync() {
      // Gemini keys follow the user across devices
      keyManager.setRemoteSaver(saveRemoteGeminiSettings);
      keyManager.hydrateFromRemote(await loadRemoteGeminiSettings());
      // links and choices follow the account: the Outlook link, the work e-mail and the notification switches are the same on every device
      setNotifPrefsAccountSaver((p) => void savePref('notifPrefs', p));
      void pullAccountPrefs();
      // every device shows the same real quota status: share what each one learns
      usage.setShareHook(() => void syncSharedQuota().catch(console.warn));
      await syncSharedQuota().catch(console.warn);
      if (keyManager.hasAnyKey()) {
        // push local-only keys up on first connect from this device
        saveRemoteGeminiSettings(keyManager.getSettings()).catch(console.warn);
      }

      const online = await testCloudConnection();
      if (cancelled) return;
      setIsCloudConnected(online);
      if (!online) return;

      let lastSync = 0;
      try {
        lastSync = Number(localStorage.getItem(LAST_SYNC_KEY) || 0);
      } catch {
        /* ignore */
      }

      type Doc = { id: string; updatedAt?: string; createdAt?: string };
      const stamp = (v?: string) => Date.parse(v || '') || 0;
      const wire = <T extends Doc>(
        name: CollectionName,
        getLocal: () => T[],
        apply: (merged: T[]) => void,
        store: string,
        push: (item: T) => Promise<void>
      ) => (remote: T[], isInitial: boolean, change: DocChange<T>) => {
        if (cancelled) return;
        const local = getLocal();
        const waiting = unsyncedIds(name);
        if (change) {
          // a live change: touch only those documents, and do nothing at all for the echo of this device's own save
          const byId = new Map(local.map((i) => [i.id, i]));
          let touched = false;
          for (const r of change.upserted) {
            const l = byId.get(r.id);
            if (l && (stamp(l.updatedAt) > stamp(r.updatedAt) || (stamp(l.updatedAt) === stamp(r.updatedAt) && (l.updatedAt || r.updatedAt)))) continue;
            byId.set(r.id, r);
            void localDB.put(store, r);
            touched = true;
          }
          for (const id of change.deleted) {
            if (byId.delete(id)) {
              void localDB.delete(store, id);
              touched = true;
            }
          }
          if (touched) apply([...byId.values()]);
          return;
        }
        if (isInitial) {
          const remoteById = new Map(remote.map((r) => [r.id, r]));
          // upload what this device created/edited while offline (or the whole workspace if the cloud is empty)
          for (const l of local) {
            const r = remoteById.get(l.id);
            const localTime = Math.max(stamp(l.updatedAt), stamp(l.createdAt));
            if (waiting.has(l.id) || (!r && (remote.length === 0 || localTime > lastSync)) || (r && localTime > stamp(r.updatedAt))) {
              push(l).catch(console.warn);
            }
          }
        }
        const merged = isInitial && remote.length === 0 ? local : mergeRemote(local, remote, 20_000, Date.now(), waiting);
        apply(merged);
        void localDB.replaceAll(store, merged);
      };

      const handlers: Record<CollectionName, (items: never[], isInitial: boolean, change: DocChange<never>) => void> = {
        tasks: wire<Task>('tasks', () => tasksRef.current, (v) => setTasks(v.map(normalizeTask)), 'tasks', syncTaskToCloud),
        meetings: wire<Meeting>('meetings', () => meetingsRef.current, setMeetings, 'meetings', syncMeetingToCloud),
        notebooks: wire<Notebook>('notebooks', () => notebooksRef.current, setNotebooks, 'notebooks', syncNotebookToCloud),
        pages: wire<NotebookPage>('pages', () => pagesRef.current, setPages, 'pages', (p) => syncPageToCloud(p, { now: true })),
        projects: wire<Project>('projects', () => projectsRef.current, setProjects, 'projects', syncProjectToCloud),
        people: wire<Person>('people', () => peopleRef.current, setPeople, 'people', syncPersonToCloud),
      };
      const localOf: Record<CollectionName, () => { id: string }[]> = {
        tasks: () => tasksRef.current,
        meetings: () => meetingsRef.current,
        notebooks: () => notebooksRef.current,
        pages: () => pagesRef.current,
        projects: () => projectsRef.current,
        people: () => peopleRef.current,
      };
      unsubs.push(
        subscribeWorkspace(
          (c, items, isInitial, change) => handlers[c](items as never[], isInitial, change as DocChange<never>),
          (c) => localOf[c]()
        )
      );

      void flushRetryQueue();
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    }

    startSync().catch((err) => console.warn('Cloud sync start failed:', err));
    // coming back to the app picks up what was changed on another device
    let lastPull = Date.now();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastPull > 60_000) {
        lastPull = Date.now();
        void pullAccountPrefs();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      setNotifPrefsAccountSaver(null);
      cancelled = true;
      unsubs.forEach((u) => u());
      keyManager.setRemoteSaver(null);
      usage.setShareHook(null);
      setIsCloudConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loading]);

  // Dynamic greeting sync when meetings or locale changes (only while the chat is still just the greeting)
  useEffect(() => {
    if (messages.length > 1) return;
    const greetingContent = buildGreeting(meetings, locale);
    setMessages((prev) => {
      if (prev.length === 0) {
        return [
          {
            id: newId('msg-greeting'),
            role: 'assistant',
            content: greetingContent,
            timestamp: new Date().toISOString(),
          },
        ];
      }
      if (prev[0].id.startsWith('msg-greeting-')) {
        if (prev[0].content === greetingContent) return prev;
        return [{ ...prev[0], content: greetingContent }, ...prev.slice(1)];
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, locale]);

  // Show undo toast helper
  const triggerUndoToast = (message: string, onUndoAction: () => void) => {
    setUndoToast({
      message,
      onUndo: () => {
        onUndoAction();
        setUndoToast(null);
      },
    });

    setTimeout(() => {
      setUndoToast((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  // 1. Task Operations
  const handleSaveTask = async (taskData: Partial<Task>) => {
    let updatedTask: Task;
    const isNew = !taskData.id;

    if (isNew) {
      updatedTask = {
        id: newId('task'),
        workspaceId: 'default-ws',
        title: taskData.title || 'Untitled Task',
        description: taskData.description || '',
        workstream: taskData.workstream || 'Commercial + New Lands',
        department: taskData.department || 'Commercial',
        project: taskData.project || '',
        location: taskData.location || '',
        ownerAlias: taskData.ownerAlias || 'Unassigned',
        isOwnerVerified: false,
        status: taskData.status || 'Pending',
        priority: taskData.priority || 'Normal',
        dueDate: taskData.dueDate,
        dueTime: taskData.dueTime,
        followUpDate: taskData.followUpDate,
        nextAction: taskData.nextAction,
        counterpart: taskData.counterpart,
        blocker: taskData.blocker,
        isArchived: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'executive-user',
        ...taskData,
      } as Task;

      const newTasks = [updatedTask, ...tasks];
      setTasks(newTasks);
      await localDB.put('tasks', updatedTask);
      syncTaskToCloud(updatedTask).catch(console.warn);
    } else {
      updatedTask = {
        ...taskData,
        version: (taskData.version || 1) + 1,
        updatedAt: new Date().toISOString(),
      } as Task;

      const prevTask = tasks.find((t) => t.id === updatedTask.id);
      const newTasks = tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t));
      setTasks(newTasks);
      await localDB.put('tasks', updatedTask);
      syncTaskToCloud(updatedTask).catch(console.warn);

      if (prevTask) {
        triggerUndoToast(`Updated "${updatedTask.title}"`, async () => {
          setTasks((curr) => curr.map((t) => (t.id === prevTask.id ? prevTask : t)));
          await localDB.put('tasks', prevTask);
          syncTaskToCloud(prevTask).catch(console.warn);
        });
      }
    }
  };

  // Tiny task: a title, a comment and a due date/time (picked automatically 15 minutes ahead, editable); lives in its own list on the Calendar page
  const handleAddTinyTask = (title: string, comment: string, dueDate: string, dueTime: string) => {
    void handleSaveTask({ title, description: comment, isTiny: true, status: 'Pending', priority: 'Normal', dueDate, dueTime });
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const previousStatus = task.status;
    const updated: Task = {
      ...task,
      status: newStatus,
      completionDate: newStatus === 'Closed' ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    };

    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    await localDB.put('tasks', updated);
    syncTaskToCloud(updated).catch(console.warn);

    triggerUndoToast(`Status changed to ${newStatus}`, async () => {
      const reverted: Task = { ...task, status: previousStatus, updatedAt: new Date().toISOString() };
      setTasks((prev) => prev.map((t) => (t.id === taskId ? reverted : t)));
      await localDB.put('tasks', reverted);
      syncTaskToCloud(reverted).catch(console.warn);
    });
  };

  // Manual task order (drag / arrows in the Task Center): store each task's rank so it survives reloads and syncs to other devices
  const handleReorderTasks = async (orderedIds: string[]) => {
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    const now = new Date().toISOString();
    const changed: Task[] = [];
    const next = tasks.map((t) => {
      const r = rank.get(t.id);
      if (r === undefined || t.sortOrder === r) return t;
      const u: Task = { ...t, sortOrder: r, updatedAt: now };
      changed.push(u);
      return u;
    });
    if (!changed.length) return;
    setTasks(next);
    for (const u of changed) {
      await localDB.put('tasks', u);
      syncTaskToCloud(u).catch(console.warn);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await localDB.delete('tasks', taskId);
    deleteTaskFromCloud(taskId).catch(console.warn);

    triggerUndoToast(locale === 'ar' ? `تم حذف المهمة "${task.title}"` : `Task deleted: "${task.title}"`, async () => {
      setTasks((prev) => [task, ...prev]);
      await localDB.put('tasks', task);
      syncTaskToCloud(task).catch(console.warn);
    });
  };

  const handleToggleArchiveTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updated: Task = {
      ...task,
      isArchived: !task.isArchived,
      updatedAt: new Date().toISOString(),
    };

    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    await localDB.put('tasks', updated);
    syncTaskToCloud(updated).catch(console.warn);

    triggerUndoToast(
      locale === 'ar'
        ? `${updated.isArchived ? 'تمت أرشفة' : 'تمت استعادة'} المهمة "${task.title}"`
        : `Task ${updated.isArchived ? 'archived' : 'restored'}: "${task.title}"`,
      async () => {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? task : t)));
        await localDB.put('tasks', task);
        syncTaskToCloud(task).catch(console.warn);
      }
    );
  };

  // Google Calendar, two-way: Google events come in as meetings; meetings added, changed or deleted here go to Google
  const googleBusy = useRef(false);
  const syncGoogleCalendar = async (interactive: boolean): Promise<{ added: number; updated: number; removed: number; email: string }> => {
    if (googleBusy.current) throw new Error('A sync is already running, try again in a moment.');
    googleBusy.current = true;
    try {
      let token = getGoogleLink().token;
      if (!tokenIsValid()) token = await requestGoogleToken(interactive);
      if (!token) throw new Error('GOOGLE_TOKEN_EXPIRED');
      const from = new Date(Date.now() - 30 * 86400_000).toISOString();
      const to = new Date(Date.now() + 365 * 86400_000).toISOString();
      const { email } = await fetchPrimaryCalendar(token);
      const remote = eventsToMeetings(await fetchGoogleEvents(token, from, to));
      const current = meetingsRef.current;
      const plan = planSync(current, remote, from, to, getGoogleLink().known || []);

      // 1) deletions made here -> delete in Google
      for (const gid of plan.deleteRemote) await deleteGoogleEvent(token, gid);

      // 2) new or changed here -> Google
      const pushed = new Map<string, Meeting>();
      // one time: events the app pushed before the "Synced from Alkammah Memo system" note existed get it too
      const pushIds = new Set(plan.push.map((m) => m.id));
      const backfill = getGoogleLink().footerDone ? [] : current.filter((m) => !!m.googleEventId && !m.id.startsWith('gcal_') && !pushIds.has(m.id));
      // the work e-mail was just set or changed: invite it to the meetings still to come (once)
      // (every meeting made here from the start of this month on, so earlier ones from the same month are invited too)
      const work = getGoogleLink().workEmail?.trim() || '';
      const doneTag = work ? `${work}|month-start` : '';
      const monthStartIso = cairoLocalToIso(`${getCairoDateString().slice(0, 8)}01`, '00:00');
      const inviteBackfill =
        work && getGoogleLink().workEmailDone !== doneTag
          ? current.filter((m) => !!m.googleEventId && !m.id.startsWith('gcal_') && m.start >= monthStartIso && !pushIds.has(m.id) && !backfill.some((b) => b.id === m.id))
          : [];
      for (const m of [...plan.push, ...backfill, ...inviteBackfill]) {
        const r = await pushMeeting(token, m);
        pushed.set(m.id, { ...m, googleEventId: r.id, googleSyncedAt: r.updated, syncState: 'synced' });
      }

      if (!getGoogleLink().footerDone) setGoogleLink({ footerDone: true });
      if (getGoogleLink().workEmailDone !== doneTag) setGoogleLink({ workEmailDone: doneTag });

      // 3) apply everything to the local meetings
      const removeIds = new Set(plan.removeLocal.map((m) => m.id));
      const upsertMap = new Map(plan.upsert.map((m) => [m.id, m]));
      const knownIds = new Set(current.map((m) => m.id));
      const changed = [...pushed.values(), ...plan.upsert];
      if (changed.length || removeIds.size) {
        const next = [
          ...plan.upsert.filter((m) => !knownIds.has(m.id)),
          ...current.filter((m) => !removeIds.has(m.id)).map((m) => pushed.get(m.id) || upsertMap.get(m.id) || m),
        ];
        meetingsRef.current = next;
        setMeetings(next);
        for (const m of changed) {
          await localDB.put('meetings', m);
          syncMeetingToCloud(m).catch(console.warn);
        }
        for (const m of plan.removeLocal) {
          await localDB.delete('meetings', m.id);
          deleteMeetingFromCloud(m.id).catch(console.warn);
        }
      }
      // 4) open tasks with a due date show up in Google Calendar too
      await syncTasksToGoogle(token, tasksRef.current, from.slice(0, 10), to.slice(0, 10));

      // remember what is mirrored now, so a later deletion here can be recognised
      const known = meetingsRef.current.map((m) => m.googleEventId).filter((x): x is string => !!x);
      setGoogleLink({ email, lastSyncAt: new Date().toISOString(), lastCount: remote.length, known });
      return {
        added: plan.upsert.filter((m) => !knownIds.has(m.id)).length + [...pushed.keys()].filter((id) => !current.find((m) => m.id === id)?.googleEventId).length,
        updated: plan.upsert.filter((m) => knownIds.has(m.id)).length + [...pushed.keys()].filter((id) => !!current.find((m) => m.id === id)?.googleEventId).length,
        removed: plan.removeLocal.length + plan.deleteRemote.length,
        email,
      };
    } finally {
      googleBusy.current = false;
    }
  };

  // Mirror changes made here quickly: a few seconds after the meetings change, sync again (only while the sign-in is valid)
  useEffect(() => {
    const l = getGoogleLink();
    if (!l.autoSync || !l.clientId || !(l.serverLinked || tokenIsValid(l)) || !l.lastSyncAt) return;
    const t = setTimeout(() => {
      syncGoogleCalendar(false).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, tasks]);

  // Work calendar (Outlook link): read-only meetings shown next to the others, refreshed when the app opens, every 15 minutes and on return
  const feed = useSyncExternalStore(subscribeFeed, getFeedState);
  const [feedMeetings, setFeedMeetings] = useState<Meeting[]>(() => cachedFeedMeetings());
  useEffect(() => {
    setFeedMeetings(feed.url ? cachedFeedMeetings() : []);
  }, [feed.url, feed.fetchedAt]);
  useEffect(() => {
    if (!feed.url || !userId) return;
    const run = () => void refreshFeed().catch(() => undefined);
    // on open, only if the copy on this device is older than 5 minutes
    if (Date.now() - Date.parse(getFeedState().fetchedAt || '1970-01-01') > 5 * 60_000) run();
    const t = setInterval(run, 15 * 60_000);
    const vis = () => {
      if (document.visibilityState === 'visible' && Date.now() - Date.parse(getFeedState().fetchedAt || '1970-01-01') > 5 * 60_000) run();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [feed.url, userId]);
  // a meeting made here and invited to the work e-mail comes back through the Outlook link: show it once (same title, same start)
  const shownMeetings = useMemo(() => {
    if (!feedMeetings.length) return meetings;
    const key = (m: Meeting) => `${m.title.trim().toLowerCase()}|${Math.round(Date.parse(m.start) / 60000)}`;
    const own = new Set(meetings.map(key));
    return [...meetings, ...feedMeetings.filter((f) => !own.has(key(f)))];
  }, [meetings, feedMeetings]);
  const shownMeetingsRef = useRef(shownMeetings);
  shownMeetingsRef.current = shownMeetings;

  // Quietly refresh from Google when the app opens, every 10 minutes and on return (at most every 3 minutes), only when signed in
  useEffect(() => {
    if (isCloudConfigured && !userId) return;
    let lastRun = 0;
    let lastProbe = 0;
    const run = async () => {
      lastRun = Date.now();
      // the account may already be linked from another device: ask the server, but not more than every 30 minutes
      if (!getGoogleLink().serverLinked && Date.now() - lastProbe > 30 * 60_000) {
        lastProbe = Date.now();
        await probeServer().catch(() => undefined);
      }
      const l = getGoogleLink();
      // with the permanent link the token renews by itself; otherwise only while the browser sign-in is still valid
      if (l.autoSync && l.clientId && (l.serverLinked || (l.lastSyncAt && tokenIsValid(l)))) syncGoogleCalendar(false).catch(() => undefined);
    };
    const first = setTimeout(run, 4000);
    const t = setInterval(run, 10 * 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun > 3 * 60_000) void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 2. Meeting Operations
  const handleSaveMeeting = async (meetingData: Partial<Meeting>) => {
    const isNew = !meetingData.id;
    let savedMeeting: Meeting;

    if (isNew) {
      savedMeeting = {
        id: newId('meet'),
        workspaceId: 'default-ws',
        title: meetingData.title || 'Executive Meeting',
        description: meetingData.description || '',
        start: meetingData.start || new Date().toISOString(),
        end: meetingData.end || new Date().toISOString(),
        timezone: 'Africa/Cairo',
        organizer: 'Executive Office',
        attendees: meetingData.attendees || [],
        agenda: meetingData.agenda,
        decisions: meetingData.decisions || [],
        location: meetingData.location,
        syncState: 'internal_only',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'executive-user',
        ...meetingData,
      } as Meeting;

      setMeetings((prev) => [savedMeeting, ...prev]);
      await localDB.put('meetings', savedMeeting);
      syncMeetingToCloud(savedMeeting).catch(console.warn);
    } else {
      savedMeeting = {
        ...meetingData,
        updatedAt: new Date().toISOString(),
      } as Meeting;

      const prevMeeting = meetings.find((m) => m.id === savedMeeting.id);
      setMeetings((prev) => prev.map((m) => (m.id === savedMeeting.id ? savedMeeting : m)));
      await localDB.put('meetings', savedMeeting);
      syncMeetingToCloud(savedMeeting).catch(console.warn);

      if (prevMeeting) {
        triggerUndoToast(`Rescheduled "${savedMeeting.title}"`, async () => {
          setMeetings((curr) => curr.map((m) => (m.id === prevMeeting.id ? prevMeeting : m)));
          await localDB.put('meetings', prevMeeting);
          syncMeetingToCloud(prevMeeting).catch(console.warn);
        });
      }
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    const m = meetings.find((item) => item.id === meetingId);
    if (!m) return;

    setMeetings((prev) => prev.filter((item) => item.id !== meetingId));
    await localDB.delete('meetings', meetingId);
    deleteMeetingFromCloud(meetingId).catch(console.warn);

    triggerUndoToast(locale === 'ar' ? `تم حذف الاجتماع "${m.title}"` : `Meeting deleted: "${m.title}"`, async () => {
      setMeetings((prev) => [m, ...prev]);
      await localDB.put('meetings', m);
      syncMeetingToCloud(m).catch(console.warn);
    });
  };

  const handleAddDepartment = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || hasDuplicateName(departments, trimmed)) return;
    const next = [...departments, trimmed];
    setDepartments(next);
    await localDB.setDepartments(next);
  };

  // 3. Notebook, Ink & Page Data Operations (Supports Debounced Apple Pencil Sync)
  const handleUpdatePageData = async (
    pageId: string,
    data: {
      strokes?: InkStroke[];
      textNotes?: CanvasTextItem[];
      versions?: PageVersion[];
      title?: string;
      orientation?: 'landscape' | 'portrait';
      paperStyle?: PaperStyle;
      paperColor?: PaperColor;
    }
  ) => {
    const page = pagesRef.current.find((p) => p.id === pageId);
    if (!page) return;
    const updatedPage: NotebookPage = { ...page, ...data, updatedAt: new Date().toISOString() };
    pagesRef.current = pagesRef.current.map((p) => (p.id === pageId ? updatedPage : p));
    setPages(pagesRef.current);
    await localDB.put('pages', updatedPage);
    syncPageToCloud(updatedPage).catch(console.warn);
  };

  const handleUpdateStrokes = async (pageId: string, strokes: InkStroke[]) => {
    await handleUpdatePageData(pageId, { strokes });
  };

  const handleNewPage = async (notebookId: string) => {
    const targetNb = notebooks.find((n) => n.id === notebookId) || notebooks[0];
    const nbPages = pages.filter((p) => p.notebookId === targetNb.id);
    const newPageNum = nbPages.reduce((max, p) => Math.max(max, p.pageNumber || 0), 0) + 1;

    const newPage: NotebookPage = {
      id: newId('page'),
      notebookId: targetNb.id,
      workspaceId: 'default-ws',
      pageNumber: newPageNum,
      title: locale === 'ar' ? `صفحة ${newPageNum}` : `Page ${newPageNum}`,
      template: 'commercial_new_lands',
      strokes: [],
      linkedTaskIds: [],
      linkedMeetingIds: [],
      viewMode: 'split',
      orientation: 'landscape',
      paperStyle: 'ruled',
      paperColor: 'cream',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'executive-user',
    };

    setPages((prev) => [...prev, newPage]);
    setActivePageId(newPage.id);
    await localDB.put('pages', newPage);
    syncPageToCloud(newPage).catch(console.warn);
  };

  /** Finds a notebook by title or creates it (offline first, then cloud). Updates refs synchronously so double taps cannot duplicate it. */
  const ensureNotebook = async (title: string, category: Notebook['category'], description: string): Promise<Notebook> => {
    const existing = notebooksRef.current.find((n) => n.title === title);
    if (existing) return existing;
    const now = new Date().toISOString();
    const nb: Notebook = {
      id: newId('nb'),
      workspaceId: 'default-ws',
      title,
      description,
      category,
      pageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    notebooksRef.current = [...notebooksRef.current, nb];
    setNotebooks(notebooksRef.current);
    await localDB.put('notebooks', nb);
    syncNotebookToCloud(nb).catch(console.warn);
    return nb;
  };

  /** Appends pages to a notebook (page numbers continue); persists to IndexedDB and cloud. Does not change the active page. */
  const appendPagesToNotebook = async (
    nb: Notebook,
    specs: Array<Pick<NotebookPage, 'title' | 'template'> & Partial<NotebookPage>>
  ): Promise<NotebookPage[]> => {
    if (specs.length === 0) return [];
    const now = new Date().toISOString();
    let num = pagesRef.current.filter((p) => p.notebookId === nb.id).reduce((m, p) => Math.max(m, p.pageNumber || 0), 0);
    const created: NotebookPage[] = specs.map((spec) => {
      num += 1;
      return {
        strokes: [],
        textNotes: [],
        versions: [],
        linkedTaskIds: [],
        linkedMeetingIds: [],
        viewMode: 'handwritten',
        orientation: 'landscape',
        paperStyle: 'ruled',
        paperColor: 'cream',
        createdBy: 'executive-user',
        ...spec,
        id: newId('page'),
        notebookId: nb.id,
        workspaceId: 'default-ws',
        pageNumber: num,
        createdAt: now,
        updatedAt: now,
      };
    });
    pagesRef.current = [...pagesRef.current, ...created];
    setPages(pagesRef.current);
    const updatedNb: Notebook = {
      ...nb,
      pageCount: pagesRef.current.filter((p) => p.notebookId === nb.id).length,
      updatedAt: now,
    };
    notebooksRef.current = notebooksRef.current.map((n) => (n.id === nb.id ? updatedNb : n));
    setNotebooks(notebooksRef.current);
    await localDB.bulkPut('pages', created);
    await localDB.put('notebooks', updatedNb);
    syncNotebookToCloud(updatedNb).catch(console.warn);
    // cloud sync in the background, a few at a time (imports can be hundreds of pages)
    void (async () => {
      for (let i = 0; i < created.length; i += 4) {
        await Promise.allSettled(created.slice(i, i + 4).map((p) => syncPageToCloud(p)));
      }
    })();
    return created;
  };

  const PLANNER_NOTEBOOK_TITLE = 'Daily Planner 2026';

  /**
   * Opens the planner page a request points at, creating it first when it does not exist (always a user action).
   * An imported/archive page with the same plannerDate counts as existing.
   */
  const handleOpenPlannerPage = async (req: PlannerPageRequest) => {
    const defaults = plannerPageDefaults(req);
    if (req.kind === 'daily' || req.kind === 'monthly') {
      const date = req.kind === 'daily' ? req.date : req.month;
      const found = findPageForDate(pagesRef.current, date, req.kind === 'daily' ? 'day' : 'month');
      if (found) {
        setActiveNotebookId(found.notebookId);
        setActivePageId(found.id);
        return;
      }
    }
    const nb =
      req.kind === 'daily' || req.kind === 'monthly'
        ? await ensureNotebook(PLANNER_NOTEBOOK_TITLE, 'Executive Meetings & Decisions', 'Daily, monthly, to-do and meeting pages that follow the printed planner')
        : notebooksRef.current.find((n) => n.id === activeNotebookId) ||
          (await ensureNotebook(PLANNER_NOTEBOOK_TITLE, 'Executive Meetings & Decisions', 'Daily, monthly, to-do and meeting pages that follow the printed planner'));
    // re-check after the await: a double tap may already have created it
    if (req.kind === 'daily' || req.kind === 'monthly') {
      const date = req.kind === 'daily' ? req.date : req.month;
      const again = findPageForDate(pagesRef.current, date, req.kind === 'daily' ? 'day' : 'month');
      if (again) {
        setActiveNotebookId(again.notebookId);
        setActivePageId(again.id);
        return;
      }
    }
    const [page] = await appendPagesToNotebook(nb, [
      {
        title: defaults.title,
        template: defaults.template,
        ...(defaults.plannerDate ? { plannerDate: defaults.plannerDate } : {}),
        paperColor: defaults.paperColor,
        canvasSize: { ...PLANNER_CANVAS },
        orientation: 'landscape',
      },
    ]);
    if (page) {
      setActiveNotebookId(nb.id);
      setActivePageId(page.id);
    }
  };

  /** Adds pages produced by the planner PDF importer to a (found or created) notebook, without changing the active page. */
  const handleImportPlannerPages = async (notebookTitle: string, importPages: PlannerImportPage[]): Promise<void> => {
    const title = notebookTitle.trim() || PLANNER_NOTEBOOK_TITLE;
    const nb = await ensureNotebook(title, 'Executive Meetings & Decisions', 'Imported planner pages');
    await appendPagesToNotebook(
      nb,
      importPages.map((ip) => ({
        title: ip.title,
        template: ip.template,
        backgroundImage: ip.backgroundImage,
        canvasSize: ip.canvasSize,
        ...(ip.plannerDate ? { plannerDate: ip.plannerDate } : {}),
        ...(ip.transcription ? { transcription: ip.transcription } : {}),
        paperColor: 'white' as const,
      }))
    );
  };

  /** Creates an empty notebook (unique name) with a first blank page, and opens it in the library */
  const handleCreateNotebook = async (title: string) => {
    const base = title.trim();
    if (!base) return;
    let name = base;
    let n = 2;
    while (notebooksRef.current.some((nb) => nb.title === name)) name = `${base} (${n++})`;
    const nb = await ensureNotebook(name, 'Corporate / Personal', '');
    setActiveNotebookId(nb.id);
  };

  const handleDeletePage = async (pageId: string) => {
    const pageToDelete = pagesRef.current.find((p) => p.id === pageId);
    if (!pageToDelete) return;

    const remainingInNb = pagesRef.current.filter((p) => p.notebookId === pageToDelete.notebookId && p.id !== pageId);
    const remainingOverall = pagesRef.current.filter((p) => p.id !== pageId);

    // If active page is deleted, select adjacent page
    if (activePageId === pageId) {
      if (remainingInNb.length > 0) {
        setActivePageId(remainingInNb[0].id);
      } else if (remainingOverall.length > 0) {
        setActivePageId(remainingOverall[0].id);
      }
    }

    pagesRef.current = pagesRef.current.filter((p) => p.id !== pageId);
    setPages(pagesRef.current);
    await localDB.delete('pages', pageId);
    deletePageFromCloud(pageId).catch(console.warn);

    triggerUndoToast(
      locale === 'ar' ? `تم حذف الصفحة "${pageToDelete.title}"` : `Deleted page "${pageToDelete.title}"`,
      async () => {
        pagesRef.current = [...pagesRef.current.filter((p) => p.id !== pageToDelete.id), pageToDelete];
        setPages(pagesRef.current);
        setActivePageId(pageToDelete.id);
        await localDB.put('pages', pageToDelete);
        syncPageToCloud(pageToDelete).catch(console.warn);
      }
    );
  };

  const handleAcceptCandidate = async (candidate: ExtractedCandidate) => {
    const activePage = pagesRef.current.find((p) => p.id === candidate.pageId);

    // When the item is classified as a meeting
    if (candidate.entryType === 'meeting') {
      const meetingDateStr = candidate.suggestedMeetingDate || candidate.suggestedDueDate || getCairoDateString();
      const startTime24 = parseTimeTo24h(candidate.suggestedStartTime) || '10:00';
      const endParsed = parseTimeTo24h(candidate.suggestedEndTime);
      const startTimeStr = startTime24;

      let startIso: string;
      let endIso: string;
      try {
        startIso = cairoLocalToIso(meetingDateStr, startTime24);
        endIso = endParsed && endParsed > startTime24
          ? cairoLocalToIso(meetingDateStr, endParsed)
          : new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
      } catch {
        const now = new Date();
        startIso = now.toISOString();
        endIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      }

      const newMeeting: Meeting = {
        id: newId('meeting'),
        workspaceId: 'default-ws',
        title: candidate.suggestedTitle,
        description: `Recognized from handwritten notes. Raw text: "${candidate.rawTextArabic || candidate.rawTextEnglish}"`,
        start: startIso,
        end: endIso,
        timezone: 'Africa/Cairo',
        location: candidate.suggestedLocation || '',
        organizer: candidate.suggestedOwnerAlias || 'Executive Office',
        attendees: candidate.suggestedAttendees && candidate.suggestedAttendees.length > 0
          ? candidate.suggestedAttendees
          : candidate.suggestedOwnerAlias
          ? [candidate.suggestedOwnerAlias]
          : [],
        department: candidate.suggestedDepartment || 'Executive Office',
        project: candidate.suggestedProject || '',
        syncState: 'internal_only',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'executive-user',
      };

      setMeetings((prev) => [newMeeting, ...prev]);
      await localDB.put('meetings', newMeeting);
      syncMeetingToCloud(newMeeting).catch(console.warn);

      // Link meeting to page
      if (activePage) {
        const updatedPage = {
          ...activePage,
          linkedMeetingIds: [...(activePage.linkedMeetingIds || []), newMeeting.id],
          updatedAt: new Date().toISOString(),
        };
        setPages((prev) => prev.map((p) => (p.id === activePage.id ? updatedPage : p)));
        await localDB.put('pages', updatedPage);
        syncPageToCloud(updatedPage).catch(console.warn);
      }

      triggerUndoToast(
        locale === 'ar'
          ? `تمت جدولة الاجتماع في التقويم: "${newMeeting.title}" (${meetingDateStr} ${startTimeStr})`
          : `Scheduled Calendar Meeting: "${newMeeting.title}" (${meetingDateStr} at ${startTimeStr})`,
        async () => {
          setMeetings((prev) => prev.filter((m) => m.id !== newMeeting.id));
          await localDB.delete('meetings', newMeeting.id);
          deleteMeetingFromCloud(newMeeting.id).catch(console.warn);
        }
      );
      return;
    }

    // Standard task
    const newTask: Task = {
      id: newId('task'),
      workspaceId: 'default-ws',
      title: candidate.suggestedTitle,
      description: `Recognized from handwritten notes. Raw text: "${candidate.rawTextArabic || candidate.rawTextEnglish}"`,
      workstream: candidate.suggestedWorkstream,
      department: candidate.suggestedDepartment || 'Commercial',
      project: candidate.suggestedProject || '',
      location: '',
      ownerAlias: candidate.suggestedOwnerAlias || 'Unassigned',
      isOwnerVerified: false,
      status: candidate.suggestedStatus || 'Pending',
      completionDate: candidate.suggestedStatus === 'Closed' ? new Date().toISOString() : undefined,
      priority: 'Normal',
      dueDate: candidate.suggestedDueDate,
      nextAction: candidate.suggestedNextAction,
      sourceRef: {
        notebookId: activePage?.notebookId || 'nb-1',
        notebookTitle: notebooks.find((n) => n.id === activePage?.notebookId)?.title,
        pageId: candidate.pageId,
        pageNumber: activePage?.pageNumber || 1,
        boundingBox: candidate.boundingBox,
        snippetText: candidate.suggestedTitle,
      },
      isArchived: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'executive-user',
    };

    setTasks((prev) => [newTask, ...prev]);
    await localDB.put('tasks', newTask);
    syncTaskToCloud(newTask).catch(console.warn);

    // Link task to page
    if (activePage) {
      const updatedPage = {
        ...activePage,
        linkedTaskIds: [...(activePage.linkedTaskIds || []), newTask.id],
        updatedAt: new Date().toISOString(),
      };
      setPages((prev) => prev.map((p) => (p.id === activePage.id ? updatedPage : p)));
      await localDB.put('pages', updatedPage);
      syncPageToCloud(updatedPage).catch(console.warn);
    }

    triggerUndoToast(
      locale === 'ar' ? `تمت إضافة المهمة: "${newTask.title}"` : `Added task: "${newTask.title}"`,
      async () => {
        setTasks((prev) => prev.filter((t) => t.id !== newTask.id));
        await localDB.delete('tasks', newTask.id);
        deleteTaskFromCloud(newTask.id).catch(console.warn);
      }
    );
  };

  // Shared Tool Action Executor for Executive Assistant & Live Voice Spero.
  // Always reads the latest data through refs, because the live voice session outlives many renders.
  const handleExecuteToolAction = async (toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const findTask = () =>
      tasksRef.current.find(
        (t) =>
          (args.taskId && t.id === args.taskId) ||
          (args.taskTitleKeyword && norm(t.title).includes(norm(args.taskTitleKeyword)))
      );
    const findMeeting = () =>
      meetingsRef.current.find(
        (m) =>
          (args.meetingId && m.id === args.meetingId) ||
          (args.meetingTitleKeyword && norm(m.title).includes(norm(args.meetingTitleKeyword)))
      );

    if (toolName === 'createMeeting') {
      const startIso = normalizeToIso(args.start);
      const endIso = args.end
        ? normalizeToIso(args.end, new Date(new Date(startIso).getTime() + 60 * 60 * 1000))
        : new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();

      const newMeeting: Meeting = {
        id: newId('meet'),
        workspaceId: 'default-ws',
        title: String(args.title || args.subject || 'اجتماع تنفيذي جديد'),
        description: String(args.description || args.agenda || ''),
        start: startIso,
        end: new Date(endIso).getTime() > new Date(startIso).getTime() ? endIso : new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString(),
        timezone: 'Africa/Cairo',
        location: args.location ? String(args.location) : '',
        organizer: getSperoUser().fullName || user?.email || '',
        attendees: Array.isArray(args.attendees) ? (args.attendees as string[]) : [],
        project: String(args.project || ''),
        agenda: String(args.agenda || ''),
        syncState: 'internal_only',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'ai-assistant',
      };

      meetingsRef.current = [newMeeting, ...meetingsRef.current];
      setMeetings(meetingsRef.current);
      await localDB.put('meetings', newMeeting);
      syncMeetingToCloud(newMeeting).catch(console.warn);

      triggerUndoToast(
        locale === 'ar' ? `تمت جدولة الاجتماع في التقويم: "${newMeeting.title}"` : `Meeting scheduled in calendar: "${newMeeting.title}"`,
        async () => {
          setMeetings((prev) => prev.filter((m) => m.id !== newMeeting.id));
          await localDB.delete('meetings', newMeeting.id);
          deleteMeetingFromCloud(newMeeting.id).catch(console.warn);
        }
      );
      return { ok: true, createdMeetingId: newMeeting.id, title: newMeeting.title, start: newMeeting.start, end: newMeeting.end };
    }

    if (toolName === 'createTask') {
      const newTask: Task = {
        id: newId('task'),
        workspaceId: 'default-ws',
        title: String(args.title || 'مهمة جديدة'),
        description: String(args.description || ''),
        workstream: (args.workstream as Task['workstream']) || 'Commercial + New Lands',
        department: String(args.department || 'Commercial'),
        project: String(args.project || ''),
        location: String(args.location || ''),
        ownerAlias: String(args.ownerAlias || 'Unassigned'),
        isOwnerVerified: false,
        status: 'Pending',
        priority: (args.priority as Task['priority']) || 'Normal',
        dueDate: args.dueDate ? String(args.dueDate) : undefined,
        nextAction: args.nextAction ? String(args.nextAction) : undefined,
        counterpart: args.counterpart ? String(args.counterpart) : undefined,
        isArchived: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'ai-assistant',
      };

      tasksRef.current = [newTask, ...tasksRef.current];
      setTasks(tasksRef.current);
      await localDB.put('tasks', newTask);
      syncTaskToCloud(newTask).catch(console.warn);

      triggerUndoToast(
        locale === 'ar' ? `تمت إضافة المهمة: "${newTask.title}"` : `Added task: "${newTask.title}"`,
        async () => {
          setTasks((prev) => prev.filter((t) => t.id !== newTask.id));
          await localDB.delete('tasks', newTask.id);
          deleteTaskFromCloud(newTask.id).catch(console.warn);
        }
      );
      return { ok: true, createdTaskId: newTask.id, title: newTask.title };
    }

    if (toolName === 'deleteMeeting') {
      const match = findMeeting();
      if (!match) return { ok: false, error: 'No meeting matched that id or keyword. Nothing was deleted.' };
      meetingsRef.current = meetingsRef.current.filter((m) => m.id !== match.id);
      setMeetings(meetingsRef.current);
      await localDB.delete('meetings', match.id);
      deleteMeetingFromCloud(match.id).catch(console.warn);
      triggerUndoToast(locale === 'ar' ? `تم حذف الاجتماع "${match.title}"` : `Deleted meeting "${match.title}"`, async () => {
        setMeetings((prev) => [match, ...prev]);
        await localDB.put('meetings', match);
        syncMeetingToCloud(match).catch(console.warn);
      });
      return { ok: true, deletedMeetingId: match.id, title: match.title };
    }

    if (toolName === 'deleteTask') {
      const match = findTask();
      if (!match) return { ok: false, error: 'No task matched that id or keyword. Nothing was deleted.' };
      tasksRef.current = tasksRef.current.filter((t) => t.id !== match.id);
      setTasks(tasksRef.current);
      await localDB.delete('tasks', match.id);
      deleteTaskFromCloud(match.id).catch(console.warn);
      triggerUndoToast(locale === 'ar' ? `تم حذف المهمة "${match.title}"` : `Deleted task "${match.title}"`, async () => {
        setTasks((prev) => [match, ...prev]);
        await localDB.put('tasks', match);
        syncTaskToCloud(match).catch(console.warn);
      });
      return { ok: true, deletedTaskId: match.id, title: match.title };
    }

    if (toolName === 'setTaskStatus' || toolName === 'updateTask') {
      const match = findTask();
      if (!match) return { ok: false, error: 'No task matched that id or keyword.' };
      const newStatus = (toolName === 'setTaskStatus' ? args.newStatus : args.status) as Task['status'] | undefined;
      const updated: Task = {
        ...match,
        title: toolName === 'updateTask' && args.title ? String(args.title) : match.title,
        status: newStatus || match.status,
        dueDate: toolName === 'updateTask' && args.dueDate ? String(args.dueDate) : match.dueDate,
        nextAction: toolName === 'updateTask' && args.nextAction ? String(args.nextAction) : match.nextAction,
        ownerAlias: toolName === 'updateTask' && args.ownerAlias ? String(args.ownerAlias) : match.ownerAlias,
        closureReason: args.closureReason ? String(args.closureReason) : match.closureReason,
        completionDate: newStatus === 'Closed' ? new Date().toISOString() : newStatus ? undefined : match.completionDate,
        version: (match.version || 1) + 1,
        updatedAt: new Date().toISOString(),
      };
      tasksRef.current = tasksRef.current.map((t) => (t.id === match.id ? updated : t));
      setTasks(tasksRef.current);
      await localDB.put('tasks', updated);
      syncTaskToCloud(updated).catch(console.warn);
      triggerUndoToast(locale === 'ar' ? `تم تحديث المهمة: "${updated.title}"` : `Task updated: "${updated.title}"`, async () => {
        setTasks((prev) => prev.map((t) => (t.id === match.id ? match : t)));
        await localDB.put('tasks', match);
        syncTaskToCloud(match).catch(console.warn);
      });
      return { ok: true, updatedTaskId: match.id, title: updated.title, status: updated.status };
    }

    if (toolName === 'searchTasks') {
      const kw = norm(args.keyword);
      const today = getCairoDateString();
      const found = tasksRef.current
        .filter((t) => !t.isArchived)
        .filter((t) => !args.workstream || t.workstream === args.workstream)
        .filter((t) => !args.department || norm(t.department) === norm(args.department))
        .filter((t) => !args.status || t.status === args.status)
        .filter((t) => !args.ownerAlias || norm(t.ownerAlias) === norm(args.ownerAlias))
        .filter((t) => !kw || norm(`${t.title} ${t.description} ${t.project}`).includes(kw))
        .filter((t) => !args.overdueOnly || (!!t.dueDate && t.dueDate < today && t.status !== 'Closed'))
        .slice(0, 30)
        .map((t) => ({ id: t.id, title: t.title, status: t.status, owner: t.ownerAlias, dueDate: t.dueDate, project: t.project, nextAction: t.nextAction }));
      return { ok: true, count: found.length, tasks: found };
    }

    if (toolName === 'rescheduleMeeting') {
      const match = findMeeting();
      if (!match) return { ok: false, error: 'No meeting matched that id or keyword. Nothing was rescheduled.' };
      const startIso = normalizeToIso(args.newStart, new Date(match.start));
      const duration = Math.max(15 * 60 * 1000, new Date(match.end).getTime() - new Date(match.start).getTime());
      const endIso = args.newEnd
        ? normalizeToIso(args.newEnd, new Date(new Date(startIso).getTime() + duration))
        : new Date(new Date(startIso).getTime() + duration).toISOString();
      const updated: Meeting = {
        ...match,
        start: startIso,
        end: new Date(endIso).getTime() > new Date(startIso).getTime() ? endIso : new Date(new Date(startIso).getTime() + duration).toISOString(),
        updatedAt: new Date().toISOString(),
      };
      meetingsRef.current = meetingsRef.current.map((m) => (m.id === match.id ? updated : m));
      setMeetings(meetingsRef.current);
      await localDB.put('meetings', updated);
      syncMeetingToCloud(updated).catch(console.warn);
      triggerUndoToast(locale === 'ar' ? `تم تعديل ميعاد "${match.title}"` : `Rescheduled "${match.title}"`, async () => {
        setMeetings((prev) => prev.map((m) => (m.id === match.id ? match : m)));
        await localDB.put('meetings', match);
        syncMeetingToCloud(match).catch(console.warn);
      });
      return { ok: true, meetingId: match.id, title: match.title, start: updated.start, end: updated.end };
    }

    if (toolName === 'navigateTo') {
      const tab = String(args.tab || '');
      if (!['today', 'notebook', 'planner', 'tasks', 'calendar', 'followup', 'directory', 'chat', 'settings'].includes(tab)) return { ok: false, error: 'Unknown tab.' };
      setCurrentTab(tab);
      return { ok: true, openedTab: tab };
    }
    if (toolName === 'openItem') {
      if (args.kind === 'task') {
        const t = tasksRef.current.find((x) => (args.id && x.id === args.id) || (args.keyword && norm(x.title).includes(norm(args.keyword)))) || findTask();
        if (!t) return { ok: false, error: 'No task matched.' };
        setSelectedTaskForModal(t);
        setIsTaskModalOpen(true);
        return { ok: true, opened: t.title };
      }
      const m = findMeeting() || shownMeetingsRef.current.find((x) => (args.id && x.id === args.id) || (args.keyword && norm(x.title).includes(norm(args.keyword))));
      if (!m) return { ok: false, error: 'No meeting matched.' };
      setSelectedMeetingForModal(m);
      setSelectedMeetingInitialDate(undefined);
      setSelectedMeetingInitialTime(undefined);
      setIsMeetingModalOpen(true);
      return { ok: true, opened: m.title };
    }
    if (toolName === 'closeWindows') {
      setIsTaskModalOpen(false);
      setIsMeetingModalOpen(false);
      setSelectedTaskForModal(null);
      setSelectedMeetingForModal(null);
      setIsBackupModalOpen(false);
      return { ok: true };
    }
    if (toolName === 'closeAssistant') {
      setTimeout(() => setIsLiveVoiceModalOpen(false), 2500);
      return { ok: true, note: 'The voice window will close in a moment; say a short farewell.' };
    }
    if (toolName === 'listMeetings') {
      const kw = norm(args.keyword);
      const from = args.fromDate ? String(args.fromDate) : '';
      const to = args.toDate ? String(args.toDate) : '';
      const found = shownMeetingsRef.current
        .filter((m) => !from || cairoDateOf(m.start) >= from)
        .filter((m) => !to || cairoDateOf(m.start) <= to)
        .filter((m) => !kw || norm(`${m.title} ${m.description} ${m.project} ${(m.attendees || []).join(' ')}`).includes(kw))
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, 30)
        .map((m) => ({ id: m.id, title: m.title, date: cairoDateOf(m.start), time: cairoTimeOf(m.start), end: cairoTimeOf(m.end), location: m.location, attendees: m.attendees, agenda: m.agenda, source: m.id.startsWith('ics_') ? 'Outlook (read-only)' : m.id.startsWith('gcal_') ? 'Google' : 'system' }));
      return { ok: true, count: found.length, meetings: found };
    }
    if (toolName === 'updateMeeting') {
      const match = findMeeting();
      if (!match) return { ok: false, error: 'No meeting matched that id or keyword.' };
      const updated: Meeting = {
        ...match,
        title: args.title ? String(args.title) : match.title,
        location: args.location !== undefined ? String(args.location) : match.location,
        attendees: Array.isArray(args.attendees) ? (args.attendees as string[]) : match.attendees,
        agenda: args.agenda !== undefined ? String(args.agenda) : match.agenda,
        description: args.description !== undefined ? String(args.description) : match.description,
        project: args.project !== undefined ? String(args.project) : match.project,
        updatedAt: new Date().toISOString(),
      };
      meetingsRef.current = meetingsRef.current.map((m) => (m.id === match.id ? updated : m));
      setMeetings(meetingsRef.current);
      await localDB.put('meetings', updated);
      syncMeetingToCloud(updated).catch(console.warn);
      triggerUndoToast(locale === 'ar' ? `تم تحديث الاجتماع "${updated.title}"` : `Meeting updated: "${updated.title}"`, async () => {
        setMeetings((prev) => prev.map((m) => (m.id === match.id ? match : m)));
        await localDB.put('meetings', match);
        syncMeetingToCloud(match).catch(console.warn);
      });
      return { ok: true, meetingId: match.id, title: updated.title };
    }
    if (toolName === 'getMeetingBriefing') {
      const m = findMeeting() || shownMeetingsRef.current.find((x) => (args.meetingId && x.id === args.meetingId) || (args.meetingTitleKeyword && norm(x.title).includes(norm(args.meetingTitleKeyword))));
      if (!m) return { ok: false, error: 'No meeting matched.' };
      const words = norm(`${m.title} ${m.project} ${(m.attendees || []).join(' ')}`).split(/[\s,-]+/).filter((w) => w.length > 2);
      const related = tasksRef.current
        .filter((t) => !t.isArchived && t.status !== 'Closed')
        .filter((t) => { const hay = norm(`${t.title} ${t.project} ${t.ownerAlias} ${t.counterpart}`); return words.some((w) => hay.includes(w)); })
        .slice(0, 10)
        .map((t) => ({ title: t.title, status: t.status, owner: t.ownerAlias, dueDate: t.dueDate, nextAction: t.nextAction }));
      return { ok: true, meeting: { title: m.title, date: cairoDateOf(m.start), time: cairoTimeOf(m.start), location: m.location, attendees: m.attendees, agenda: m.agenda, description: m.description, project: m.project }, relatedOpenTasks: related };
    }
    if (toolName === 'archiveTask') {
      const match = findTask();
      if (!match) return { ok: false, error: 'No task matched.' };
      const archived = args.archived !== false;
      const updated: Task = { ...match, isArchived: archived, version: (match.version || 1) + 1, updatedAt: new Date().toISOString() };
      tasksRef.current = tasksRef.current.map((t) => (t.id === match.id ? updated : t));
      setTasks(tasksRef.current);
      await localDB.put('tasks', updated);
      syncTaskToCloud(updated).catch(console.warn);
      triggerUndoToast(locale === 'ar' ? `${archived ? 'تمت أرشفة' : 'تمت استعادة'} المهمة "${match.title}"` : `${archived ? 'Archived' : 'Restored'} task "${match.title}"`, async () => {
        setTasks((prev) => prev.map((t) => (t.id === match.id ? match : t)));
        await localDB.put('tasks', match);
        syncTaskToCloud(match).catch(console.warn);
      });
      return { ok: true, title: match.title, archived };
    }


    // ----- team: people, chat, birthdays
    const teamNow = getTeam();
    const others = () => teamNow.profiles.filter((p) => p.active && p.user_id !== teamNow.meId);
    const findPeople = (names: string[]): { found: typeof teamNow.profiles; problem?: string } => {
      const found: typeof teamNow.profiles = [];
      for (const raw of names) {
        const q = norm(raw).replace(/^(م\.|د\.|eng\.?|dr\.?|mr\.?|mrs\.?|ms\.?|المهندس|المهندسة|الدكتور|الدكتورة|الأستاذ|الأستاذة|استاذ|أستاذ)\s*/i, '');
        if (!q) continue;
        const hits = others().filter((p) => norm(`${nameOf(p)} ${p.email}`).includes(q) || q.split(/\s+/).every((w) => norm(nameOf(p)).includes(w)));
        if (hits.length === 0) return { found, problem: `No colleague matches "${raw}". Team: ${others().map((p) => nameOf(p)).join(', ') || 'nobody yet'}` };
        if (hits.length > 1) return { found, problem: `"${raw}" matches several people: ${hits.map((p) => nameOf(p)).join(', ')}. Ask which one.` };
        if (!found.some((f) => f.user_id === hits[0].user_id)) found.push(hits[0]);
      }
      return { found };
    };
    const teamOff = () => ({ ok: false, error: 'Team features need the cloud sign-in; they are not available on this device.' });

    if (toolName === 'listTeam') {
      if (!teamNow.ready) return teamOff();
      const kw = norm(args.nameKeyword);
      const today = getCairoDateString();
      const list = teamNow.profiles
        .filter((p) => p.active && (!kw || norm(`${nameOf(p)} ${p.email}`).includes(kw)))
        .map((p) => ({ name: nameOf(p), isMe: p.user_id === teamNow.meId, role: p.role === 'admin' ? 'administrator' : 'manager', email: p.email, phone: p.phone || undefined, birthday: p.birthday ? p.birthday.slice(5) : undefined }));
      return { ok: true, count: list.length, people: list, birthdaysToday: birthdaysOn(teamNow.profiles, today).map((p) => nameOf(p)) };
    }
    if (toolName === 'sendTeamMessage') {
      if (!teamNow.ready) return teamOff();
      const text = String(args.text || '').trim();
      const names = Array.isArray(args.recipients) ? (args.recipients as unknown[]).map(String) : [];
      if (!text || names.length === 0) return { ok: false, error: 'Need the message text and at least one recipient.' };
      const { found, problem } = findPeople(names);
      if (problem) return { ok: false, error: problem };
      if (args.confirmed !== true) return { ok: false, needsConfirmation: true, preview: { to: found.map((p) => nameOf(p)), text }, note: 'Read this back to the user and ask for a clear yes, then call again with confirmed=true.' };
      if (found.length === 1) {
        const tid = await openDirect(found[0].user_id);
        await sendMessage(tid, text);
      } else {
        await broadcast(found.map((p) => p.user_id), text);
      }
      return { ok: true, sentTo: found.map((p) => nameOf(p)), text };
    }
    if (toolName === 'readTeamMessages') {
      if (!teamNow.ready) return teamOff();
      const from = String(args.fromName || '').trim();
      const names = new Map(teamNow.profiles.map((p) => [p.user_id, nameOf(p)]));
      let threads = teamNow.threads;
      if (from) {
        const { found, problem } = findPeople([from]);
        if (problem) return { ok: false, error: problem };
        const ids = new Set(teamNow.members.filter((m) => m.user_id === found[0].user_id).map((m) => m.thread_id));
        threads = threads.filter((t) => ids.has(t.id));
        await Promise.all(threads.map((t) => loadMessages(t.id)));
      } else {
        threads = threads.filter((t) => teamNow.unread[t.id]);
      }
      const fresh = getTeam();
      const out = threads.slice(0, 8).map((t) => {
        const msgs = (fresh.messages[t.id] || []).slice(from ? -6 : -(fresh.unread[t.id] || 0) || -1);
        return {
          chat: t.kind === 'group' ? t.title || 'Group' : names.get(teamNow.members.find((m) => m.thread_id === t.id && m.user_id !== teamNow.meId)?.user_id || '') || '—',
          messages: msgs.map((m) => ({
            from: m.sender_id === teamNow.meId ? 'me' : names.get(m.sender_id) || '—',
            when: `${cairoDateOf(m.created_at)} ${cairoTimeOf(m.created_at)}`,
            text: m.body || (m.attachments.length ? `[${m.attachments.map((a) => (a.kind === 'image' ? 'photo' : a.name)).join(', ')}]` : ''),
          })),
        };
      });
      if (args.markRead !== false) await Promise.all(threads.map((t) => markRead(t.id)));
      return { ok: true, chats: out, unreadChats: out.length === 0 && !from ? 0 : undefined };
    }
    if (toolName === 'openChat') {
      if (!teamNow.ready) return teamOff();
      const name = String(args.name || '').trim();
      if (name) {
        const { found, problem } = findPeople([name]);
        if (problem) return { ok: false, error: problem };
        setChatWith(found[0].user_id);
      }
      setCurrentTab('chat');
      return { ok: true, opened: name || 'chat list' };
    }
    if (toolName === 'refreshCalendars') {
      const result: Record<string, unknown> = { ok: true };
      const link = getGoogleLink();
      if (link.serverLinked || tokenIsValid(link)) {
        try {
          const r = await syncGoogleCalendar(false);
          result.google = { added: r.added, updated: r.updated, removed: r.removed };
        } catch (e) {
          result.google = { error: (e as Error)?.message || 'failed' };
        }
      } else result.google = 'not connected';
      if (getFeedState().url) {
        try {
          result.outlookMeetings = (await refreshFeed()).length;
        } catch (e) {
          result.outlook = { error: (e as Error)?.message || 'failed' };
        }
      } else result.outlook = 'not connected';
      return result;
    }
    if (toolName === 'getConnectionStatus') {
      const link = getGoogleLink();
      const me = teamNow.profiles.find((p) => p.user_id === teamNow.meId);
      return {
        ok: true,
        aiKeys: keyManager.getSettings().slots.filter((k) => k.key).length,
        googleCalendar: link.serverLinked || (link.email && link.lastSyncAt) ? `connected (${link.email || 'Google'})` : 'not connected',
        outlookWorkCalendar: getFeedState().url ? `connected (${getFeedState().count ?? 0} meetings)` : 'not connected',
        profileName: me?.display_name || 'not set',
        where: 'Today page card "Get set up", or Settings',
      };
    }

    return { ok: false, error: `Unknown action: ${toolName}` };
  };

  // 4. Gemini Executive Assistant Message Dispatch
  const handleSendMessage = async (userText: string) => {
    const userMsg: AssistantMessage = {
      id: newId('msg'),
      role: 'user',
      content: userText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    await localDB.put('messages', userMsg);

    try {
      const workspaceContext = {
        activeTasksCount: tasks.filter((t) => !t.isArchived && t.status !== 'Closed').length,
        topProjects: projects.slice(0, 5).map((p) => p.name),
        recentMeetings: meetings.slice(0, 3).map((m) => ({ id: m.id, title: m.title, start: m.start })),
        recentTasks: tasks.slice(0, 5).map((t) => ({ id: t.id, title: t.title, status: t.status, owner: t.ownerAlias })),
      };

      const data = await chatWithAssistant(userText, workspaceContext);
      const toolInvocations: NonNullable<AssistantMessage['toolInvocations']> = [];

      // Execute authorized tools returned by Gemini
      for (const call of data.functionCalls) {
        const resObj = await handleExecuteToolAction(call.name, call.args);
        toolInvocations.push({
          toolName: call.name,
          args: call.args,
          result: resObj,
          status: resObj.ok === false ? 'error' : 'success',
          undoAvailable: false,
        });
      }

      const botMsg: AssistantMessage = {
        id: newId('msg'),
        role: 'assistant',
        content: data.content || (toolInvocations.length > 0 ? `تم تنفيذ الأمر بنجاح، ${callAr()}.` : ''),
        toolInvocations,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botMsg]);
      await localDB.put('messages', botMsg);

      // Record in recent voice commands log
      try {
        const storedCmds = JSON.parse(localStorage.getItem('spero_recent_voice_commands') || '[]');
        const newRecord = {
          id: newId('cmd'),
          commandText: userText,
          source: 'voice',
          timestamp: new Date().toISOString(),
          executedTools: toolInvocations.map((ti) => ti.toolName),
          status: 'executed',
          responseSnippet: botMsg.content.slice(0, 100),
        };
        const updatedCmds = [newRecord, ...storedCmds.filter((c: { commandText: string }) => c.commandText !== userText)].slice(0, 30);
        localStorage.setItem('spero_recent_voice_commands', JSON.stringify(updatedCmds));
        window.dispatchEvent(new CustomEvent('spero-recent-command-added'));
      } catch (e) {
        console.warn('Recent voice command save notice:', e);
      }
    } catch (err: unknown) {
      console.error('Chat error:', err);
      const noKeys = (err as Error)?.name === 'NoKeysConfiguredError';
      const errBotMsg: AssistantMessage = {
        id: newId('msg'),
        role: 'assistant',
        content: noKeys
          ? locale === 'ar'
            ? 'لازم تضيف مفتاح Gemini واحد على الأقل من صفحة الإعدادات عشان أقدر أرد عليك.'
            : 'Please add at least one Gemini API key in Settings so I can respond.'
          : locale === 'ar'
          ? 'نعتذر، جميع مفاتيح Gemini مشغولة أو بلغت حدّها حالياً. يواصل النظام المحاولة تلقائياً، يُرجى إعادة المحاولة بعد لحظات.'
          : `Sorry${callEn()}, all Gemini keys are busy or rate-limited right now. The system keeps retrying; please try again in a moment.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errBotMsg]);
    }
  };

  const handleUndoToolAction = async (undoAction: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const action = undoAction as any;
    if (!action) return;

    if (action.action === 'delete_task') {
      setTasks((prev) => prev.filter((t) => t.id !== action.recordId));
      await localDB.delete('tasks', action.recordId);
      deleteTaskFromCloud(action.recordId).catch(console.warn);
    } else if (action.action === 'restore_status') {
      const match = tasks.find((t) => t.id === action.recordId);
      if (match) {
        const reverted = { ...match, status: action.previousData, updatedAt: new Date().toISOString() };
        setTasks((prev) => prev.map((t) => (t.id === match.id ? reverted : t)));
        await localDB.put('tasks', reverted);
        syncTaskToCloud(reverted).catch(console.warn);
      }
    } else if (action.action === 'delete_meeting') {
      setMeetings((prev) => prev.filter((m) => m.id !== action.recordId));
      await localDB.delete('meetings', action.recordId);
      deleteMeetingFromCloud(action.recordId).catch(console.warn);
    } else if (action.action === 'restore_meeting_time') {
      const match = meetings.find((m) => m.id === action.recordId);
      if (match) {
        const reverted = { ...match, ...action.previousData, updatedAt: new Date().toISOString() };
        setMeetings((prev) => prev.map((m) => (m.id === match.id ? reverted : m)));
        await localDB.put('meetings', reverted);
        syncMeetingToCloud(reverted).catch(console.warn);
      }
    }
  };

  // Restore flow: make the restored workspace authoritative locally AND in the cloud
  const handleRestoreCompleted = async (fresh: WorkspaceState, mode: 'replace' | 'merge') => {
    const before = {
      tasks: tasksRef.current,
      meetings: meetingsRef.current,
      notebooks: notebooksRef.current,
      pages: pagesRef.current,
      people: peopleRef.current,
      projects: projectsRef.current,
    };
    tasksRef.current = fresh.tasks;
    meetingsRef.current = fresh.meetings;
    pagesRef.current = fresh.pages;
    setTasks(fresh.tasks);
    setMeetings(fresh.meetings);
    setNotebooks(fresh.notebooks);
    setPages(fresh.pages);
    setPeople(fresh.people);
    setProjects(fresh.projects);
    if (mode === 'replace') setMessages(fresh.messages);
    try {
      const deps = await localDB.getDepartments();
      if (deps) setDepartments(deps);
    } catch (err) {
      console.warn('Could not reload departments:', err);
    }
    if (!fresh.notebooks.some((n) => n.id === activeNotebookId) && fresh.notebooks.length > 0) {
      setActiveNotebookId(fresh.notebooks[0].id);
    }
    if (!fresh.pages.some((p) => p.id === activePageId) && fresh.pages.length > 0) {
      setActivePageId(fresh.pages[0].id);
    }

    // Replace removes cloud records that are not in the file
    const stale = <T extends { id: string }>(old: T[], next: T[]) => {
      const keep = new Set(next.map((x) => x.id));
      return old.filter((x) => !keep.has(x.id));
    };
    if (mode === 'replace') {
      stale(before.tasks, fresh.tasks).forEach((x) => deleteTaskFromCloud(x.id).catch(console.warn));
      stale(before.meetings, fresh.meetings).forEach((x) => deleteMeetingFromCloud(x.id).catch(console.warn));
      stale(before.notebooks, fresh.notebooks).forEach((x) => deleteNotebookFromCloud(x.id).catch(console.warn));
      stale(before.pages, fresh.pages).forEach((x) => deletePageFromCloud(x.id).catch(console.warn));
      stale(before.people, fresh.people).forEach((x) => deletePersonFromCloud(x.id).catch(console.warn));
      stale(before.projects, fresh.projects).forEach((x) => deleteProjectFromCloud(x.id).catch(console.warn));
    }
    // Every restored record is pushed so the cloud (and other devices) match the restored workspace
    fresh.tasks.forEach((x) => syncTaskToCloud(x).catch(console.warn));
    fresh.meetings.forEach((x) => syncMeetingToCloud(x).catch(console.warn));
    fresh.notebooks.forEach((x) => syncNotebookToCloud(x).catch(console.warn));
    fresh.pages.forEach((x) => syncPageToCloud(x).catch(console.warn));
    fresh.people.forEach((x) => syncPersonToCloud(x).catch(console.warn));
    fresh.projects.forEach((x) => syncProjectToCloud(x).catch(console.warn));
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#11161F] flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isCloudConfigured && user && (recovering || mustChangePassword)) {
    return <ResetPasswordScreen welcome={mustChangePassword && !recovering} onDone={() => setRecovering(false)} />;
  }

  if (isCloudConfigured && !user) {
    return <LoginScreen />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#11161F] flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-10 h-10 border-3 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-mono text-slate-400">Loading Alkammah Memo...</p>
      </div>
    );
  }

  return (
    <AppShell
      currentTab={currentTab}
      chatEnabled={isCloudConfigured}
      locale={locale}
      isCloudConnected={isCloudConnected}
      undoToast={undoToast}
      hideTopBar={isFullScreenPaper && currentTab === 'notebook'}
      onNavigateTab={setCurrentTab}
      onToggleLocale={() => setLocale(locale === 'en' ? 'ar' : 'en')}
      onOpenQuickTask={() => {
        setSelectedTaskForModal(null);
        setIsTaskModalOpen(true);
      }}
      onOpenQuickMeeting={() => {
        setSelectedMeetingForModal(null);
        setIsMeetingModalOpen(true);
      }}
      onOpenBackupModal={() => setIsBackupModalOpen(true)}
      headerExtras={
        <NotificationCenter
          meetings={shownMeetings}
          tasks={tasks}
          locale={locale}
          onOpenMeeting={(m) => {
            setCurrentTab('calendar');
            setSelectedMeetingForModal(m);
            setSelectedMeetingInitialDate(undefined);
            setSelectedMeetingInitialTime(undefined);
            setIsMeetingModalOpen(true);
          }}
          onOpenTask={(t) => {
            setCurrentTab('tasks');
            setSelectedTaskForModal(t);
            setIsTaskModalOpen(true);
          }}
        />
      }
    >
      {/* Tab Views */}
      {currentTab === 'today' && isCloudConfigured && <SetupGuide ar={locale === 'ar'} onSyncGoogle={syncGoogleCalendar} />}
      {currentTab === 'today' && isCloudConfigured && (
        <BirthdayBanner
          ar={locale === 'ar'}
          today={getCairoDateString()}
          onWish={(id) => {
            setChatWith(id);
            setCurrentTab('chat');
          }}
        />
      )}
      {currentTab === 'chat' && isCloudConfigured && <ChatCenter locale={locale} openWith={chatWith} onOpened={() => setChatWith(null)} />}

      {currentTab === 'today' && (
        <TodayBriefing
          tasks={tasks}
          meetings={shownMeetings}
          locale={locale}
          onNavigateToTab={setCurrentTab}
          onOpenTaskModal={(task) => {
            setSelectedTaskForModal(task);
            setIsTaskModalOpen(true);
          }}
          onOpenMeetingModal={(meeting) => {
            setSelectedMeetingForModal(meeting);
            setSelectedMeetingInitialDate(undefined);
            setSelectedMeetingInitialTime(undefined);
            setIsMeetingModalOpen(true);
          }}
          onQuickStatusChange={handleUpdateTaskStatus}
        />
      )}

      {currentTab === 'notebook' && (
        <NotebookView
          notebooks={notebooks}
          pages={pages}
          tasks={tasks}
          activeNotebookId={activeNotebookId}
          activePageId={activePageId}
          locale={locale}
          isFullScreenPaper={isFullScreenPaper}
          onToggleFullScreenPaper={() => setIsFullScreenPaper((prev) => !prev)}
          onSelectNotebook={setActiveNotebookId}
          onSelectPage={setActivePageId}
          onUpdateStrokes={handleUpdateStrokes}
          onUpdatePageData={handleUpdatePageData}
          onAcceptCandidate={handleAcceptCandidate}
          onOpenTaskModal={(task) => {
            setSelectedTaskForModal(task);
            setIsTaskModalOpen(true);
          }}
          onNewPage={handleNewPage}
          onOpenPlanner={handleOpenPlannerPage}
          onDeletePage={handleDeletePage}
          onCreateNotebook={handleCreateNotebook}
          onOpenImport={() => setIsBackupModalOpen(true)}
        />
      )}

      {/* Tasks & Calendar Unified Hub Navigation */}
      {['planner', 'tasks', 'calendar', 'followup'].includes(currentTab) && (
        <div className="max-w-6xl mx-auto mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-[#d2d2d7] shadow-2xs">
            <button
              onClick={() => setCurrentTab('tasks')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                currentTab === 'tasks' || currentTab === 'planner'
                  ? 'bg-[#0071e3] text-white shadow-xs font-bold'
                  : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              {locale === 'ar' ? 'مركز المهام' : 'Tasks Center'} ({tasks.filter((t) => !t.isArchived && !t.isTiny && t.status !== 'Closed').length})
            </button>
            <button
              onClick={() => setCurrentTab('calendar')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                currentTab === 'calendar'
                  ? 'bg-[#0071e3] text-white shadow-xs font-bold'
                  : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              {locale === 'ar' ? 'التقويم التنفيذي' : 'Executive Calendar'} ({meetings.length})
            </button>
            <button
              onClick={() => setCurrentTab('followup')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                currentTab === 'followup'
                  ? 'bg-[#0071e3] text-white shadow-xs font-bold'
                  : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              {locale === 'ar' ? 'مركز المتابعة' : 'Follow-up Center'}
            </button>
          </div>
        </div>
      )}

      {(currentTab === 'tasks' || currentTab === 'planner') && (
        <TaskCenter
          tasks={tasks}
          locale={locale}
          onOpenTaskModal={(task) => {
            setSelectedTaskForModal(task);
            setIsTaskModalOpen(true);
          }}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          onToggleArchive={handleToggleArchiveTask}
          onDeleteTask={handleDeleteTask}
          onReorderTasks={handleReorderTasks}
          departments={departments}
        />
      )}

      {currentTab === 'calendar' && (
        <CalendarCenter
          meetings={shownMeetings}
          tasks={tasks}
          locale={locale}
          onOpenMeetingModal={(meeting, initialDate, initialStartTime) => {
            setSelectedMeetingForModal(meeting);
            setSelectedMeetingInitialDate(initialDate);
            setSelectedMeetingInitialTime(initialStartTime);
            setIsMeetingModalOpen(true);
          }}
          onOpenTaskModal={(task) => {
            setSelectedTaskForModal(task);
            setIsTaskModalOpen(true);
          }}
          onAddTinyTask={handleAddTinyTask}
          onSetTaskStatus={handleUpdateTaskStatus}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {currentTab === 'followup' && (
        <FollowUpCenter
          tasks={tasks}
          locale={locale}
          onOpenTaskModal={(task) => {
            setSelectedTaskForModal(task);
            setIsTaskModalOpen(true);
          }}
          onUpdateTask={handleSaveTask}
        />
      )}

      {currentTab === 'directory' && (
        <DirectoryCenter
          people={people}
          projects={projects}
          locale={locale}
          onUpdatePerson={async (p) => {
            setPeople((prev) => prev.map((item) => (item.id === p.id ? p : item)));
            await localDB.put('people', p);
            syncPersonToCloud(p).catch(console.warn);
          }}
          onAddPerson={async (p) => {
            const now = new Date().toISOString();
            const newP = { id: newId('p'), workspaceId: 'default-ws', isActive: true, createdAt: now, updatedAt: now, ...p } as Person;
            setPeople((prev) => [...prev, newP]);
            await localDB.put('people', newP);
            syncPersonToCloud(newP).catch(console.warn);
          }}
          onUpdateProject={async (proj) => {
            setProjects((prev) => prev.map((item) => (item.id === proj.id ? proj : item)));
            await localDB.put('projects', proj);
            syncProjectToCloud(proj).catch(console.warn);
          }}
          onAddProject={async (proj) => {
            const now = new Date().toISOString();
            const newProj = { id: newId('proj'), workspaceId: 'default-ws', sponsor: '', createdAt: now, updatedAt: now, ...proj } as Project;
            setProjects((prev) => [...prev, newProj]);
            await localDB.put('projects', newProj);
            syncProjectToCloud(newProj).catch(console.warn);
          }}
          departments={departments}
          onAddDepartment={handleAddDepartment}
        />
      )}

      {currentTab === 'settings' && (
        <SettingsView
          locale={locale}
          isCloudConnected={isCloudConnected}
          isCloudConfigured={isCloudConfigured}
          userEmail={user?.email}
          onSignOut={() => {
            disableLock();
            void signOutUser();
          }}
          onSyncGoogle={syncGoogleCalendar}
        />
      )}

      {currentTab === 'assistant' && (
        <ExecutiveAssistant
          messages={messages}
          tasks={tasks}
          meetings={shownMeetings}
          locale={locale}
          onSendMessage={handleSendMessage}
          onExecuteToolAction={handleExecuteToolAction}
          onUndoToolAction={handleUndoToolAction}
          onOpenLiveVoice={() => setIsLiveVoiceModalOpen(true)}
        />
      )}

      {/* Modals */}
      <TaskModal
        task={selectedTaskForModal}
        isOpen={isTaskModalOpen}
        locale={locale}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTaskForModal(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        departments={departments}
        people={people}
        projects={projects}
      />

      <MeetingModal
        meeting={selectedMeetingForModal}
        initialDate={selectedMeetingInitialDate}
        initialStartTime={selectedMeetingInitialTime}
        allMeetings={shownMeetings}
        isOpen={isMeetingModalOpen}
        locale={locale}
        onClose={() => {
          setIsMeetingModalOpen(false);
          setSelectedMeetingForModal(null);
          setSelectedMeetingInitialDate(undefined);
          setSelectedMeetingInitialTime(undefined);
        }}
        onSave={handleSaveMeeting}
        onDelete={handleDeleteMeeting}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        tasks={tasks}
        meetings={meetings}
        pages={pages}
        people={people}
        projects={projects}
        locale={locale}
        onClose={() => setIsBackupModalOpen(false)}
        onRestoreCompleted={handleRestoreCompleted}
        onImportPlannerPages={handleImportPlannerPages}
        onClearAllData={async () => {
          await localDB.clearAll();
          await clearCloudCollections(['tasks', 'meetings', 'projects', 'people', 'notebooks', 'pages']).catch(console.warn);
          const fresh = await localDB.initAndSeed();
          tasksRef.current = [];
          meetingsRef.current = [];
          setTasks([]);
          setMeetings([]);
          setProjects([]);
          setPeople([]);
          setMessages([]);
          setDepartments(INITIAL_DEPARTMENTS);
          setNotebooks(fresh.notebooks);
          setPages(fresh.pages);
          if (fresh.notebooks.length > 0) {
            setActiveNotebookId(fresh.notebooks[0].id);
            if (fresh.pages.length > 0) setActivePageId(fresh.pages[0].id);
          }
          // the blank starter notebook/page belong to the cloud workspace too
          fresh.notebooks.forEach((n) => syncNotebookToCloud(n).catch(console.warn));
          fresh.pages.forEach((p) => syncPageToCloud(p).catch(console.warn));
        }}
      />

      {/* Siri AI Voice Assistant: Draggable Floating Bubble + Minimized Background Speech + Full Window Modal */}
      <LiveVoiceModal
        isOpen={isLiveVoiceModalOpen}
        locale={locale}
        meetings={shownMeetings}
        tasks={tasks}
        onExecuteToolAction={handleExecuteToolAction}
        hideBubble={currentTab === 'assistant'}
        onClose={() => setIsLiveVoiceModalOpen(false)}
      />
    </AppShell>
  );
}
