export const BACKUP_STORES = ['tasks', 'meetings', 'notebooks', 'pages', 'people', 'projects'] as const;
export type BackupStore = (typeof BACKUP_STORES)[number];

export type BackupErrorCode = 'invalid_json' | 'invalid_format' | 'invalid_records' | 'empty';

export interface ParsedBackup {
  stores: Partial<Record<BackupStore, Array<{ id: string }>>>;
  messages?: Array<{ id: string }>;
  departments?: string[];
}

export type BackupParseResult =
  | { ok: true; backup: ParsedBackup }
  | { ok: false; code: BackupErrorCode; detail?: string };

function isRecordArray(v: unknown): v is Array<{ id: string }> {
  return (
    Array.isArray(v) &&
    v.every((r) => typeof r === 'object' && r !== null && !Array.isArray(r) && typeof (r as { id?: unknown }).id === 'string' && (r as { id: string }).id.length > 0)
  );
}

/** Validates a backup file. The whole file is rejected if anything in it is malformed. */
export function parseBackup(json: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, code: 'invalid_json' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, code: 'invalid_format' };
  const data = (parsed as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, code: 'invalid_format' };
  const d = data as Record<string, unknown>;

  const stores: ParsedBackup['stores'] = {};
  for (const name of BACKUP_STORES) {
    if (d[name] === undefined || d[name] === null) continue;
    if (!isRecordArray(d[name])) return { ok: false, code: 'invalid_records', detail: name };
    stores[name] = d[name] as Array<{ id: string }>;
  }
  const backup: ParsedBackup = { stores };
  if (d.messages !== undefined && d.messages !== null) {
    if (!isRecordArray(d.messages)) return { ok: false, code: 'invalid_records', detail: 'messages' };
    backup.messages = d.messages;
  }
  if (d.departments !== undefined && d.departments !== null) {
    if (!Array.isArray(d.departments) || !d.departments.every((x) => typeof x === 'string')) {
      return { ok: false, code: 'invalid_records', detail: 'departments' };
    }
    backup.departments = d.departments as string[];
  }
  if (Object.keys(stores).length === 0) return { ok: false, code: 'empty' };
  return { ok: true, backup };
}
