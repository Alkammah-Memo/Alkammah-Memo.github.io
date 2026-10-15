/**
 * Executive AI Planner — Main Application Entry Point
 * @license Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Task,
  Meeting,
  Notebook,
  NotebookPage,
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
import { getCairoDateString, cairoLocalToIso, normalizeToIso, parseTimeTo24h } from './lib/cairoTime';
import { localDB } from './lib/indexedDb';
import type { WorkspaceState } from './lib/indexedDb';
import { newId, hasDuplicateName } from './lib/taskLogic';
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
  subscribeToWorkspaceCollection,
  loadRemoteGeminiSettings,
  saveRemoteGeminiSettings,
  clearCloudCollections,
  flushRetryQueue,
} from './lib/cloud';
import type { CollectionName } from './lib/cloud';
import { mergeRemote } from './lib/merge';
import { keyManager } from './lib/ai/keyManager';
import { chatWithAssistant } from './lib/ai/gemini';
import { LoginScreen } from './components/auth/LoginScreen';
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

  useEffect(() => {
    if (!isCloudConfigured) return;
    let alive = true;
    getInitialSession()
      .then((session) => {
        if (!alive) return;
        setUser(session?.user ?? null);
      })
      .finally(() => alive && setAuthReady(true));
    const off = onAuthChange((u) => alive && setUser(u));
    return () => {
      alive = false;
      off();
    };
  }, []);

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
          ? `صباح الخير بشمهندس محمد. إزاي أقدر أساعدك النهارده؟ بفكرك إن عندك اجتماع "${nextM.title}" ${timeStr ? `الساعة ${timeStr}` : ''}. تحب أجهزلك ملفات الاجتماع أو أراجع معاك نقاط النقاش؟`
          : `Good morning, Eng. Mohamed. How can I assist you today? Just reminding you that you have an upcoming meeting "${nextM.title}" ${timeStr ? `at ${timeStr}` : ''}. Would you like me to prepare briefing notes or review agenda items?`;
      }
      return lang === 'ar'
        ? 'صباح الخير بشمهندس محمد. إزاي أقدر أساعدك النهارده؟ مفيش أي اجتماعات مسجلة في جدولك للفترة القادمة، تحب أساعدك في مراجعة المهام المعلقة أو التخطيط لمهام جديدة؟'
        : 'Good morning, Eng. Mohamed. How can I assist you today? You have no upcoming meetings scheduled right now. Would you like help reviewing pending tasks or planning new work?';
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
        setTasks(state.tasks);
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
    if (!isCloudConfigured || !user || loading) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const LAST_SYNC_KEY = `alkammah_last_cloud_sync_${user.id}`;

    async function startSync() {
      // Gemini keys follow the user across devices
      keyManager.setRemoteSaver(saveRemoteGeminiSettings);
      keyManager.hydrateFromRemote(await loadRemoteGeminiSettings());
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

      const wire = <T extends { id: string; updatedAt?: string; createdAt?: string }>(
        name: CollectionName,
        getLocal: () => T[],
        apply: (merged: T[]) => void,
        persist: (items: T[]) => Promise<void>,
        push: (item: T) => Promise<void>
      ) =>
        subscribeToWorkspaceCollection<T>(name, (remote, isInitial) => {
          if (cancelled) return;
          const local = getLocal();
          if (isInitial) {
            const remoteById = new Map(remote.map((r) => [r.id, r]));
            // upload what this device created/edited while offline (or the whole workspace if the cloud is empty)
            for (const l of local) {
              const r = remoteById.get(l.id);
              const localTime = Math.max(Date.parse(l.updatedAt || '') || 0, Date.parse(l.createdAt || '') || 0);
              if ((!r && (remote.length === 0 || localTime > lastSync)) || (r && localTime > (Date.parse(r.updatedAt || '') || 0))) {
                push(l).catch(console.warn);
              }
            }
          }
          const merged = isInitial && remote.length === 0 ? local : mergeRemote(local, remote);
          apply(merged);
          void persist(merged);
        });

      unsubs.push(
        wire<Task>('tasks', () => tasksRef.current, setTasks, async (i) => { await localDB.replaceAll('tasks', i); }, syncTaskToCloud),
        wire<Meeting>('meetings', () => meetingsRef.current, setMeetings, async (i) => { await localDB.replaceAll('meetings', i); }, syncMeetingToCloud),
        wire<Notebook>('notebooks', () => notebooksRef.current, setNotebooks, async (i) => { await localDB.replaceAll('notebooks', i); }, syncNotebookToCloud),
        wire<NotebookPage>('pages', () => pagesRef.current, setPages, async (i) => { await localDB.replaceAll('pages', i); }, syncPageToCloud),
        wire<Project>('projects', () => projectsRef.current, setProjects, async (i) => { await localDB.replaceAll('projects', i); }, syncProjectToCloud),
        wire<Person>('people', () => peopleRef.current, setPeople, async (i) => { await localDB.replaceAll('people', i); }, syncPersonToCloud)
      );

      void flushRetryQueue();
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    }

    startSync().catch((err) => console.warn('Cloud sync start failed:', err));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      keyManager.setRemoteSaver(null);
      setIsCloudConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

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
    }, 6000);
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

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const previousStatus = task.status;
    const updated: Task = {
      ...task,
      status: newStatus,
      completionDate: newStatus === 'Done' ? new Date().toISOString() : undefined,
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

  const handleDeleteTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await localDB.delete('tasks', taskId);
    deleteTaskFromCloud(taskId).catch(console.warn);

    triggerUndoToast(`Deleted "${task.title}"`, async () => {
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
  };

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

    triggerUndoToast(`Deleted "${m.title}"`, async () => {
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
      title: `${targetNb.title} — Page ${newPageNum}`,
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
      status: 'Pending',
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
        organizer: 'محمد القماح',
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
        completionDate: newStatus === 'Done' ? new Date().toISOString() : newStatus ? undefined : match.completionDate,
        version: (match.version || 1) + 1,
        updatedAt: new Date().toISOString(),
      };
      tasksRef.current = tasksRef.current.map((t) => (t.id === match.id ? updated : t));
      setTasks(tasksRef.current);
      await localDB.put('tasks', updated);
      syncTaskToCloud(updated).catch(console.warn);
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
        .filter((t) => !args.overdueOnly || (!!t.dueDate && t.dueDate < today && t.status !== 'Done' && t.status !== 'Closed'))
        .slice(0, 15)
        .map((t) => ({ id: t.id, title: t.title, status: t.status, owner: t.ownerAlias, dueDate: t.dueDate }));
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
        activeTasksCount: tasks.filter((t) => t.status !== 'Done').length,
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
        content: data.content || (toolInvocations.length > 0 ? 'نفذت لحضرتك الأمر بنجاح يا قماح.' : ''),
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
          ? 'عذراً يا مشمهندس، كل مفاتيح Gemini مشغولة أو وصلت للحد حالياً. النظام هيفضل يحاول، جرّب تاني بعد لحظات.'
          : 'Sorry Eng. Mohamed, all Gemini keys are busy or rate-limited right now. The system keeps retrying; please try again in a moment.',
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
    >
      {/* Tab Views */}
      {currentTab === 'today' && (
        <TodayBriefing
          tasks={tasks}
          meetings={meetings}
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
          onDeletePage={handleDeletePage}
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
              {locale === 'ar' ? 'مركز المهام' : 'Tasks Center'} ({tasks.filter((t) => t.status !== 'Done').length})
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
          departments={departments}
        />
      )}

      {currentTab === 'calendar' && (
        <CalendarCenter
          meetings={meetings}
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
          onSignOut={() => void signOutUser()}
        />
      )}

      {currentTab === 'assistant' && (
        <ExecutiveAssistant
          messages={messages}
          tasks={tasks}
          meetings={meetings}
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
      />

      <MeetingModal
        meeting={selectedMeetingForModal}
        initialDate={selectedMeetingInitialDate}
        initialStartTime={selectedMeetingInitialTime}
        allMeetings={meetings}
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
        meetings={meetings}
        tasks={tasks}
        onExecuteToolAction={handleExecuteToolAction}
        onClose={() => setIsLiveVoiceModalOpen(false)}
      />
    </AppShell>
  );
}
