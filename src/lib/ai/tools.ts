/**
 * Shared Spero executive tool declarations and system prompts (chat, fast voice, Live voice).
 */
import { Type } from '@google/genai';

export const WORKSTREAMS = [
  'Commercial + New Lands',
  'Projects Operations',
  'Ports & Logistics',
  'Executive Meetings & Decisions',
  'Corporate / Personal',
];

const TASK_STATUSES = ['Pending', 'In Progress', 'Waiting', 'On Hold', 'Done', 'Closed'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EXECUTIVE_TOOLS: any = [
  {
    functionDeclarations: [
      {
        name: 'createTask',
        description: 'Create a new executive task with workstream, owner, project, and status',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Task title' },
            description: { type: Type.STRING },
            workstream: { type: Type.STRING, enum: WORKSTREAMS },
            department: { type: Type.STRING },
            project: { type: Type.STRING },
            ownerAlias: { type: Type.STRING, description: 'Owner initials or full name' },
            priority: { type: Type.STRING, enum: ['Urgent', 'High', 'Normal', 'Low'] },
            dueDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            nextAction: { type: Type.STRING },
            counterpart: { type: Type.STRING },
          },
          required: ['title'],
        },
      },
      {
        name: 'deleteTask',
        description: 'Delete an existing executive task by ID or title keyword',
        parameters: {
          type: Type.OBJECT,
          properties: {
            taskId: { type: Type.STRING, description: 'Task ID to delete' },
            taskTitleKeyword: { type: Type.STRING, description: 'Keyword to search and delete task' },
          },
        },
      },
      {
        name: 'updateTask',
        description: 'Update fields of an existing task by ID',
        parameters: {
          type: Type.OBJECT,
          properties: {
            taskId: { type: Type.STRING },
            title: { type: Type.STRING },
            status: { type: Type.STRING, enum: TASK_STATUSES },
            dueDate: { type: Type.STRING },
            nextAction: { type: Type.STRING },
            ownerAlias: { type: Type.STRING },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'setTaskStatus',
        description: 'Change the status of a task by ID or title match',
        parameters: {
          type: Type.OBJECT,
          properties: {
            taskId: { type: Type.STRING, description: 'Task ID if known' },
            taskTitleKeyword: { type: Type.STRING, description: 'Keyword to search if ID unknown' },
            newStatus: { type: Type.STRING, enum: TASK_STATUSES },
            closureReason: { type: Type.STRING },
          },
          required: ['newStatus'],
        },
      },
      {
        name: 'searchTasks',
        description: 'Search tasks by workstream, department, status, owner alias, or keyword',
        parameters: {
          type: Type.OBJECT,
          properties: {
            workstream: { type: Type.STRING },
            department: { type: Type.STRING },
            status: { type: Type.STRING },
            ownerAlias: { type: Type.STRING },
            keyword: { type: Type.STRING },
            overdueOnly: { type: Type.BOOLEAN },
          },
        },
      },
      {
        name: 'createMeeting',
        description:
          'Schedule a new executive meeting. Times are Cairo time unless an explicit UTC offset or Z is given.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            start: { type: Type.STRING, description: 'Cairo local YYYY-MM-DDTHH:mm:00 or ISO with offset' },
            end: { type: Type.STRING, description: 'Cairo local YYYY-MM-DDTHH:mm:00 or ISO with offset' },
            location: { type: Type.STRING },
            attendees: { type: Type.ARRAY, items: { type: Type.STRING } },
            project: { type: Type.STRING },
            agenda: { type: Type.STRING },
          },
          required: ['title', 'start'],
        },
      },
      {
        name: 'deleteMeeting',
        description: 'Delete a calendar meeting by ID or title keyword',
        parameters: {
          type: Type.OBJECT,
          properties: {
            meetingId: { type: Type.STRING, description: 'Meeting ID to delete' },
            meetingTitleKeyword: { type: Type.STRING, description: 'Keyword to find meeting to delete' },
          },
        },
      },
      {
        name: 'rescheduleMeeting',
        description: 'Reschedule an existing meeting by updating its start and end times without duplicating',
        parameters: {
          type: Type.OBJECT,
          properties: {
            meetingId: { type: Type.STRING, description: 'Existing meeting ID' },
            meetingTitleKeyword: { type: Type.STRING, description: 'Keyword to match meeting if ID unknown' },
            newStart: { type: Type.STRING, description: 'New start, Cairo local YYYY-MM-DDTHH:mm:00 or ISO with offset' },
            newEnd: { type: Type.STRING, description: 'New end, Cairo local or ISO with offset' },
          },
          required: ['newStart'],
        },
      },
      {
        name: 'navigateTo',
        description: 'Open a tab/page of the app. tab: today (daily briefing), notebook (notes & ink), planner (tasks & calendar), tasks, calendar, followup, directory, settings.',
        parameters: { type: Type.OBJECT, properties: { tab: { type: Type.STRING, enum: ['today', 'notebook', 'planner', 'tasks', 'calendar', 'followup', 'directory', 'settings'] } }, required: ['tab'] },
      },
      {
        name: 'openItem',
        description: 'Open the edit window of an existing task or meeting on screen.',
        parameters: { type: Type.OBJECT, properties: { kind: { type: Type.STRING, enum: ['task', 'meeting'] }, id: { type: Type.STRING }, keyword: { type: Type.STRING } }, required: ['kind'] },
      },
      {
        name: 'closeWindows',
        description: 'Close any open task or meeting window or dialog (the Spero voice window is closed by closeAssistant).',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'closeAssistant',
        description: 'Close the Spero voice window when the user asks to end or close the conversation.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'listMeetings',
        description: 'Read meetings from the calendar. Filter by date range (YYYY-MM-DD, Cairo) and/or keyword. Use it whenever asked what is scheduled.',
        parameters: { type: Type.OBJECT, properties: { fromDate: { type: Type.STRING }, toDate: { type: Type.STRING }, keyword: { type: Type.STRING } } },
      },
      {
        name: 'updateMeeting',
        description: 'Edit the details of an existing meeting (title, location, attendees, agenda, description, project). Use rescheduleMeeting for time changes.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            meetingId: { type: Type.STRING },
            meetingTitleKeyword: { type: Type.STRING },
            title: { type: Type.STRING },
            location: { type: Type.STRING },
            attendees: { type: Type.ARRAY, items: { type: Type.STRING } },
            agenda: { type: Type.STRING },
            description: { type: Type.STRING },
            project: { type: Type.STRING },
          },
        },
      },
      {
        name: 'getMeetingBriefing',
        description: 'Get a meeting with its attendees, agenda and the open tasks related to its project/title, so you can give preparation tips and talking points.',
        parameters: { type: Type.OBJECT, properties: { meetingId: { type: Type.STRING }, meetingTitleKeyword: { type: Type.STRING } } },
      },
      {
        name: 'archiveTask',
        description: 'Archive (hide without deleting) a task, or restore it with archived=false.',
        parameters: { type: Type.OBJECT, properties: { taskId: { type: Type.STRING }, taskTitleKeyword: { type: Type.STRING }, archived: { type: Type.BOOLEAN } } },
      },
    ],
  },
  { googleSearch: {} },
];

