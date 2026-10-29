/**
 * Core type definitions for Executive AI Planner
 */

export type Workstream =
  | 'Commercial + New Lands'
  | 'Projects Operations'
  | 'Ports & Logistics'
  | 'Executive Meetings & Decisions'
  | 'Corporate / Personal';

export type TaskStatus =
  | 'Pending'
  | 'In Progress'
  | 'Waiting'
  | 'On Hold'
  | 'Closed';

export type TaskPriority = 'Urgent' | 'High' | 'Normal' | 'Low';

export interface SourceReference {
  notebookId: string;
  notebookTitle?: string;
  pageId: string;
  pageNumber: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  snippetText?: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  workstream: Workstream;
  department: string;
  project: string;
  location: string;
  ownerAlias: string; // e.g. "SS", "YA", "MM", or full name
  isOwnerVerified: boolean;
  collaborators?: string[];
  counterpart?: string;
  counterpartCompany?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string; // YYYY-MM-DD or ISO
  dueTime?: string; // HH:mm
  followUpDate?: string; // YYYY-MM-DD
  startDate?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
  nextAction?: string;
  expectedDeliverable?: string;
  blocker?: string;
  progressNotes?: string[];
  tags?: string[];
  sourceRef?: SourceReference;
  linkedMeetingIds?: string[];
  /** tiny task: a quick reminder (title, comment, due 15 minutes after creation) kept in its own list */
  isTiny?: boolean;
  closureReason?: string;
  completionDate?: string;
  closureDate?: string;
  /** manual position in the task list (smaller = higher); set when the user drags or moves a task */
  sortOrder?: number;
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Meeting {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
  timezone: string; // 'Africa/Cairo'
  location?: string;
  conferenceUrl?: string;
  organizer: string;
  attendees: string[];
  department?: string;
  project?: string;
  agenda?: string;
  decisions?: string[];
  linkedActionIds?: string[];
  googleEventId?: string;
  /** when this meeting last matched its Google Calendar event */
  googleSyncedAt?: string;
  syncState: 'internal_only' | 'synced' | 'pending_sync' | 'failed';
  invitationStatus?: 'not_sent' | 'sent' | 'failed';
  recurrence?: 'none' | 'weekly' | 'monthly';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface InkPoint {
  x: number;
  y: number;
  pressure?: number;
  time?: number;
}

export interface InkStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
  points: InkPoint[];
  pageId: string;
  timestamp: number;
  /** When true, per-segment width = width * (0.6 + 0.8 * pressure); legacy strokes render constant width. */
  pressureWidth?: boolean;
}

export type NotebookTemplate =
  | 'planner_daily' // Sunday-start daily page: timed agenda, main focus, 3 goals, to-do list, notes
  | 'planner_todo' // workstream to-do list: numbered rows with due date and owner columns
  | 'planner_monthly' // month grid (Sunday start) with a notes column
  | 'planner_mom' // minutes of meeting: Task | Owner | Due Date on grid paper
  | 'planner_archive' // imported page (e.g. from a PDF planner) shown as the background
  | '2026_planner_sunday'
  | 'commercial_new_lands'
  | 'projects_operations'
  | 'meeting_elsewedy'
  | 'executive_task_sheet'
  | 'lined'
  | 'dotted'
  | 'blank';

export interface CanvasTextItem {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface PageVersion {
  id: string;
  pageId: string;
  title: string;
  strokes: InkStroke[];
  textNotes?: CanvasTextItem[];
  timestamp: string; // ISO string
  cairoTimestamp: string; // Formatted Cairo time string
  strokeCount: number;
  label?: string;
}

export type PaperStyle = 'ruled' | 'grid' | 'dotted' | 'blank';
export type PaperColor = 'cream' | 'white' | 'sepia' | 'dark';

export interface NotebookPage {
  id: string;
  notebookId: string;
  workspaceId: string;
  pageNumber: number;
  title: string;
  template: NotebookTemplate;
  strokes: InkStroke[];
  textNotes?: CanvasTextItem[];
  versions?: PageVersion[];
  linkedTaskIds: string[];
  linkedMeetingIds: string[];
  viewMode: 'handwritten' | 'structured' | 'split';
  orientation?: 'landscape' | 'portrait';
  paperStyle?: PaperStyle;
  paperColor?: PaperColor;
  /** Imported page image (JPEG data URL) drawn behind the ink, like a GoodNotes PDF page */
  backgroundImage?: string;
  /** Logical canvas size; used for imported pages so their aspect ratio is preserved */
  canvasSize?: { width: number; height: number };
  /** 'YYYY-MM-DD' for daily pages, 'YYYY-MM' for monthly pages (lets the app jump to a date) */
  plannerDate?: string;
  transcription?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Notebook {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  category: Workstream;
  pageCount: number;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: string;
  workspaceId: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  company: string;
  email?: string;
  phone?: string;
  isAliasVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  workstream: Workstream;
  country: string;
  city: string;
  stage: 'Pipeline' | 'Due Diligence' | 'Concession Negotiation' | 'EPC / Execution' | 'Operational' | 'On Hold';
  sponsor: string;
  lead: string;
  counterparties: string;
  keyMilestones?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedCandidate {
  id: string;
  pageId: string;
  entryType?: 'task' | 'meeting';
  boundingBox: { x: number; y: number; width: number; height: number };
  rawTextArabic: string;
  rawTextEnglish: string;
  suggestedTitle: string;
  suggestedWorkstream: Workstream;
  suggestedDepartment: string;
  suggestedProject: string;
  suggestedOwnerAlias: string;
  suggestedDueDate?: string;
  suggestedMeetingDate?: string;
  suggestedStartTime?: string;
  suggestedEndTime?: string;
  suggestedAttendees?: string[];
  suggestedLocation?: string;
  suggestedNextAction?: string;
  /** read from the ink: a struck-through line means Done, "ongoing" means In Progress */
  suggestedStatus?: 'Closed' | 'In Progress';
  confidenceScore: number;
  uncertainFields: string[];
  status: 'pending_review' | 'accepted' | 'rejected';
}

export interface FollowUpCadence {
  taskId: string;
  cadenceWorkingDays: number;
  lastPromptedAt?: string;
  nextScheduledAt: string;
  totalCheckIns: number;
  notesHistory: string[];
  active: boolean;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolInvocations?: {
    toolName: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
    status: 'pending' | 'success' | 'error';
    undoAvailable?: boolean;
    undoAction?: {
      action: string;
      recordId: string;
      previousData: unknown;
    };
  }[];
}

export interface VoiceCommandRecord {
  id: string;
  commandText: string;
  source: 'voice' | 'text' | 'retrigger';
  timestamp: string;
  executedTools?: string[];
  status: 'executed' | 'failed' | 'pending';
  responseSnippet?: string;
}

/** One page produced by the planner PDF importer, before it is turned into a NotebookPage. */
export interface PlannerImportPage {
  title: string;
  plannerDate?: string;
  template: NotebookTemplate;
  backgroundImage: string;
  canvasSize: { width: number; height: number };
  transcription?: string;
}
