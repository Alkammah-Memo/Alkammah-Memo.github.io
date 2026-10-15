import { Notebook, NotebookPage, Person, Project, Task, Meeting } from '../types';

// Starter documents carry an epoch timestamp so a freshly seeded device never overwrites real cloud data
const SEED_EPOCH = '1970-01-01T00:00:00.000Z';

export const INITIAL_WORKSTREAMS = [
  'Commercial + New Lands',
  'Projects Operations',
  'Ports & Logistics',
  'Executive Meetings & Decisions',
  'Corporate / Personal',
] as const;

export const INITIAL_DEPARTMENTS = [
  'Commercial',
  'Business Development',
  'Projects',
  'Operations',
  'Logistics',
  'Ports',
  'Legal',
  'Finance',
  'HR',
  'Administration',
];

// Clean pristine initial state - zero fake or dummy data
export const INITIAL_PEOPLE: Person[] = [];

export const INITIAL_PROJECTS: Project[] = [];

export const INITIAL_TASKS: Task[] = [];

export const INITIAL_MEETINGS: Meeting[] = [];

export const INITIAL_NOTEBOOKS: Notebook[] = [
  {
    id: 'nb-primary',
    workspaceId: 'default-ws',
    title: 'Executive Notebook',
    description: 'Executive ruled handwriting canvas',
    category: 'Commercial + New Lands',
    pageCount: 1,
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
  },
];

export const INITIAL_PAGES: NotebookPage[] = [
  {
    id: 'page-1',
    notebookId: 'nb-primary',
    workspaceId: 'default-ws',
    pageNumber: 1,
    title: 'Page 1',
    template: 'lined',
    strokes: [],
    textNotes: [],
    versions: [],
    linkedTaskIds: [],
    linkedMeetingIds: [],
    viewMode: 'split',
    createdBy: 'executive-user',
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
  },
];