/** Function-only declarations for REST calls (chat / fast voice), where mixing in search is not guaranteed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EXECUTIVE_FUNCTION_TOOLS: any = [EXECUTIVE_TOOLS[0]];

export function cairoNowLabel(): string {
  return new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
}

export function cairoNowIsoLabel(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo', hour12: false });
}

export const SPERO_PERSONA = `أنتِ "سبيرو" (Spero)، المساعدة التنفيذية للمهندس محمد القماح (المدير التنفيذي).
الأسلوب المطلوب دائماً: رسمي، مهني، حازم وواضح، مع الحفاظ على اللباقة والتعاون. تحدثي باللهجة المصرية المهذبة الراقية (لهجة مصرية رسمية مهنية كما تتحدث سكرتيرة تنفيذية محترفة في القاهرة)، وليس بالفصحى الثقيلة، بنبرة هادئة وثابتة وعملية تناسب مكاتب الإدارة العليا، وتجنبي تماماً الألفاظ الشعبية والتعبيرات الدارجة والمزاح والمبالغة في المجاملة.
خاطبيه دائماً بـ "المهندس محمد" أو "حضرتك". ممنوع استخدام ألقاب أو عبارات غير رسمية مثل "يا قماح" أو "يا باشا".
الردود موجزة ومباشرة: ابدئي بالنتيجة أو الإجراء المنفّذ ثم الأهم من التفاصيل، دون حشو أو تكرار. لا تقولي "تمام" أو "أكيد"؛ استخدمي صيغاً مثل "تم"، "حاضر"، "بالتأكيد"، "لقد قمتُ بـ".
إذا كان الطلب غير واضح أو ناقصاً (التاريخ أو الوقت أو الاسم)، اطلبي التوضيح بسؤال محدد واحد قبل التنفيذ. وعند وجود تعارض في المواعيد نبّهي إليه بوضوح.
راجعي دائماً جدول الاجتماعات والمهام الوارد في سياق النظام بدقة. لا تختلقي أي اجتماع أو مهمة أو رقم غير موجود في السياق، وإذا لم تتوفر المعلومة فاذكري ذلك بصراحة.
كل التواريخ والمواعيد بتوقيت القاهرة (Africa/Cairo). إذا خاطبكِ بالإنجليزية فردّي بالعربية المصرية المهذبة ما لم يطلب غير ذلك.
قواعد الضمائر والتأنيث والتذكير (التزمي بها بدقة في كل جملة):
- أنتِ مؤنث، فاستخدمي صيغة المؤنث عند الحديث عن نفسك: "أنا جاهزة"، "قمتُ بـ"، "سجّلتُ"، "راجعتُ"، "سأتابع".
- المهندس محمد مذكّر، فخاطبيه بصيغة المذكر دائماً: "حضرتك"، "لديك"، "عندك"، "تفضّل"، "هل تريد".
- المواعيد والمهام والاجتماعات تخصّه هو لا أنتِ، فقولي "لديك اجتماع" أو "عندك اجتماع" وليس "لديّ" أو "عندي" أبداً.
- عند ذكر أي شخص آخر طابقي اللقب والضمائر والأفعال مع جنسه: "الأستاذ/الأستاذة"، "المهندس/المهندسة"، "الدكتور/الدكتورة"، "السيد/السيدة"، و"هو/هي"، "له/لها"، "معه/معها". استدلّي على الجنس من الاسم ومن سياق النظام، وإن لم يتّضح فكرّري الاسم بدل استخدام ضمير قد يخطئ.`;

export const SPERO_TOOL_RULES = `قواعد التنفيذ (يجب استدعاء الأداة المناسبة فعلياً، ولا تذكري أنك نفّذتِ إجراءً دون استدعائها):
1. إضافة مهمة: createTask.
2. حذف مهمة: deleteTask.
3. تغيير حالة مهمة أو تعديلها: setTaskStatus أو updateTask.
4. عند طلب اجتماع: لا تستدعي createMeeting قبل أن تعرفي (أ) مع مَن الاجتماع و(ب) موضوعه، إضافة إلى التاريخ والوقت؛ اسألي عن الناقص منها بسؤال واحد موجز، ثم اكتبي العنوان بصيغة "اجتماع مع [الاسم] - [الموضوع]" وضعي الأسماء في attendees. إضافة اجتماع أو موعد: createMeeting (التوقيت بتوقيت القاهرة وبصيغة YYYY-MM-DDTHH:mm:00).
5. إلغاء اجتماع: deleteMeeting.
6. تعديل موعد: rescheduleMeeting على الاجتماع نفسه دون تكرار.
7. أنتِ مساعدة شخصية بصلاحيات كاملة على النظام: تقرئين وتضيفين وتعدّلين وتحذفين وتؤرشفين المهام والاجتماعات، وتنتقلين بين الصفحات (navigateTo) وتفتحين العناصر (openItem) وتغلقين النوافذ (closeWindows/closeAssistant). نفّذي أي طلب يخص النظام بالأداة المناسبة دون اعتذار.
7أ. عند السؤال عن اجتماع أو التحضير له: استدعي getMeetingBriefing ثم قدّمي نصائح عملية موجزة (أهم نقاط النقاش، المهام المفتوحة المرتبطة، أسئلة يجب طرحها، قرارات مطلوبة).
7ب. لأي سؤال عام أو معلومة خارجية أو أخبار أو أسعار: ابحثي في الإنترنت (البحث متاح لكِ) وأجيبي بإيجاز مع ذكر أن المعلومة من البحث.
7ج. بعد عودة نتيجة الأداة، أكّدي التنفيذ بجملة رسمية موجزة تتضمن العنوان والموعد. إذا لم تُرجع الأداة نتيجة مطابقة، فأبلغيه بوضوح أنه لم يتم العثور على عنصر بهذا الاسم ولم يُنفَّذ أي إجراء.
8. قبل حذف أي عنصر، تأكدي من أن الطلب صريح وأن الاسم المطابق واحد؛ وإن تعدد التطابق فاطلبي التحديد.`;

export function chatSystemInstruction(): string {
  return `${SPERO_PERSONA}\nالتوقيت الحالي في القاهرة: ${cairoNowLabel()} (ISO محلي: ${cairoNowIsoLabel()}).\n${SPERO_TOOL_RULES}`;
}

export function liveSystemInstruction(): string {
  return `${SPERO_PERSONA}\nالتوقيت الحالي في القاهرة: ${cairoNowLabel()} (ISO محلي: ${cairoNowIsoLabel()}).\nلديكِ تحكّم كامل في السيستم والتقويم والمهام.\n${SPERO_TOOL_RULES}`;
}
