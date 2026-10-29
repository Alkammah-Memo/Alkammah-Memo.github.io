import type { Person } from '../types';

/** The people of the Directory, kept here so handwriting reading and task forms share one source of truth. */
let people: Person[] = [];

export function setDirectoryPeople(list: Person[]): void {
  people = list;
}

const norm = (v: string) => v.replace(/[.\s_\-]/g, '').toUpperCase();
const words = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Turns handwritten owner initials ("YA", "A.Z.", "YA, MM") into the full names of the matching people in the Directory.
 * An alias that matches nobody, or more than one person, is kept as written so nothing is invented.
 */
export function resolveOwners(raw: string, list: Person[] = people): string {
  const active = list.filter((p) => p.isActive !== false);
  const parts = (raw || '').split(/[,،/&+]+|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return raw;
  const out = parts.map((tok) => {
    if (tok === 'Unassigned') return tok;
    const byInitials = active.filter((p) => p.initials && norm(p.initials) === norm(tok));
    if (byInitials.length === 1) return byInitials[0].name;
    if (byInitials.length > 1) return tok;
    const byName = active.filter((p) => words(p.name) === words(tok));
    if (byName.length === 1) return byName[0].name;
    const first = active.filter((p) => words(p.name).split(' ')[0] === words(tok));
    if (first.length === 1 && tok.length > 2) return first[0].name;
    return tok;
  });
  return [...new Set(out)].join(', ');
}

/** one line for the handwriting prompt, so the model reads initials as the registered aliases */
export function directoryHint(list: Person[] = people): string {
  const rows = list.filter((p) => p.isActive !== false && p.initials).map((p) => `${p.initials} = ${p.name}`);
  return rows.length ? `\n\nREGISTERED ALIASES (the initials he uses, and who they are): ${rows.join('; ')}. When owner initials match one of these, copy the initials exactly as registered.` : '';
}
